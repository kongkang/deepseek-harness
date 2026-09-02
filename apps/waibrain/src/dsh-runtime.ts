/** Browser-safe clients and wire types for the Host-backed WaiBrain application. */

export type RpcFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * Random v4 UUID minted from `crypto.getRandomValues`, which — unlike
 * `crypto.randomUUID` — is available on plain-HTTP pages outside secure
 * contexts. Same RFC 9562 §5.4 bit layout as `@deepseek-ai/dsh-util-crypto`.
 * @returns the UUID string.
 */
export function randomUUID(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const hex = Array.from(bytes, (byte, index) => {
    const pinned = index === 6 ? (byte & 0x0f) | 0x40 : index === 8 ? (byte & 0x3f) | 0x80 : byte
    return pinned.toString(16).padStart(2, '0')
  }).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** One provider/model/reasoning route selected for a main or external brain. */
export interface ModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/** Reasoning option advertised by one exact model route. */
export interface ModelReasoningEffort {
  id: string
  name: string
}

/** Model advertised by the Host model directory. */
export interface ModelCatalogEntry {
  id: string
  name?: string
  reasoning?: { efforts: ModelReasoningEffort[]; defaultEffort?: string }
}

/** Provider group advertised by the Host model directory. */
export interface ModelProviderGroup {
  id: string
  name?: string
  models: ModelCatalogEntry[]
}

/** Session-independent model directory consumed by configuration forms. */
export interface ModelCatalog {
  groups: ModelProviderGroup[]
  failures: Array<{ provider: string; message: string }>
}

/** Editable main-character fields persisted by the Host. */
export interface WaiBrainRole {
  name: string
  tagline: string
  personality: string
  voice: string
  scenario: string
  greeting: string
  examples: string
  systemPrompt: string
}

/** One dynamically managed external brain. */
export interface WaiBrainExternalBrain {
  id: string
  label: string
  direction: string
  persona: string
  selection: ModelSelection
  enabled: boolean
}

/** Complete editable Agent configuration. */
export interface WaiBrainAgentConfig {
  label: string
  role: WaiBrainRole
  mainSelection: ModelSelection
  externalBrains: WaiBrainExternalBrain[]
}

/** One immutable Agent revision. */
export interface WaiBrainAgentRevision {
  id: string
  revision: number
  config: WaiBrainAgentConfig
  createdAt: number
}

/** Durable conversation selector row. */
export interface WaiBrainConversationSummary {
  id: string
  agentId: string
  sessionId: string
  createdAt: number
  status: 'open' | 'closed'
}

/** One public main-conversation message. */
export interface WaiBrainConversationMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  seq: number
}

/** Public state of one external-brain execution. */
export interface WaiBrainExternalBrainRound {
  externalBrainId: string
  label: string
  status: 'running' | 'completed' | 'empty' | 'error' | 'timeout' | 'host-restarted'
  childSessionId?: string
  summary?: string
  truncated?: boolean
  resultUnavailable?: boolean
}

/** One admitted 1+N round. */
export interface WaiBrainRoundView {
  id: string
  configRevision: number
  userMessageId: string
  mainStatus: 'running' | 'completed' | 'failed' | 'host-restarted'
  externalBrains: WaiBrainExternalBrainRound[]
}

/** Host projection for one conversation. */
export interface WaiBrainConversationView {
  conversation: WaiBrainConversationSummary
  busy: boolean
  messages: WaiBrainConversationMessage[]
  rounds: WaiBrainRoundView[]
}

/** Host limits shown before the user enables external brains. */
export interface WaiBrainLimits {
  maxAdmittedBranches: number
  externalBrainTimeoutMs: number
  externalBrainMaxTokens: number
  maxResultBytes: number
}

/** Initial durable application state. */
export interface WaiBrainBootstrap {
  limits: WaiBrainLimits
  agents: WaiBrainAgentRevision[]
  selectedAgentId: string | null
  conversations: WaiBrainConversationSummary[]
  selectedConversationId: string | null
}

/** Business result returned inside the transport result. */
export type WaiBrainResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message?: string; field?: string; offset?: number; [key: string]: unknown } }

/** Runtime operations used by the first WaiBrain tab. */
export interface WaiBrainRuntime {
  models(signal?: AbortSignal): Promise<ModelCatalog>
  bootstrap(signal?: AbortSignal): Promise<WaiBrainBootstrap>
  saveAgent(
    request: { agentId?: string; expectedRevision: number | null; config: WaiBrainAgentConfig },
    signal?: AbortSignal,
  ): Promise<WaiBrainResult<{ agent: WaiBrainAgentRevision }>>
  selectAgent(request: { agentId: string }, signal?: AbortSignal): Promise<WaiBrainResult<{ selectedAgentId: string }>>
  createConversation(
    request: { agentId: string },
    signal?: AbortSignal,
  ): Promise<WaiBrainResult<{ conversation: WaiBrainConversationSummary }>>
  selectConversation(request: { conversationId: string }, signal?: AbortSignal): Promise<WaiBrainResult<{ selectedConversationId: string }>>
  conversation(request: { conversationId: string }, signal?: AbortSignal): Promise<WaiBrainResult<WaiBrainConversationView>>
  prompt(request: { conversationId: string; text: string }, signal?: AbortSignal): Promise<WaiBrainResult<{ roundId: string }>>
  closeConversation(request: { conversationId: string }, signal?: AbortSignal): Promise<WaiBrainResult<{ closed: true }>>
}

interface RpcEnvelope<T> {
  rpcId?: unknown
  result?: { ok?: unknown; value?: T; error?: { message?: unknown } }
}

function rpcId(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `waibrain-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** Same-origin client over the legacy model directory and strict WaiBrain Typert Remote. */
export class DshRuntimeClient implements WaiBrainRuntime {
  /** @param rpcFetch - same-origin fetch implementation. */
  constructor(private readonly rpcFetch: RpcFetch = globalThis.fetch.bind(globalThis)) {}

  /** @returns configured provider/model routes. */
  models(signal?: AbortSignal): Promise<ModelCatalog> {
    return this.call<ModelCatalog>('session/modelCatalog', { args: {} }, signal)
  }

  bootstrap(signal?: AbortSignal): Promise<WaiBrainBootstrap> {
    return this.remote<WaiBrainBootstrap>('bootstrap', {}, signal)
  }

  saveAgent(request: Parameters<WaiBrainRuntime['saveAgent']>[0], signal?: AbortSignal): ReturnType<WaiBrainRuntime['saveAgent']> {
    return this.remote('saveAgent', { request }, signal)
  }

  selectAgent(request: Parameters<WaiBrainRuntime['selectAgent']>[0], signal?: AbortSignal): ReturnType<WaiBrainRuntime['selectAgent']> {
    return this.remote('selectAgent', { request }, signal)
  }

  createConversation(request: Parameters<WaiBrainRuntime['createConversation']>[0], signal?: AbortSignal): ReturnType<WaiBrainRuntime['createConversation']> {
    return this.remote('createConversation', { request }, signal)
  }

  selectConversation(request: Parameters<WaiBrainRuntime['selectConversation']>[0], signal?: AbortSignal): ReturnType<WaiBrainRuntime['selectConversation']> {
    return this.remote('selectConversation', { request }, signal)
  }

  conversation(request: Parameters<WaiBrainRuntime['conversation']>[0], signal?: AbortSignal): ReturnType<WaiBrainRuntime['conversation']> {
    return this.remote('conversation', { request }, signal)
  }

  prompt(request: Parameters<WaiBrainRuntime['prompt']>[0], signal?: AbortSignal): ReturnType<WaiBrainRuntime['prompt']> {
    return this.remote('prompt', { request }, signal)
  }

  closeConversation(request: Parameters<WaiBrainRuntime['closeConversation']>[0], signal?: AbortSignal): ReturnType<WaiBrainRuntime['closeConversation']> {
    return this.remote('closeConversation', { request }, signal)
  }

  private remote<T>(method: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    return this.call<T>(`waibrain/${method}`, { args }, signal)
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
