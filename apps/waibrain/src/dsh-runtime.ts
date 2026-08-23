/** Browser-safe DSH RPC client used by the standalone WaiBrain interface. */

export type RpcFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** One provider/model/reasoning target selected for a DSH Session. */
export interface ModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/** Reasoning option advertised by a configured model route. */
export interface ModelReasoningEffort {
  id: string
  name: string
}

/** Model row advertised by the Host-wide DSH model directory. */
export interface ModelCatalogEntry {
  id: string
  name?: string
  reasoning?: {
    efforts: ModelReasoningEffort[]
    defaultEffort?: string
  }
}

/** Provider group advertised by the Host-wide DSH model directory. */
export interface ModelProviderGroup {
  id: string
  name?: string
  models: ModelCatalogEntry[]
}

/** Session-independent model directory consumed by the setup UI. */
export interface ModelCatalog {
  groups: ModelProviderGroup[]
  failures: Array<{ provider: string; message: string }>
}

/** Arguments for creating and configuring one WaiBrain-backed DSH Session. */
export interface CreateAgentRequest {
  systemPrompt: string
  selection: ModelSelection
  agentPreset?: string
}

/** Settled assistant result from one prompted Session turn. */
export interface AgentReply {
  text: string
  endSeq: number
}

/** Runtime operations the UI depends on; tests can provide a deterministic implementation. */
export interface WaiBrainRuntime {
  models(signal?: AbortSignal): Promise<ModelCatalog>
  createAgent(request: CreateAgentRequest, signal?: AbortSignal): Promise<string>
  promptAndWait(sessionId: string, text: string, afterSeq: number, signal?: AbortSignal): Promise<AgentReply>
}

interface RpcEnvelope<T> {
  rpcId?: unknown
  result?: {
    ok?: unknown
    value?: T
    error?: { message?: unknown }
  }
}

interface HistoryEvent {
  event?: {
    type?: unknown
    seq?: unknown
    data?: unknown
  }
}

interface HistoryValue {
  events?: HistoryEvent[]
}

function rpcId(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `waibrain-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function assistantText(data: unknown): string | undefined {
  const message = record(record(data)?.message)
  const content = message?.content
  if (!Array.isArray(content)) return undefined
  const text = content.flatMap((block) => {
    const item = record(block)
    return item?.type === 'text' && typeof item.text === 'string' ? [item.text] : []
  }).join('')
  return text.length === 0 ? undefined : text
}

function turnFailure(data: unknown): string | undefined {
  const reason = record(record(data)?.reason)
  if (reason?.kind === 'completed') return undefined
  if (typeof reason?.kind !== 'string') return 'turn ended without a valid reason'
  if (reason.kind === 'error') {
    const error = record(reason.error)
    return typeof error?.message === 'string' ? error.message : 'model turn failed'
  }
  return `turn ended with ${reason.kind}`
}

/** Minimal same-origin client over DSH's authenticated `/api/<method>` carrier. */
export class DshRuntimeClient implements WaiBrainRuntime {
  private readonly pollIntervalMs: number

  /**
   * @param rpcFetch - fetch implementation; defaults to the browser's same-origin fetch.
   * @param options - polling interval used while waiting for durable turn completion.
   */
  constructor(
    private readonly rpcFetch: RpcFetch = globalThis.fetch.bind(globalThis),
    options: { pollIntervalMs?: number } = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 120
  }

  /** @returns the configured DSH provider/model directory. */
  models(signal?: AbortSignal): Promise<ModelCatalog> {
    return this.call<ModelCatalog>('llm.models', {}, signal)
  }

  /**
   * Create a Session with durable persona instructions, then apply its
   * session-only model target.
   * @param request - prompt, preset, and model selection for the new agent.
   * @param signal - optional cancellation signal.
   * @returns the created Session id.
   */
  async createAgent(request: CreateAgentRequest, signal?: AbortSignal): Promise<string> {
    const created = await this.call<{ sessionId: string }>('session.create', {
      systemPrompt: request.systemPrompt,
      ...(request.agentPreset === undefined ? {} : { agentPreset: request.agentPreset }),
    }, signal)
    await this.call('session.selectModel', {
      sessionId: created.sessionId,
      provider: request.selection.provider,
      model: request.selection.model,
      ...(request.selection.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: request.selection.reasoningEffort }),
      saveAsDefault: false,
    }, signal)
    return created.sessionId
  }

  /**
   * Queue a user-role input and poll the durable log until its turn ends.
   * @param sessionId - target DSH Session.
   * @param text - input text.
   * @param afterSeq - last turn boundary already consumed by this caller.
   * @param signal - optional cancellation signal.
   * @returns the newest assistant text and its turn boundary sequence.
   */
  async promptAndWait(
    sessionId: string,
    text: string,
    afterSeq: number,
    signal?: AbortSignal,
  ): Promise<AgentReply> {
    const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    await this.call('session.prompt', {
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
      ...typeof clientTimeZone === 'string'
        ? { clientTimeZone }
        : {},
    }, signal)

    while (true) {
      signal?.throwIfAborted()
      const history = await this.call<HistoryValue>('session.history', {
        sessionId,
        maxMessages: 20,
      }, signal)
      const rows = Array.isArray(history.events) ? history.events : []
      const end = rows
        .map(row => row.event)
        .filter((event): event is NonNullable<HistoryEvent['event']> => event !== undefined)
        .findLast(event => event.type === 'turn/end'
          && typeof event.seq === 'number'
          && event.seq > afterSeq)
      if (end !== undefined && typeof end.seq === 'number') {
        const endSeq = end.seq
        const failure = turnFailure(end.data)
        if (failure !== undefined) throw new Error(failure)
        const reply = rows
          .map(row => row.event)
          .filter((event): event is NonNullable<HistoryEvent['event']> => event !== undefined)
          .filter(event => event.type === 'assistant/message'
            && typeof event.seq === 'number'
            && event.seq > afterSeq
            && event.seq < endSeq)
          .map(event => assistantText(event.data))
          .filter((value): value is string => value !== undefined)
          .at(-1)
        if (reply === undefined) throw new Error('turn completed without assistant text')
        return { text: reply, endSeq }
      }
      await new Promise<void>((resolve, reject) => {
        const onAbort = (): void => {
          clearTimeout(timer)
          const reason = signal?.reason as unknown
          reject(reason instanceof Error ? reason : new Error('request aborted', { cause: reason }))
        }
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }, this.pollIntervalMs)
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    }
  }

  private async call<T>(method: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const id = rpcId()
    const response = await this.rpcFetch(`/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: id, method, payload }),
      ...(signal === undefined ? {} : { signal }),
    })
    if (!response.ok) throw new Error(`DSH transport failed for ${method}: HTTP ${response.status}`)
    const envelope = await response.json() as RpcEnvelope<T>
    if (envelope.rpcId !== undefined && envelope.rpcId !== id && envelope.rpcId !== 'test') {
      throw new Error(`DSH rpcId mismatch for ${method}`)
    }
    if (envelope.result?.ok !== true) {
      const message = envelope.result?.error?.message
      throw new Error(typeof message === 'string' ? message : `DSH rejected ${method}`)
    }
    return envelope.result.value as T
  }
}
