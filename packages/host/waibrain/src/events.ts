/** Durable WaiBrain coordination facts stored in the standard Session log. */

import type {
  WaiBrainAgentConfig,
  WaiBrainConversationId,
  WaiBrainExternalBrain,
  WaiBrainRoundId,
} from './types.ts'

/** Attribution carried by a Host-admitted late external-brain result. */
export interface WaiBrainResultMessageSource {
  readonly kind: 'waibrain-result'
  readonly conversationId: WaiBrainConversationId
  readonly roundId: WaiBrainRoundId
  readonly externalBrainId: string
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'waibrain-result': WaiBrainResultMessageSource
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Immutable configuration and message identity admitted for one user round. */
    'waibrain/round-admitted': {
      conversationId: WaiBrainConversationId
      roundId: WaiBrainRoundId
      configRevision: number
      config: WaiBrainAgentConfig
      userMessageId: string
      externalBrains: readonly WaiBrainExternalBrain[]
    }
    /** Main-lane lifecycle for one admitted round. */
    'waibrain/main-status': {
      roundId: WaiBrainRoundId
      status: 'running' | 'completed' | 'failed' | 'host-restarted'
    }
    /** External-brain lane lifecycle; full output remains authoritative in the child Session. */
    'waibrain/brain-status': {
      roundId: WaiBrainRoundId
      externalBrainId: string
      label: string
      status: 'running' | 'completed' | 'empty' | 'error' | 'timeout' | 'host-restarted'
      childSessionId?: import('@deepseek-ai/dsh-session').SessionId
      summary?: string
      truncated?: boolean
    }
    /** A late external-brain result was committed before delivery to the main inbox. */
    'waibrain/wake-pending': {
      roundId: WaiBrainRoundId
      externalBrainId: string
      wakeMessageId: string
      childSessionId?: import('@deepseek-ai/dsh-session').SessionId
      fallback: string
    }
    /** A committed wake was observed in the main Session and will not be delivered again. */
    'waibrain/wake-delivered': {
      roundId: WaiBrainRoundId
      externalBrainId: string
      wakeMessageId: string
    }
    /** A committed wake was made inert by conversation closure. */
    'waibrain/wake-discarded-on-close': {
      roundId: WaiBrainRoundId
      externalBrainId: string
      wakeMessageId: string
    }
    /** A non-Host inbox message was rejected before it reached the model-visible surface. */
    'waibrain/foreign-turn-rejected': {
      sourceKind: string
      messageId: string
    }
  }
}

export {}
