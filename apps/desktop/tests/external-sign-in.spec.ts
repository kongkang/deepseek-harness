/** Desktop external account sign-in: loopback callback, plugin RPC, and workspace entry. */

import { describe, expect, it, vi } from 'vitest'
import {
  connectExternalSignIn,
  ExternalSignIn,
  probeExternalSignIn,
  type ExternalSignInChannel,
  type ExternalSignInDescriptor,
} from '../src/external-sign-in.ts'

const descriptor: ExternalSignInDescriptor = {
  rpcPath: '/api/plugin',
  probeEndpoint: 'provider.status',
  startEndpoint: 'provider.start',
  completeEndpoint: 'provider.complete',
  callbackPath: '/api/plugin/oauth/callback',
  timeoutMs: 30,
}

function envelope(value: unknown, ok = true): Response {
  return Response.json(ok ? { ok: true, value } : { ok: false, error: 'refused' })
}

/** @returns the JSON payload the channel sent, for request assertions. */
function bodyOf(init: RequestInit | undefined): unknown {
  return JSON.parse(init?.body as string) as unknown
}

describe('desktop external sign-in channel', () => {
  it('probes the plugin, starts an attempt, and exchanges the code over the Host cookie', async () => {
    const send = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async (_input, init) => {
      const request = bodyOf(init) as { endpoint: string }
      if (request.endpoint === 'provider.status') return envelope({})
      if (request.endpoint === 'provider.start') return envelope({ url: 'https://vendor/authorize?x=1', state: 'abc' })
      if (request.endpoint === 'provider.complete') return envelope({ connected: true })
      return new Response(null, { status: 404 })
    })
    const channel = connectExternalSignIn('http://127.0.0.1:9999/host', 'session=1', descriptor, send)
    expect(await channel.available()).toBe(true)
    expect(await channel.start('http://127.0.0.1:4100')).toEqual({ url: 'https://vendor/authorize?x=1', state: 'abc' })
    await channel.complete('code-1', 'abc')
    expect(send.mock.calls.map(([input]) => input)).toEqual([
      'http://127.0.0.1:9999/api/plugin',
      'http://127.0.0.1:9999/api/plugin',
      'http://127.0.0.1:9999/api/plugin',
    ])
    expect(send.mock.calls[1]![1]).toMatchObject({ method: 'POST', redirect: 'error' })
    expect((send.mock.calls[1]![1]?.headers) as Record<string, string>).toMatchObject({ cookie: 'session=1' })
    expect(bodyOf(send.mock.calls[1]![1])).toEqual({
      endpoint: 'provider.start', origin: 'http://127.0.0.1:4100',
    })
    expect(bodyOf(send.mock.calls[2]![1])).toEqual({
      endpoint: 'provider.complete', code: 'code-1', state: 'abc',
    })
  })

  it('reports an absent plugin and refuses malformed answers', async () => {
    const channel = connectExternalSignIn('http://127.0.0.1:9999', 'session=1', descriptor,
      async () => new Response(null, { status: 404 }))
    expect(await channel.available()).toBe(false)
    await expect(channel.start('http://127.0.0.1:4100')).rejects.toThrow('failed with 404')

    const refused = connectExternalSignIn('http://127.0.0.1:9999', 'session=1', descriptor,
      async () => envelope(null, false))
    await expect(refused.start('http://127.0.0.1:4100')).rejects.toThrow('did not accept the request')

    const malformed = connectExternalSignIn('http://127.0.0.1:9999', 'session=1', descriptor,
      async () => Response.json({ ok: true, value: { url: 'https://vendor/authorize' } }))
    await expect(malformed.start('http://127.0.0.1:4100')).rejects.toThrow('invalid attempt')

    const notAnEnvelope = connectExternalSignIn('http://127.0.0.1:9999', 'session=1', descriptor,
      async () => Response.json([1, 2]))
    await expect(notAnEnvelope.complete('code-1', 'abc')).rejects.toThrow('did not accept the request')
  })
})

interface Harness {
  readonly signIn: ExternalSignIn
  readonly channel: ExternalSignInChannel & {
    readonly start: ReturnType<typeof vi.fn<(origin: string) => Promise<{ url: string; state: string }>>>
    readonly complete: ReturnType<typeof vi.fn<(code: string, state: string) => Promise<void>>>
  }
  readonly openExternal: ReturnType<typeof vi.fn<(url: string) => Promise<void>>>
  readonly enterWorkspace: ReturnType<typeof vi.fn<() => Promise<void>>>
  readonly origin: () => string
}

function harness(overrides: {
  start?: (origin: string) => Promise<{ url: string; state: string }>
  complete?: (code: string, state: string) => Promise<void>
  enterWorkspace?: () => Promise<void>
  timeoutMs?: number
} = {}): Harness {
  let origin = ''
  const channel = {
    available: async () => true,
    start: vi.fn(async (value: string) => {
      origin = value
      return overrides.start === undefined ? { url: 'https://vendor/authorize?client=1', state: 'state-1' } : overrides.start(value)
    }),
    complete: vi.fn(overrides.complete ?? (async () => {})),
  }
  const openExternal = vi.fn(async (_url: string) => {})
  const enterWorkspace = vi.fn(overrides.enterWorkspace ?? (async () => {}))
  return {
    origin: () => origin,
    channel,
    openExternal,
    enterWorkspace,
    signIn: new ExternalSignIn({
      descriptor: { ...descriptor, ...overrides.timeoutMs === undefined ? {} : { timeoutMs: overrides.timeoutMs } },
      channel,
      openExternal,
      enterWorkspace,
      completionPage: () => '<!doctype html><title>done</title>',
    }),
  }
}

/** @returns the redirect the vendor performs once the browser finishes authorization. */
async function redirect(origin: string, query: string, path = descriptor.callbackPath): Promise<Response> {
  return fetch(`${origin}${path}?${query}`, { redirect: 'manual' })
}

describe('desktop external sign-in availability', () => {
  const idle: ExternalSignInChannel = {
    available: async () => true,
    start: async () => ({ url: 'https://vendor/authorize', state: 'state-1' }),
    complete: async () => {},
  }

  it('reports the plugin as soon as it answers', async () => {
    expect(await probeExternalSignIn(idle, 50)).toBe(true)
    expect(await probeExternalSignIn({ ...idle, available: async () => false }, 50)).toBe(false)
  })

  it('treats a probe that never answers as absent', async () => {
    const wedged = { ...idle, available: () => new Promise<boolean>(() => {}) }
    expect(await probeExternalSignIn(wedged, 10)).toBe(false)
  })
})

describe('desktop external sign-in attempt', () => {
  it('enters the workspace after the browser redirects with the started state', async () => {
    const surface = harness()
    surface.openExternal.mockImplementation(async (url) => {
      expect(url).toBe('https://vendor/authorize?client=1')
      const response = await redirect(surface.origin(), 'code=code-1&state=state-1')
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('done')
    })
    await expect(surface.signIn.signIn()).resolves.toBe('entered')
    expect(surface.channel.start).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/u))
    expect(surface.channel.complete).toHaveBeenCalledExactlyOnceWith('code-1', 'state-1')
    expect(surface.enterWorkspace).toHaveBeenCalledOnce()
    await expect(fetch(surface.origin())).rejects.toThrow()
  })

  it('serves only its callback path while waiting', async () => {
    const surface = harness({ timeoutMs: 2000 })
    const statuses: number[] = []
    const finished = Promise.withResolvers<undefined>()
    surface.openExternal.mockImplementation(async () => {
      statuses.push((await redirect(surface.origin(), 'code=code-1&state=state-1', '/somewhere/else')).status)
      statuses.push((await fetch(`${surface.origin()}${descriptor.callbackPath}`, { method: 'POST' })).status)
      statuses.push((await redirect(surface.origin(), 'state=state-1')).status)
      statuses.push((await redirect(surface.origin(), 'code=code-1&state=state-1')).status)
      finished.resolve(undefined)
    })
    await expect(surface.signIn.signIn()).resolves.toBe('entered')
    await finished.promise
    expect(statuses).toEqual([404, 404, 404, 200])
  })

  it('refuses a redirect that echoes another attempt state', async () => {
    const surface = harness()
    surface.openExternal.mockImplementation(async () => {
      expect((await redirect(surface.origin(), 'code=code-1&state=other')).status).toBe(200)
    })
    await expect(surface.signIn.signIn()).resolves.toBe('failed')
    expect(surface.channel.complete).not.toHaveBeenCalled()
    expect(surface.enterWorkspace).not.toHaveBeenCalled()
  })

  it('gives up when the browser never redirects', async () => {
    const surface = harness({ timeoutMs: 10 })
    await expect(surface.signIn.signIn()).resolves.toBe('failed')
    expect(surface.channel.complete).not.toHaveBeenCalled()
  })

  it.each([
    ['the plugin refuses to start', { start: async () => { throw new Error('no plugin') } }],
    ['the browser cannot open', {}],
    ['the exchange fails', { complete: async () => { throw new Error('expired') } }],
    ['the workspace does not open', { enterWorkspace: async () => { throw new Error('no window') } }],
  ] as const)('reports failure when %s', async (_case, overrides) => {
    const surface = harness(overrides)
    if (_case === 'the browser cannot open') {
      surface.openExternal.mockRejectedValue(new Error('no browser'))
    } else {
      surface.openExternal.mockImplementation(async () => {
        await redirect(surface.origin(), 'code=code-1&state=state-1')
      })
    }
    await expect(surface.signIn.signIn()).resolves.toBe('failed')
  })

  it('starts a fresh attempt after a cancel', async () => {
    const surface = harness()
    let opened = 0
    surface.openExternal.mockImplementation(async () => {
      opened++
      if (opened === 1) return
      await redirect(surface.origin(), 'code=code-2&state=state-1')
    })
    const abandoned = surface.signIn.signIn()
    await vi.waitFor(() => { expect(surface.channel.start).toHaveBeenCalledOnce() })
    surface.signIn.cancel()
    await expect(abandoned).resolves.toBe('failed')
    await expect(surface.signIn.signIn()).resolves.toBe('entered')
    expect(surface.channel.complete).toHaveBeenCalledExactlyOnceWith('code-2', 'state-1')
    expect(surface.channel.start).toHaveBeenCalledTimes(2)
  })

  it('joins the attempt already in flight and cannot enter after a cancel', async () => {
    const surface = harness()
    const cancelled = Promise.withResolvers<undefined>()
    surface.openExternal.mockImplementation(async () => {
      await cancelled.promise
      await redirect(surface.origin(), 'code=code-1&state=state-1')
    })
    const first = surface.signIn.signIn()
    const second = surface.signIn.signIn()
    await vi.waitFor(() => { expect(surface.openExternal).toHaveBeenCalledOnce() })
    expect(surface.channel.start).toHaveBeenCalledOnce()
    surface.signIn.cancel()
    cancelled.resolve(undefined)
    await expect(first).resolves.toBe('failed')
    await expect(second).resolves.toBe('failed')
    expect(surface.channel.complete).not.toHaveBeenCalled()
    expect(surface.enterWorkspace).not.toHaveBeenCalled()
  })
})
