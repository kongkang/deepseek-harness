/** Durable storage schema for the WaiBrain Host domain. @module @deepseek-ai/dsh-host-waibrain/src/spec */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type {
  WaiBrainAgentConfig,
  WaiBrainAgentId,
  WaiBrainAgentRevision,
  WaiBrainConversationId,
} from './types.ts'

const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const positiveSafeInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const agentIdSchema = z.uuid().transform(value => value as WaiBrainAgentId)
const conversationIdSchema = z.uuid().transform(value => value as WaiBrainConversationId)

/** Runtime schema for a model route. */
export const waibrainModelSelectionSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  reasoningEffort: z.string().min(1).optional(),
})

/** Runtime schema for editable role fields. */
export const waibrainRoleSchema = z.object({
  name: z.string(),
  tagline: z.string(),
  personality: z.string(),
  voice: z.string(),
  scenario: z.string(),
  greeting: z.string(),
  examples: z.string(),
  systemPrompt: z.string(),
})

/** Runtime schema for one external brain. */
export const waibrainExternalBrainSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  direction: z.string(),
  persona: z.string(),
  selection: waibrainModelSelectionSchema,
  enabled: z.boolean(),
})

/** Runtime schema for a complete editable Agent. */
export const waibrainAgentConfigSchema = z.object({
  label: z.string(),
  role: waibrainRoleSchema,
  mainSelection: waibrainModelSelectionSchema,
  externalBrains: z.array(waibrainExternalBrainSchema),
}).superRefine((config, ctx) => {
  const ids = new Set<string>()
  config.externalBrains.forEach((brain, index) => {
    if (ids.has(brain.id)) {
      ctx.addIssue({ code: 'custom', path: ['externalBrains', index, 'id'], message: `duplicate external brain id '${brain.id}'` })
    }
    ids.add(brain.id)
  })
}) as unknown as z.ZodType<WaiBrainAgentConfig>

/** Stored immutable Agent revision. */
export const waibrainAgentRevisionSchema = z.object({
  id: agentIdSchema,
  revision: positiveSafeInteger,
  config: waibrainAgentConfigSchema,
  createdAt: nonNegativeSafeInteger,
}) as unknown as z.ZodType<WaiBrainAgentRevision>

/** Stored Agent row with complete revision history. */
export const waibrainAgentRowSchema = z.object({
  currentRevision: positiveSafeInteger,
  revisions: z.array(waibrainAgentRevisionSchema).min(1),
}).superRefine((row, ctx) => {
  if (row.revisions.at(-1)?.revision !== row.currentRevision) {
    ctx.addIssue({ code: 'custom', path: ['currentRevision'], message: 'currentRevision must name the last revision' })
  }
})

/** Stored Agent row inferred from its runtime schema. */
export type WaiBrainAgentRow = z.infer<typeof waibrainAgentRowSchema>

/** Stored conversation row. */
export const waibrainConversationRowSchema = z.object({
  id: conversationIdSchema,
  agentId: agentIdSchema,
  sessionId: z.string().min(1),
  createdAt: nonNegativeSafeInteger,
  status: z.union([z.literal('open'), z.literal('closed')]),
  closedAtSeq: nonNegativeSafeInteger.optional(),
  hasPendingWake: z.boolean(),
})

/** Stored conversation row inferred from its runtime schema. */
export type WaiBrainConversationRow = z.infer<typeof waibrainConversationRowSchema>

/** Durable global selection and order state. */
export const waibrainDomainStateSchema = z.object({
  agentIds: z.array(agentIdSchema),
  selectedAgentId: agentIdSchema.nullable(),
  selectedConversationId: conversationIdSchema.nullable(),
  pendingOperation: z.object({
    kind: z.literal('create-conversation'),
    conversationId: conversationIdSchema,
    agentId: agentIdSchema,
    sessionId: z.string().min(1),
  }).nullable(),
})

/** Durable global state inferred from its runtime schema. */
export type WaiBrainDomainState = z.infer<typeof waibrainDomainStateSchema>

/** WaiBrain domain version 1. */
export const waibrainDomainSpec = defineDomain({
  name: 'waibrain',
  version: 1,
  global: {
    schema: waibrainDomainStateSchema,
    initial: { agentIds: [], selectedAgentId: null, selectedConversationId: null, pendingOperation: null },
  },
  tables: {
    agents: domainTable<WaiBrainAgentId, WaiBrainAgentRow>(waibrainAgentRowSchema),
    conversations: domainTable<WaiBrainConversationId, WaiBrainConversationRow>(waibrainConversationRowSchema),
  },
})
