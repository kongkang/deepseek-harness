/** Public wire vocabulary for the WaiBrain Host domain. @module @deepseek-ai/dsh-host-waibrain/types */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque identity of one durable WaiBrain Agent. */
export type WaiBrainAgentId = Branded<'WaiBrainAgentId'>
/** Opaque identity of one durable WaiBrain conversation. */
export type WaiBrainConversationId = Branded<'WaiBrainConversationId'>
/** Opaque identity of one admitted WaiBrain round. */
export type WaiBrainRoundId = Branded<'WaiBrainRoundId'>

/** One provider/model/reasoning target. */
export interface WaiBrainModelSelection {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/** Editable main-character fields persisted by the Host. */
export interface WaiBrainRole {
  readonly name: string
  readonly tagline: string
  readonly personality: string
  readonly voice: string
  readonly scenario: string
  readonly greeting: string
  readonly examples: string
  readonly systemPrompt: string
}

/** One dynamically managed external brain. */
export interface WaiBrainExternalBrain {
  readonly id: string
  readonly label: string
  readonly direction: string
  readonly persona: string
  readonly selection: WaiBrainModelSelection
  readonly enabled: boolean
}

/** Complete editable Agent configuration. */
export interface WaiBrainAgentConfig {
  readonly label: string
  readonly role: WaiBrainRole
  readonly mainSelection: WaiBrainModelSelection
  readonly externalBrains: readonly WaiBrainExternalBrain[]
}

/** One immutable persisted Agent revision. */
export interface WaiBrainAgentRevision {
  readonly id: WaiBrainAgentId
  readonly revision: number
  readonly config: WaiBrainAgentConfig
  readonly createdAt: number
}

/** Save one new Agent or compare-and-set an existing Agent revision. */
export interface WaiBrainSaveAgentRequest {
  readonly agentId?: WaiBrainAgentId
  readonly expectedRevision: number | null
  readonly config: WaiBrainAgentConfig
}

/** Select one durable Agent. */
export interface WaiBrainSelectAgentRequest {
  readonly agentId: WaiBrainAgentId
}

/** Select one durable conversation. */
export interface WaiBrainSelectConversationRequest {
  readonly conversationId: WaiBrainConversationId
}

/** Create one conversation for an Agent. */
export interface WaiBrainCreateConversationRequest {
  readonly agentId: WaiBrainAgentId
}

/** Read one conversation. */
export interface WaiBrainConversationRequest {
  readonly conversationId: WaiBrainConversationId
}

/** Admit one user message. */
export interface WaiBrainPromptRequest {
  readonly conversationId: WaiBrainConversationId
  readonly text: string
}

/** Close one conversation. */
export interface WaiBrainCloseConversationRequest {
  readonly conversationId: WaiBrainConversationId
}

/** Deployment limits the browser needs before editing or sending. */
export interface WaiBrainLimits {
  readonly maxAdmittedBranches: number
  readonly externalBrainTimeoutMs: number
  readonly externalBrainMaxTokens: number
  readonly maxResultBytes: number
}

/** Initial durable application snapshot. */
export interface WaiBrainBootstrap {
  readonly limits: WaiBrainLimits
  readonly agents: readonly WaiBrainAgentRevision[]
  readonly selectedAgentId: WaiBrainAgentId | null
  readonly conversations: readonly WaiBrainConversationSummary[]
  readonly selectedConversationId: WaiBrainConversationId | null
}

/** One conversation row shown in the durable history selector. */
export interface WaiBrainConversationSummary {
  readonly id: WaiBrainConversationId
  readonly agentId: WaiBrainAgentId
  readonly sessionId: string
  readonly createdAt: number
  readonly status: 'open' | 'closed'
}

/** One public message projected from the main standard Session. */
export interface WaiBrainConversationMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly text: string
  readonly seq: number
}

/** Public state of one external-brain lane for an admitted round. */
export interface WaiBrainExternalBrainRound {
  readonly externalBrainId: string
  readonly label: string
  readonly status: 'running' | 'completed' | 'empty' | 'error' | 'timeout' | 'host-restarted'
  readonly childSessionId?: string
  readonly summary?: string
  readonly truncated?: boolean
  readonly resultUnavailable?: boolean
}

/** Public state of one user round and all of its independently settling lanes. */
export interface WaiBrainRoundView {
  readonly id: WaiBrainRoundId
  readonly configRevision: number
  readonly userMessageId: string
  readonly mainStatus: 'running' | 'completed' | 'failed' | 'host-restarted'
  readonly externalBrains: readonly WaiBrainExternalBrainRound[]
}

/** Main-session transcript plus Host-owned 1+N lane state. */
export interface WaiBrainConversationView {
  readonly conversation: WaiBrainConversationSummary
  readonly busy: boolean
  readonly messages: readonly WaiBrainConversationMessage[]
  readonly rounds: readonly WaiBrainRoundView[]
}

/** A user-authored prompt field contains System Prompt template syntax. */
export interface WaiBrainInvalidPersonaTemplate {
  readonly code: 'invalid-persona-template'
  readonly field: string
  readonly offset: number
}

/** Enabled external brains exceed the deployment admission limit. */
export interface WaiBrainBranchLimitExceeded {
  readonly code: 'branch-limit-exceeded'
  readonly maxAdmittedBranches: number
  readonly enabledCount: number
}

/** A compare-and-set Agent update observed a newer revision. */
export interface WaiBrainRevisionConflict {
  readonly code: 'revision-conflict'
  readonly current: WaiBrainAgentRevision
}

/** The requested Agent does not exist. */
export interface WaiBrainAgentNotFound {
  readonly code: 'agent-not-found'
  readonly agentId: WaiBrainAgentId
}

/** The requested conversation does not exist. */
export interface WaiBrainConversationNotFound {
  readonly code: 'conversation-not-found'
  readonly conversationId: WaiBrainConversationId
}

/** A runtime operation is not available in the current implementation stage. */
export interface WaiBrainRuntimeUnavailable {
  readonly code: 'runtime-unavailable'
  readonly message?: string
}

/** The main Agent or a committed result wake currently owns the conversation. */
export interface WaiBrainConversationBusy {
  readonly code: 'conversation-busy'
  readonly conversationId: WaiBrainConversationId
}

/** A closed conversation is immutable and accepts no new prompt. */
export interface WaiBrainConversationClosed {
  readonly code: 'conversation-closed'
  readonly conversationId: WaiBrainConversationId
}

/** Successful product result. */
export interface WaiBrainSuccess<T> {
  readonly ok: true
  readonly value: T
}

/** Rejected product result. */
export interface WaiBrainRejected<E> {
  readonly ok: false
  readonly error: E
}

/** Save result. */
export type WaiBrainSaveAgentResult = WaiBrainSuccess<{ readonly agent: WaiBrainAgentRevision }> | WaiBrainRejected<
  WaiBrainInvalidPersonaTemplate | WaiBrainBranchLimitExceeded | WaiBrainRevisionConflict | WaiBrainAgentNotFound
>
/** Agent selection result. */
export type WaiBrainSelectAgentResult =
  | WaiBrainSuccess<{ readonly selectedAgentId: WaiBrainAgentId }>
  | WaiBrainRejected<WaiBrainAgentNotFound>
/** Conversation creation result. */
export type WaiBrainCreateConversationResult =
  | WaiBrainSuccess<{ readonly conversation: WaiBrainConversationSummary }>
  | WaiBrainRejected<WaiBrainAgentNotFound | WaiBrainRuntimeUnavailable>
/** Conversation selection result. */
export type WaiBrainSelectConversationResult =
  | WaiBrainSuccess<{ readonly selectedConversationId: WaiBrainConversationId }>
  | WaiBrainRejected<WaiBrainConversationNotFound>
/** Conversation read result. */
export type WaiBrainConversationResult = WaiBrainSuccess<WaiBrainConversationView> | WaiBrainRejected<WaiBrainConversationNotFound>
/** Prompt admission result. */
export type WaiBrainPromptResult = WaiBrainSuccess<{ readonly roundId: WaiBrainRoundId }> | WaiBrainRejected<
  | WaiBrainConversationNotFound
  | WaiBrainConversationClosed
  | WaiBrainConversationBusy
  | WaiBrainBranchLimitExceeded
  | WaiBrainRuntimeUnavailable
>
/** Close result. */
export type WaiBrainCloseConversationResult =
  | WaiBrainSuccess<{ readonly closed: true }>
  | WaiBrainRejected<WaiBrainConversationNotFound | WaiBrainRuntimeUnavailable>
