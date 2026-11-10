/**
 * External account sign-in for the welcome window: a loopback redirect the
 * browser can reach, the credential exchange a profile plugin already serves,
 * and the workspace entry that follows a completed exchange. The shell knows
 * none of the vendor's protocol — the descriptor names the plugin's endpoints,
 * and the plugin owns token storage and renewal.
 *
 * @module external-sign-in
 */

import { createServer } from 'node:http'

/** Vendor endpoints the desktop profile's plugin serves for one external sign-in. */
export interface ExternalSignInDescriptor {
  /** Host-relative RPC path accepting `{ endpoint, ...payload }` JSON requests. */
  readonly rpcPath: string
  /** Endpoint reporting whether the sign-in service is present on this Host. */
  readonly probeEndpoint: string
  /** Endpoint that starts an attempt with the loopback `origin`. */
  readonly startEndpoint: string
  /** Endpoint that exchanges the authorization code for stored credentials. */
  readonly completeEndpoint: string
  /** Loopback path the vendor redirects to; it must match the plugin's redirect URI. */
  readonly callbackPath: string
  /** How long the browser may take before the attempt fails. */
  readonly timeoutMs: number
}

/** One attempt's authorization URL and the state its callback must echo. */
export interface ExternalSignInAttempt {
  readonly url: string
  readonly state: string
}

/** The plugin-owned half of the flow. */
export interface ExternalSignInChannel {
  /** @returns true when this Host serves the descriptor's endpoints. */
  available(): Promise<boolean>
  /** @param origin - loopback origin the vendor redirects to. @returns the authorization URL. */
  start(origin: string): Promise<ExternalSignInAttempt>
  /**
   * Exchange one authorization code for stored credentials.
   * @param code - authorization code from the browser callback.
   * @param state - state this attempt started with.
   */
  complete(code: string, state: string): Promise<void>
}

/** Shell effects and copy one attempt needs. */
export interface ExternalSignInOptions {
  readonly descriptor: ExternalSignInDescriptor
  readonly channel: ExternalSignInChannel
  /**
   * Open the authorization URL in the user's browser.
   * @param url - authorization URL from the channel.
   */
  openExternal(url: string): Promise<void>
  /** @returns completion once the workspace is visible. */
  enterWorkspace(): Promise<void>
  /** @returns the wordless document the browser shows after a completed redirect. */
  completionPage(): string
}

/** Outcome of one attempt; the welcome window renders failure as a retry offer. */
export type ExternalSignInResult = 'entered' | 'failed'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read the authorization code from one callback request.
 * @param request - loopback request.
 * @param callbackPath - the only path this attempt answers.
 * @returns the code and echoed state, or undefined for a request this attempt ignores.
 */
function callbackOf(request: { method?: string | undefined; url?: string | undefined }, callbackPath: string):
{ readonly code: string; readonly state: string } | undefined {
  if (request.method !== 'GET') return undefined
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname !== callbackPath) return undefined
  const code = url.searchParams.get('code')
  if (code === null) return undefined
  return { code, state: url.searchParams.get('state') ?? '' }
}

/**
 * Run one loopback callback attempt.
 * @param options - descriptor, channel, and shell effects for this attempt.
 * @returns the authorization outcome once the exchange settles.
 */
async function attemptSignIn(options: ExternalSignInOptions, signal: AbortSignal): Promise<ExternalSignInResult> {
  const { descriptor, channel } = options
  let settle: ((value: { code: string; state: string } | undefined) => void) | undefined
  const callback = new Promise<{ code: string; state: string } | undefined>((resolve) => { settle = resolve })
  let answered = false
  const server = createServer((request, response) => {
    const received = callbackOf(request, descriptor.callbackPath)
    if (received === undefined || answered) {
      response.writeHead(404).end()
      return
    }
    answered = true
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', connection: 'close' })
      .end(options.completionPage())
    settle?.(received)
  })
  const timer = setTimeout(() => { settle?.(undefined) }, descriptor.timeoutMs)
  const abandon = (): void => { settle?.(undefined) }
  signal.addEventListener('abort', abandon, { once: true })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    // A listening stream server always has a port; a pipe or closed handler has none to redirect to.
    if (address === null || typeof address === 'string') return 'failed'
    const attempt = await channel.start(`http://127.0.0.1:${String(address.port)}`)
    // A cancel or timeout settles the callback while the browser is still starting; the
    // attempt then stops waiting for a redirect nobody will send.
    await Promise.race([options.openExternal(attempt.url), callback.then(() => undefined)])
    const received = await callback
    // A callback that echoes another state belongs to a different attempt, so it cannot
    // enter this workspace; the vendor's own refusal is the only other report.
    if (signal.aborted || received === undefined || received.state !== attempt.state) return 'failed'
    await channel.complete(received.code, received.state)
    await options.enterWorkspace()
    return 'entered'
  } catch {
    // Start, redirect, exchange, and workspace failures are one retryable outcome here:
    // the browser may already show a vendor error page this process cannot inspect.
    return 'failed'
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abandon)
    server.closeAllConnections()
    server.close()
  }
}

/** One in-flight external sign-in attempt, owned by the welcome window. */
export class ExternalSignIn {
  private running: Promise<ExternalSignInResult> | undefined
  private controller: AbortController | undefined
  private readonly options: ExternalSignInOptions

  /** @param options - descriptor, channel, and shell effects shared by every attempt. */
  constructor(options: ExternalSignInOptions) {
    this.options = options
  }

  /**
   * Start or join the current attempt.
   * @returns the attempt's outcome; a cancelled attempt reports failure.
   */
  signIn(): Promise<ExternalSignInResult> {
    if (this.running !== undefined) return this.running
    const controller = new AbortController()
    this.controller = controller
    this.running = attemptSignIn(this.options, controller.signal).finally(() => {
      if (this.controller !== controller) return
      this.controller = undefined
      this.running = undefined
    })
    return this.running
  }

  /**
   * Abandon the current attempt and free the window to start another. The
   * callback listener closes immediately, so a late redirect reaches no one.
   */
  cancel(): void {
    if (this.controller === undefined) return
    const controller = this.controller
    this.controller = undefined
    this.running = undefined
    controller.abort()
  }
}

/**
 * Ask whether the profile serves the sign-in endpoints, without letting one
 * wedged request keep the welcome window from opening.
 * @param channel - plugin-backed channel.
 * @param timeoutMs - how long the answer may take before it counts as absent.
 * @returns the probe result, or false once the timeout passes.
 */
export async function probeExternalSignIn(
  channel: ExternalSignInChannel,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => { resolve(false) }, timeoutMs)
  })
  try {
    return await Promise.race([channel.available(), expired])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Build the vendor channel over the Host's cookie-authenticated RPC.
 * @param hostUrl - URL of the running Desktop Host; only its origin is used.
 * @param cookie - authenticated Host cookie.
 * @param descriptor - vendor endpoints.
 * @param send - HTTP client for Host requests.
 * @returns the plugin-backed channel.
 */
export function connectExternalSignIn(
  hostUrl: string,
  cookie: string,
  descriptor: ExternalSignInDescriptor,
  send: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): ExternalSignInChannel {
  const origin = new URL(hostUrl).origin
  const call = async (endpoint: string, payload: Record<string, unknown>): Promise<unknown> => {
    const response = await send(new URL(descriptor.rpcPath, origin).href, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ endpoint, ...payload }),
    })
    if (!response.ok) throw new Error(`desktop external sign-in: ${endpoint} failed with ${String(response.status)}`)
    const envelope: unknown = await response.json()
    if (!record(envelope) || envelope.ok !== true) {
      throw new Error(`desktop external sign-in: ${endpoint} did not accept the request`)
    }
    return envelope.value
  }
  return {
    async available() {
      try {
        await call(descriptor.probeEndpoint, {})
        return true
      } catch {
        // A Host without the profile's plugin refuses this path, and the welcome window
        // then keeps its stock entries rather than offering a route that cannot work.
        return false
      }
    },
    async start(origin) {
      const value = await call(descriptor.startEndpoint, { origin })
      if (!record(value) || typeof value.url !== 'string' || typeof value.state !== 'string') {
        throw new Error('desktop external sign-in: start returned an invalid attempt')
      }
      return { url: value.url, state: value.state }
    },
    async complete(code, state) {
      await call(descriptor.completeEndpoint, { code, state })
    },
  }
}
