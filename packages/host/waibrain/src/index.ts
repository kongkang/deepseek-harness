/** Host-owned WaiBrain Agent and conversation coordination. @module @deepseek-ai/dsh-host-waibrain */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import type { Agent, AgentHandle, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-presets'
import {
  createUserMessage,
  freezeMessage,
  MessageId,
  ReasoningEffortId,
  type ContentBlock,
  type UserMessage,
} from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-query'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { SubagentRun, SubagentRuntime } from '@deepseek-ai/dsh-subagent'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { buildWaiBrainPersona, buildWaiBrainWake } from './composition.ts'
import './events.ts'
import { waibrainDomainSpec } from './spec.ts'
import type { WaiBrainAgentRow, WaiBrainConversationRow } from './spec.ts'
import { validateAgentPersona } from './validator.ts'
import type {
  WaiBrainAgentId,
  WaiBrainAgentNotFound,
  WaiBrainAgentRevision,
  WaiBrainBootstrap,
  WaiBrainCloseConversationRequest,
  WaiBrainCloseConversationResult,
  WaiBrainConversationId,
  WaiBrainConversationMessage,
  WaiBrainConversationRequest,
  WaiBrainConversationResult,
  WaiBrainCreateConversationRequest,
  WaiBrainCreateConversationResult,
  WaiBrainPromptRequest,
  WaiBrainPromptResult,
  WaiBrainRejected,
  WaiBrainRevisionConflict,
  WaiBrainSaveAgentRequest,
  WaiBrainSaveAgentResult,
  WaiBrainSelectAgentRequest,
  WaiBrainSelectAgentResult,
  WaiBrainSelectConversationRequest,
  WaiBrainSelectConversationResult,
  WaiBrainSuccess,
  WaiBrainExternalBrain,
  WaiBrainModelSelection,
  WaiBrainRoundId,
} from './types.ts'

export type * from './types.ts'
export { waibrainDomainSpec } from './spec.ts'
export { validateAgentPersona, validatePersonaText } from './validator.ts'
export { buildWaiBrainPersona, buildWaiBrainWake, NEUTRAL_WAIBRAIN_PERSONA } from './composition.ts'

/** Deployment policy for WaiBrain coordination. */
export interface Config {
  /** Maximum enabled external brains accepted in one Agent revision and user round. */
  readonly maxAdmittedBranches: number
  /** Milliseconds allowed for each external-brain Session to settle independently. */
  readonly externalBrainTimeoutMs: number
  /** Maximum output tokens requested from each external-brain model call. */
  readonly externalBrainMaxTokens: number
  /** Maximum UTF-8 bytes retained when an external-brain result enters the main Session. */
  readonly maxResultBytes: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    waibrainHost: WaiBrainHostService
  }
}

/** Freeze a detached value before it crosses a Host service boundary. */
function snapshot<T>(value: T): T {
  const copy = structuredClone(value)
  const freeze = (input: unknown): void => {
    if (typeof input !== 'object' || input === null || Object.isFrozen(input)) return
    Object.freeze(input)
    for (const item of Object.values(input)) freeze(item)
  }
  freeze(copy)
  return copy
}

/** Build a frozen success result. */
function success<T>(value: T): WaiBrainSuccess<T> {
  return snapshot({ ok: true as const, value })
}

/** Build a frozen business rejection. */
function rejected<E>(error: E): WaiBrainRejected<E> {
  return snapshot({ ok: false as const, error })
}

/** Validate a required positive safe-integer config value. */
function positive(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`host-waibrain: ${name} must be a positive safe integer, got ${String(value)}`)
  }
  return value
}

/** Root Host service owning the WaiBrain durable domain and Remote namespace. */
export class WaiBrainHostService extends TypertRemoteService {
  static inject = ['storageDomain', 'sessions']

  static Config: s<Config> = s.object({
    maxAdmittedBranches: s.number().step(1).min(1).required(),
    externalBrainTimeoutMs: s.number().step(1).min(1).required(),
    externalBrainMaxTokens: s.number().step(1).min(1).required(),
    maxResultBytes: s.number().step(1).min(1).required(),
  })

  private readonly maxAdmittedBranches: number
  private readonly externalBrainTimeoutMs: number
  private readonly externalBrainMaxTokens: number
  private readonly maxResultBytes: number
  private domain?: Domain<typeof waibrainDomainSpec>
  private agents?: KvTable<WaiBrainAgentId, WaiBrainAgentRow>
  private conversations?: KvTable<WaiBrainConversationId, WaiBrainConversationRow>
  private readonly handles = new Map<SessionId, AgentHandle>()
  private readonly selections = new Map<SessionId, ModelSelectionRef>()
  private readonly activeConfigs = new Map<SessionId, WaiBrainAgentRevision>()
  private readonly conversationChains = new Map<WaiBrainConversationId, Promise<void>>()
  private readonly branchControllers = new Set<AbortController>()

  /** @param ctx - Host context with the storage-domain form. @param config - deployment limits. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'waibrainHost', { namespace: 'waibrain' })
    this.maxAdmittedBranches = positive('maxAdmittedBranches', config.maxAdmittedBranches)
    this.externalBrainTimeoutMs = positive('externalBrainTimeoutMs', config.externalBrainTimeoutMs)
    this.externalBrainMaxTokens = positive('externalBrainMaxTokens', config.externalBrainMaxTokens)
    this.maxResultBytes = positive('maxResultBytes', config.maxResultBytes)
  }

  /** Open and own the versioned WaiBrain domain. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(waibrainDomainSpec)
    this.domain = domain
    this.agents = domain.table('agents')
    this.conversations = domain.table('conversations')
    this.ctx.effect(() => async () => { await domain.close() }, 'waibrain.domainClose')
    this.ctx.effect(() => async () => {
      for (const controller of this.branchControllers) controller.abort(new Error('WaiBrain Host disposed'))
      await Promise.allSettled([...this.handles.values()].map(handle => handle.dispose()))
      this.handles.clear()
    }, 'waibrain.agentHandles()')
    await this.recoverPendingOperation()
    await this.recoverDurableSessions()
  }

  /** Resolve or discard an interrupted create-conversation transaction. */
  private async recoverPendingOperation(): Promise<void> {
    const domain = this.requireDomain()
    const state = domain.global.get()
    const pending = state.pendingOperation
    if (pending === null) return
    let recovered: WaiBrainConversationRow | undefined = this.requireConversations().get(pending.conversationId)
    const query = this.ctx.get('sessionQuery')
    if (recovered === undefined && query !== undefined && this.requireAgents().get(pending.agentId) !== undefined) {
      try {
        using inspected = await query.observeSession(SessionId(pending.sessionId))
        if (inspected.header.agentPreset === 'waibrain-dialog') {
          recovered = {
            id: pending.conversationId,
            agentId: pending.agentId,
            sessionId: pending.sessionId,
            createdAt: inspected.header.createdAt,
            status: 'open',
            hasPendingWake: false,
          }
          await this.requireConversations().put(recovered.id, snapshot(recovered))
        }
      } catch (error: unknown) {
        this.ctx.logger.debug(`WaiBrain abandoned create-conversation transaction was cleared: ${String(error)}`)
      }
    }
    const current = domain.global.get()
    await domain.global.set(snapshot({
      ...current,
      ...(recovered === undefined ? {} : {
        selectedAgentId: recovered.agentId,
        selectedConversationId: recovered.id,
      }),
      pendingOperation: null,
    }))
  }

  /** Reconcile interrupted lanes and exactly-once wake delivery from durable Session facts. */
  private async recoverDurableSessions(): Promise<void> {
    if (this.ctx.get('sessionQuery') === undefined
      || this.ctx.get('sessions') === undefined
      || this.ctx.get('agents') === undefined
      || this.ctx.get('agentPresets') === undefined) return
    for (const [, initial] of this.requireConversations().entries()) {
      try {
        const source = await this.eventsFor(initial)
        const unresolved = this.unresolvedLanes(source)
        const pending = this.pendingWakes(source)
        if (unresolved.length === 0 && pending.length === 0) {
          if (initial.hasPendingWake) {
            await this.requireConversations().put(initial.id, snapshot({ ...initial, hasPendingWake: false }))
          }
          continue
        }
        const revision = this.currentAgent(initial.agentId)
        if (revision === undefined) continue
        const agent = await this.ensureConversationAgent(initial, revision)
        for (const lane of unresolved) {
          if (lane.mainRunning) {
            agent.session.append('waibrain/main-status', { roundId: lane.roundId, status: 'host-restarted' })
          }
          for (const brain of lane.brains) {
            agent.session.append('waibrain/brain-status', {
              roundId: lane.roundId,
              externalBrainId: brain.id,
              label: brain.label,
              status: 'host-restarted',
              summary: 'Host 重启前该外挂外脑尚未完成',
            })
          }
        }
        for (const wake of pending) {
          const entered = agent.session.snapshotEvents().some(event => (
            event.type === 'user/message' && event.data.id === wake.wakeMessageId
          ))
          if (initial.status === 'closed') {
            agent.session.append('waibrain/wake-discarded-on-close', wake)
          } else if (entered) {
            agent.session.append('waibrain/wake-delivered', wake)
          }
        }
        await this.ctx.sessions.flush(agent.session)
        const remaining = initial.status === 'open' ? this.pendingWakes(agent.session.snapshotEvents()) : []
        await this.requireConversations().put(initial.id, snapshot({
          ...initial,
          hasPendingWake: remaining.length > 0,
        }))
        if (remaining.length === 0) {
          await this.disposeConversationAgent(initial)
          continue
        }
        for (const wake of remaining) {
          const wakeText = await this.recoverWakeText(agent.session.snapshotEvents(), wake)
          void this.deliverPendingWake(initial.id, wake.roundId, wake.externalBrainId, wakeText)
        }
      } catch (error: unknown) {
        this.ctx.logger.warn(`WaiBrain durable recovery failed for '${initial.id}': ${String(error)}`)
      }
    }
  }

  /**
   * Read the complete durable application index without resuming Agents.
   * @returns Detached Agent, conversation, selection, and deployment-limit data.
   */
  @Remote('bootstrap')
  bootstrap(): WaiBrainBootstrap {
    const domain = this.requireDomain()
    const state = domain.global.get()
    const agents = state.agentIds.flatMap((id) => {
      const current = this.currentAgent(id)
      return current === undefined ? [] : [current]
    })
    const conversations = [...this.requireConversations().entries()]
      .map(([, row]) => ({ id: row.id, agentId: row.agentId, sessionId: row.sessionId, createdAt: row.createdAt, status: row.status }))
      .sort((left, right) => left.createdAt - right.createdAt)
    return snapshot({
      limits: {
        maxAdmittedBranches: this.maxAdmittedBranches,
        externalBrainTimeoutMs: this.externalBrainTimeoutMs,
        externalBrainMaxTokens: this.externalBrainMaxTokens,
        maxResultBytes: this.maxResultBytes,
      },
      agents,
      selectedAgentId: state.selectedAgentId,
      conversations,
      selectedConversationId: state.selectedConversationId,
    })
  }

  /**
   * Create or compare-and-set a complete Agent config.
   * @param request - Complete configuration and expected revision.
   * @returns The saved immutable revision or a typed product rejection.
   */
  @Remote('saveAgent')
  async saveAgent(request: WaiBrainSaveAgentRequest): Promise<WaiBrainSaveAgentResult> {
    const personaFailure = validateAgentPersona(request.config)
    if (personaFailure !== undefined) return rejected(personaFailure)
    const enabledCount = request.config.externalBrains.filter(brain => brain.enabled).length
    if (enabledCount > this.maxAdmittedBranches) {
      return rejected({ code: 'branch-limit-exceeded', maxAdmittedBranches: this.maxAdmittedBranches, enabledCount })
    }

    const table = this.requireAgents()
    const now = Date.now()
    if (request.agentId === undefined) {
      if (request.expectedRevision !== null) {
        throw new TypeError('host-waibrain: a new Agent requires expectedRevision=null')
      }
      const agentId = randomUUID() as WaiBrainAgentId
      const revision = snapshot<WaiBrainAgentRevision>({ id: agentId, revision: 1, config: request.config, createdAt: now })
      await table.put(agentId, snapshot({ currentRevision: 1, revisions: [revision] }))
      const domain = this.requireDomain()
      const state = domain.global.get()
      await domain.global.set(snapshot({
        ...state,
        agentIds: [...state.agentIds, agentId],
        selectedAgentId: state.selectedAgentId ?? agentId,
      }))
      return success({ agent: revision })
    }

    const row = table.get(request.agentId)
    if (row === undefined) return rejected<WaiBrainAgentNotFound>({ code: 'agent-not-found', agentId: request.agentId })
    const current = row.revisions.at(-1)
    /* v8 ignore next -- the durable Agent-row schema requires one revision and names its last entry. */
    if (current === undefined) throw new Error(`host-waibrain: Agent '${request.agentId}' has no current revision`)
    if (request.expectedRevision !== current.revision) {
      return rejected<WaiBrainRevisionConflict>({ code: 'revision-conflict', current: snapshot(current) })
    }
    const revision = snapshot<WaiBrainAgentRevision>({
      id: request.agentId,
      revision: current.revision + 1,
      config: request.config,
      createdAt: now,
    })
    await table.put(request.agentId, snapshot({
      currentRevision: revision.revision,
      revisions: [...row.revisions, revision],
    }))
    return success({ agent: revision })
  }

  /**
   * Persist the selected Agent.
   * @param request - Agent identity to select.
   * @returns The selected identity or an Agent-not-found rejection.
   */
  @Remote('selectAgent')
  async selectAgent(request: WaiBrainSelectAgentRequest): Promise<WaiBrainSelectAgentResult> {
    if (this.requireAgents().get(request.agentId) === undefined) {
      return rejected({ code: 'agent-not-found', agentId: request.agentId })
    }
    const domain = this.requireDomain()
    await domain.global.set(snapshot({ ...domain.global.get(), selectedAgentId: request.agentId }))
    return success({ selectedAgentId: request.agentId })
  }

  /**
   * Create and bind one standard Session to a durable WaiBrain conversation.
   * @param request - Agent identity whose current revision owns the conversation.
   * @returns The new conversation summary or a typed runtime rejection.
   */
  @Remote('createConversation')
  async createConversation(request: WaiBrainCreateConversationRequest): Promise<WaiBrainCreateConversationResult> {
    const revision = this.currentAgent(request.agentId)
    if (revision === undefined) return rejected({ code: 'agent-not-found', agentId: request.agentId })
    const agents = this.ctx.get('agents')
    const presets = this.ctx.get('agentPresets')
    if (agents === undefined || presets === undefined) return rejected({ code: 'runtime-unavailable' })

    const conversationId = randomUUID() as WaiBrainConversationId
    const sessionId = SessionId(randomUUID())
    const domain = this.requireDomain()
    const before = domain.global.get()
    await domain.global.set(snapshot({
      ...before,
      pendingOperation: { kind: 'create-conversation', conversationId, agentId: request.agentId, sessionId },
    }))

    let handle: AgentHandle | undefined
    try {
      this.activeConfigs.set(sessionId, revision)
      this.modelSelectionForSession(sessionId)
      handle = await agents.create({
        sessionId,
        meta: { agentPreset: 'waibrain-dialog' },
        agentOptions: this.agentOptions(revision.config.mainSelection),
        setup: async (agentCtx) => { await presets.mount(agentCtx, 'waibrain-dialog') },
      })
      const row: WaiBrainConversationRow = {
        id: conversationId,
        agentId: request.agentId,
        sessionId,
        createdAt: Date.now(),
        status: 'open',
        hasPendingWake: false,
      }
      await this.requireConversations().put(conversationId, snapshot(row))
      this.handles.set(sessionId, handle)
      const current = domain.global.get()
      await domain.global.set(snapshot({
        ...current,
        selectedAgentId: request.agentId,
        selectedConversationId: conversationId,
        pendingOperation: null,
      }))
      return success({ conversation: this.conversationSummary(row) })
    } catch (error: unknown) {
      await handle?.dispose()
      this.activeConfigs.delete(sessionId)
      this.selections.delete(sessionId)
      const current = domain.global.get()
      if (current.pendingOperation?.conversationId === conversationId) {
        await domain.global.set(snapshot({ ...current, pendingOperation: null }))
      }
      this.ctx.logger.warn(`WaiBrain conversation creation failed: ${String(error)}`)
      return rejected({ code: 'runtime-unavailable', message: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Persist the selected conversation.
   * @param request - Conversation identity to select.
   * @returns The selected identity or a conversation-not-found rejection.
   */
  @Remote('selectConversation')
  async selectConversation(request: WaiBrainSelectConversationRequest): Promise<WaiBrainSelectConversationResult> {
    if (this.requireConversations().get(request.conversationId) === undefined) {
      return rejected({ code: 'conversation-not-found', conversationId: request.conversationId })
    }
    const domain = this.requireDomain()
    await domain.global.set(snapshot({ ...domain.global.get(), selectedConversationId: request.conversationId }))
    return success({ selectedConversationId: request.conversationId })
  }

  /**
   * Read one conversation from its standard Session and coordination events.
   * @param request - Conversation identity to project.
   * @returns The browser-safe projection or a conversation-not-found rejection.
   */
  @Remote('conversation')
  async conversation(request: WaiBrainConversationRequest): Promise<WaiBrainConversationResult> {
    const row = this.requireConversations().get(request.conversationId)
    if (row === undefined) return rejected({ code: 'conversation-not-found', conversationId: request.conversationId })
    const events = await this.eventsFor(row)
    return success(await this.projectConversation(row, events))
  }

  /**
   * Atomically admit one main prompt and publish every configured fork before the main wake.
   * @param request - Conversation identity and user text to admit.
   * @returns The accepted round identity or a typed admission rejection.
   */
  @Remote('prompt')
  prompt(request: WaiBrainPromptRequest): Promise<WaiBrainPromptResult> {
    return this.serial(request.conversationId, async () => {
      const row = this.requireConversations().get(request.conversationId)
      if (row === undefined) return rejected({ code: 'conversation-not-found', conversationId: request.conversationId })
      if (row.status === 'closed') return rejected({ code: 'conversation-closed', conversationId: request.conversationId })
      const revision = this.currentAgent(row.agentId)
      if (revision === undefined) return rejected({ code: 'runtime-unavailable' })
      const brains = revision.config.externalBrains.filter(brain => brain.enabled)
      if (brains.length > this.maxAdmittedBranches) {
        return rejected({ code: 'branch-limit-exceeded', maxAdmittedBranches: this.maxAdmittedBranches, enabledCount: brains.length })
      }
      const subagents = this.ctx.get('subagents')
      if (subagents === undefined || this.ctx.get('sessions') === undefined) return rejected({ code: 'runtime-unavailable' })
      let agent: Agent
      try {
        agent = await this.ensureConversationAgent(row, revision)
      } catch (error: unknown) {
        this.ctx.logger.warn(`WaiBrain conversation resume failed: ${String(error)}`)
        return rejected({ code: 'runtime-unavailable', message: error instanceof Error ? error.message : String(error) })
      }
      if (agent.status !== 'idle' || row.hasPendingWake) {
        return rejected({ code: 'conversation-busy', conversationId: request.conversationId })
      }

      const roundId = randomUUID() as WaiBrainRoundId
      const message = createUserMessage({
        content: [{ type: 'text', text: request.text }],
        source: { kind: 'user' },
      })
      this.setActiveRevision(agent.id, revision)
      agent.session.append('waibrain/round-admitted', {
        conversationId: row.id,
        roundId,
        configRevision: revision.revision,
        config: revision.config,
        userMessageId: message.id,
        externalBrains: brains,
      })
      agent.session.append('waibrain/main-status', { roundId, status: 'running' })
      for (const brain of brains) {
        agent.session.append('waibrain/brain-status', {
          roundId,
          externalBrainId: brain.id,
          label: brain.label,
          status: 'running',
        })
      }
      await this.ctx.sessions.flush(agent.session)

      const starts = brains.map(brain => this.startExternalBrain(subagents, agent, brain, request.text))
      const published = await Promise.all(starts)
      agent.followup(message)
      void this.trackMain(row.id, roundId, agent)
      for (const branch of published) {
        if (branch.run === undefined) {
          agent.session.append('waibrain/brain-status', {
            roundId,
            externalBrainId: branch.brain.id,
            label: branch.brain.label,
            status: 'error',
            summary: this.clipUtf8(branch.error, 512).text,
          })
          continue
        }
        void this.settleExternalBrain(row.id, roundId, branch.brain, branch.run, branch.controller)
      }
      if (published.some(branch => branch.run === undefined)) await this.ctx.sessions.flush(agent.session)
      return success({ roundId })
    })
  }

  /**
   * Persist a close boundary, discard committed wakes, and cancel only the main Agent.
   * @param request - Conversation identity to close.
   * @returns An idempotent closed result or a typed runtime rejection.
   */
  @Remote('closeConversation')
  closeConversation(request: WaiBrainCloseConversationRequest): Promise<WaiBrainCloseConversationResult> {
    return this.serial(request.conversationId, async () => {
      const row = this.requireConversations().get(request.conversationId)
      if (row === undefined) return rejected({ code: 'conversation-not-found', conversationId: request.conversationId })
      if (row.status === 'closed') return success({ closed: true as const })
      let agent = this.ctx.get('agents')?.get(SessionId(row.sessionId))
      const events = agent?.session.snapshotEvents() ?? await this.eventsFor(row)
      const closedAtSeq = events.at(-1)?.seq ?? 0
      const pending = this.pendingWakes(events)
      if (agent === undefined && pending.length > 0) {
        const revision = this.currentAgent(row.agentId)
        if (revision === undefined) return rejected({ code: 'runtime-unavailable' })
        try {
          agent = await this.ensureConversationAgent(row, revision)
        } catch (error: unknown) {
          return rejected({ code: 'runtime-unavailable', message: error instanceof Error ? error.message : String(error) })
        }
      }
      if (agent !== undefined) {
        for (const wake of pending) {
          agent.session.append('waibrain/wake-discarded-on-close', wake)
        }
        await this.ctx.sessions.flush(agent.session)
      }
      await this.requireConversations().put(row.id, snapshot({
        ...row,
        status: 'closed',
        closedAtSeq,
        hasPendingWake: false,
      }))
      agent?.cancel({ kind: 'user' })
      return success({ closed: true as const })
    })
  }

  /** Read the current Agent revision. */
  private currentAgent(id: WaiBrainAgentId): WaiBrainAgentRevision | undefined {
    return this.requireAgents().get(id)?.revisions.at(-1)
  }

  /**
   * Whether a Session is bound by a committed conversation or the creation transaction.
   * @param sessionId - Standard Session identity to inspect.
   * @returns True when WaiBrain Host admission owns the Session.
   */
  isBoundSession(sessionId: SessionId): boolean {
    return this.rowForSession(sessionId) !== undefined
      || this.requireDomain().global.get().pendingOperation?.sessionId === sessionId
  }

  /**
   * Complete persona selected for one bound Session, or undefined for the neutral preset path.
   * @param sessionId - Standard Session identity being assembled.
   * @returns The validated complete persona, or undefined outside a valid binding.
   */
  personaForSession(sessionId: SessionId): string | undefined {
    const revision = this.activeConfigs.get(sessionId)
      ?? (() => {
        const row = this.rowForSession(sessionId)
        return row === undefined ? undefined : this.currentAgent(row.agentId)
      })()
    if (revision === undefined || validateAgentPersona(revision.config) !== undefined) return undefined
    return buildWaiBrainPersona(revision.config)
  }

  /**
   * Stable mutable selection installed by the preset companion for one Session.
   * @param sessionId - Standard Session identity being assembled.
   * @returns The stable model-selection reference for that Session.
   */
  modelSelectionForSession(sessionId: SessionId): ModelSelectionRef {
    let selection = this.selections.get(sessionId)
    if (selection === undefined) {
      const revision = this.activeConfigs.get(sessionId)
      selection = {
        current: revision === undefined ? undefined : this.modelSelection(revision.config.mainSelection),
        assembled: undefined,
      }
      this.selections.set(sessionId, selection)
    }
    return selection
  }

  /**
   * Enforce the Host admission whitelist before a bound Agent enters a model step.
   * @param agent - Bound main Agent proposing the model step.
   * @param messages - New user-role messages proposed for the step.
   * @returns True only when every message matches a durable Host admission.
   */
  async authorizeMessages(agent: Agent, messages: readonly UserMessage[]): Promise<boolean> {
    if (messages.length === 0) return true
    const row = this.rowForSession(agent.id)
    const admitted = new Set(agent.session.snapshotEvents().flatMap(event => event.type === 'waibrain/round-admitted'
      ? [event.data.userMessageId]
      : []))
    const alreadyEntered = new Set(agent.session.snapshotEvents().flatMap(event => event.type === 'user/message'
      ? [event.data.id]
      : []))
    const pending = new Map(this.pendingWakes(agent.session.snapshotEvents()).map(wake => [wake.wakeMessageId, wake]))
    const allowed = row?.status === 'open' && messages.every((message) => {
      if (message.source.kind === 'user') return admitted.has(message.id) && !alreadyEntered.has(message.id)
      if (message.source.kind !== 'waibrain-result') return false
      const wake = pending.get(message.id)
      return wake !== undefined
        && wake.roundId === message.source.roundId
        && wake.externalBrainId === message.source.externalBrainId
        && message.source.conversationId === row.id
        && !alreadyEntered.has(message.id)
    })
    if (allowed) return true
    const first = messages.at(0)
    /* v8 ignore next -- the empty input returned before admission evaluation. */
    if (first === undefined) return true
    agent.session.append('waibrain/foreign-turn-rejected', {
      sourceKind: first.source.kind,
      messageId: first.id,
    })
    await this.ctx.sessions.flush(agent.session)
    return false
  }

  /** Serialize all admission, close, and wake commits for one conversation. */
  private serial<T>(conversationId: WaiBrainConversationId, operation: () => Promise<T>): Promise<T> {
    const previous = this.conversationChains.get(conversationId) ?? Promise.resolve()
    const result = previous.then(operation)
    const tail = result.then(() => {}, () => {})
    this.conversationChains.set(conversationId, tail)
    void tail.finally(() => {
      if (this.conversationChains.get(conversationId) === tail) this.conversationChains.delete(conversationId)
    })
    return result
  }

  /** Create or lazily resume the one main Agent owned by a conversation. */
  private async ensureConversationAgent(
    row: WaiBrainConversationRow,
    revision: WaiBrainAgentRevision,
  ): Promise<Agent> {
    const sessionId = SessionId(row.sessionId)
    const live = this.ctx.get('agents')?.get(sessionId)
    if (live !== undefined) return live
    const agents = this.ctx.get('agents')
    const presets = this.ctx.get('agentPresets')
    const query = this.ctx.get('sessionQuery')
    if (agents === undefined || presets === undefined || query === undefined) {
      throw new Error('WaiBrain Agent runtime is unavailable')
    }
    this.setActiveRevision(sessionId, revision)
    const handle = await agents.resume({
      resumeSessionId: sessionId,
      agentOptions: this.agentOptions(revision.config.mainSelection),
      setup: async (agentCtx) => { await presets.mount(agentCtx, 'waibrain-dialog') },
    })
    this.handles.set(sessionId, handle)
    return handle.agent
  }

  /** Start one detached fork and preserve startup failure as lane data. */
  private async startExternalBrain(
    subagents: SubagentRuntime,
    parent: Agent,
    brain: WaiBrainExternalBrain,
    userText: string,
  ): Promise<{
    brain: WaiBrainExternalBrain
    controller: AbortController
    run: SubagentRun
    error?: never
  } | {
    brain: WaiBrainExternalBrain
    controller: AbortController
    run?: never
    error: string
  }> {
    const controller = new AbortController()
    this.branchControllers.add(controller)
    try {
      const run = await subagents.start('fork', {
        label: brain.label,
        parent,
        signal: controller.signal,
        prompt: [{ type: 'text', text: `职责：${brain.direction}\n\n与主对话相同的用户消息：\n${userText}` }],
        persona: brain.persona,
        toolFilter: { allow: [] },
        agentOptions: {
          ...this.agentOptions(brain.selection),
          maxTokens: this.externalBrainMaxTokens,
        },
      })
      return { brain, controller, run }
    } catch (error: unknown) {
      this.branchControllers.delete(controller)
      return { brain, controller, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Record the main lane after the Agent reaches its next idle boundary. */
  private async trackMain(conversationId: WaiBrainConversationId, roundId: WaiBrainRoundId, agent: Agent): Promise<void> {
    try {
      await agent.whenIdle()
      await this.serial(conversationId, async () => {
        const lastTurn = agent.session.snapshotEvents().findLast(event => event.type === 'turn/end')
        const status = lastTurn?.type === 'turn/end'
          && (lastTurn.data.reason.kind === 'completed' || lastTurn.data.reason.kind === 'max-tokens')
          ? 'completed'
          : 'failed'
        agent.session.append('waibrain/main-status', { roundId, status })
        await this.ctx.sessions.flush(agent.session)
      })
    } catch (error: unknown) {
      this.ctx.logger.warn(`WaiBrain main-lane tracking failed: ${String(error)}`)
      try {
        await this.serial(conversationId, async () => {
          const row = this.requireConversations().get(conversationId)
          const parent = row === undefined ? undefined : this.ctx.get('agents')?.get(SessionId(row.sessionId))
          if (parent === undefined) return
          parent.session.append('waibrain/main-status', { roundId, status: 'failed' })
          await this.ctx.sessions.flush(parent.session)
        })
      } catch (recordError: unknown) {
        this.ctx.logger.warn(`WaiBrain main-lane failure record could not be persisted: ${String(recordError)}`)
      }
    }
  }

  /** Settle one independently timed external brain and commit an optional late wake. */
  private async settleExternalBrain(
    conversationId: WaiBrainConversationId,
    roundId: WaiBrainRoundId,
    brain: WaiBrainExternalBrain,
    run: SubagentRun,
    controller: AbortController,
  ): Promise<void> {
    let timeout!: ReturnType<typeof setTimeout>
    let committedWakeText: string | undefined
    try {
      const outcome = await Promise.race([
        run.result.then(result => ({ kind: 'result' as const, result })),
        new Promise<{ kind: 'timeout' }>((resolve) => {
          timeout = setTimeout(() => { resolve({ kind: 'timeout' }) }, this.externalBrainTimeoutMs)
        }),
      ])
      clearTimeout(timeout)
      if (outcome.kind === 'timeout') controller.abort(new Error('external brain timed out'))
      if (run.localAgent === undefined) throw new Error('fork provider did not expose its local child Agent')
      await this.ctx.sessions.flush(run.localAgent.session)

      const output = outcome.kind === 'result' ? this.contentText(outcome.result.output) : ''
      const clipped = this.clipUtf8(output, this.maxResultBytes)
      const completed = outcome.kind === 'result' && outcome.result.stopReason === 'completed'
      const status = outcome.kind === 'timeout'
        ? 'timeout' as const
        : !completed
          ? 'error' as const
          : clipped.text.length === 0 ? 'empty' as const : 'completed' as const
      const diagnostic = outcome.kind === 'result' ? outcome.result.diagnostic : '外挂外脑超时'
      const fallback = this.clipUtf8(clipped.text || diagnostic || '外挂外脑没有返回正文', 512).text
      const wakeText = status === 'completed' ? buildWaiBrainWake(brain.label, clipped.text) : undefined

      committedWakeText = await this.serial(conversationId, async () => {
        const row = this.requireConversations().get(conversationId)
        const parent = row === undefined ? undefined : this.ctx.get('agents')?.get(SessionId(row.sessionId))
        if (row === undefined || parent === undefined) return undefined
        parent.session.append('waibrain/brain-status', {
          roundId,
          externalBrainId: brain.id,
          label: brain.label,
          status,
          childSessionId: run.id,
          summary: fallback,
          ...(clipped.truncated ? { truncated: true } : {}),
        })
        if (row.status === 'open' && wakeText !== undefined) {
          const wakeMessageId = `waibrain:${conversationId}:${roundId}:${brain.id}`
          await this.requireConversations().put(conversationId, snapshot({ ...row, hasPendingWake: true }))
          parent.session.append('waibrain/wake-pending', {
            roundId,
            externalBrainId: brain.id,
            wakeMessageId,
            childSessionId: run.id,
            fallback,
          })
        }
        await this.ctx.sessions.flush(parent.session)
        return wakeText
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      this.ctx.logger.warn(`WaiBrain external brain '${brain.id}' settlement failed: ${message}`)
      try {
        await this.serial(conversationId, async () => {
          const row = this.requireConversations().get(conversationId)
          const parent = row === undefined ? undefined : this.ctx.get('agents')?.get(SessionId(row.sessionId))
          if (parent === undefined) return
          parent.session.append('waibrain/brain-status', {
            roundId,
            externalBrainId: brain.id,
            label: brain.label,
            status: 'error',
            summary: this.clipUtf8(message, 512).text,
          })
          await this.ctx.sessions.flush(parent.session)
        })
      } catch (recordError: unknown) {
        this.ctx.logger.warn(`WaiBrain external brain '${brain.id}' failure record could not be persisted: ${String(recordError)}`)
      }
    } finally {
      clearTimeout(timeout)
      try {
        await run.dispose()
      } catch (disposeError: unknown) {
        this.ctx.logger.warn(`WaiBrain external brain '${brain.id}' release failed: ${String(disposeError)}`)
      }
      this.branchControllers.delete(controller)
    }
    if (committedWakeText !== undefined) {
      void this.deliverPendingWake(conversationId, roundId, brain.id, committedWakeText)
    }
  }

  /** Deliver one committed result exactly once after the main Agent becomes idle. */
  private async deliverPendingWake(
    conversationId: WaiBrainConversationId,
    roundId: WaiBrainRoundId,
    externalBrainId: string,
    wakeText: string,
  ): Promise<void> {
    try {
      const initial = this.requireConversations().get(conversationId)
      if (initial === undefined) return
      const revision = this.currentAgent(initial.agentId)
      if (revision === undefined) return
      const agent = await this.ensureConversationAgent(initial, revision)
      await agent.whenIdle()
      const sent = await this.serial(conversationId, async () => {
        const row = this.requireConversations().get(conversationId)
        if (row === undefined || row.status === 'closed') return false
        const pending = this.pendingWakes(agent.session.snapshotEvents()).find(wake => (
          wake.roundId === roundId && wake.externalBrainId === externalBrainId
        ))
        if (pending === undefined) return false
        const entered = agent.session.snapshotEvents().some(event => (
          event.type === 'user/message' && event.data.id === pending.wakeMessageId
        ))
        if (entered) {
          agent.session.append('waibrain/wake-delivered', {
            roundId,
            externalBrainId,
            wakeMessageId: pending.wakeMessageId,
          })
          await this.ctx.sessions.flush(agent.session)
          await this.requireConversations().put(conversationId, snapshot({
            ...row,
            hasPendingWake: this.pendingWakes(agent.session.snapshotEvents()).length > 0,
          }))
          return false
        }
        const round = agent.session.snapshotEvents().find(event => (
          event.type === 'waibrain/round-admitted' && event.data.roundId === roundId
        ))
        if (round?.type === 'waibrain/round-admitted') {
          this.setActiveRevision(agent.id, {
            id: row.agentId,
            revision: round.data.configRevision,
            config: round.data.config,
            createdAt: round.time,
          })
        }
        const message = freezeMessage({
          id: MessageId(pending.wakeMessageId),
          role: 'user',
          content: [{ type: 'text', text: wakeText }],
          source: { kind: 'waibrain-result', conversationId, roundId, externalBrainId },
        })
        agent.followup(message)
        return true
      })
      if (!sent) return
      await agent.whenIdle()
      await this.ctx.sessions.flush(agent.session)
      await this.serial(conversationId, async () => {
        const row = this.requireConversations().get(conversationId)
        if (row === undefined || row.status === 'closed') return
        const pending = this.pendingWakes(agent.session.snapshotEvents()).find(wake => (
          wake.roundId === roundId && wake.externalBrainId === externalBrainId
        ))
        if (pending === undefined) return
        const entered = agent.session.snapshotEvents().some(event => (
          event.type === 'user/message' && event.data.id === pending.wakeMessageId
        ))
        if (!entered) return
        agent.session.append('waibrain/wake-delivered', {
          roundId,
          externalBrainId,
          wakeMessageId: pending.wakeMessageId,
        })
        await this.ctx.sessions.flush(agent.session)
        await this.requireConversations().put(conversationId, snapshot({
          ...row,
          hasPendingWake: this.pendingWakes(agent.session.snapshotEvents()).length > 0,
        }))
      })
    } catch (error: unknown) {
      this.ctx.logger.warn(`WaiBrain pending wake delivery failed: ${String(error)}`)
    }
  }

  /** Fold unmatched wake records from one main Session. */
  private pendingWakes(events: readonly SessionEvent[]): Array<{
    roundId: WaiBrainRoundId
    externalBrainId: string
    wakeMessageId: string
    childSessionId?: SessionId
    fallback: string
  }> {
    const pending = new Map<string, {
      roundId: WaiBrainRoundId
      externalBrainId: string
      wakeMessageId: string
      childSessionId?: SessionId
      fallback: string
    }>()
    for (const event of events) {
      if (event.type === 'waibrain/wake-pending') pending.set(event.data.wakeMessageId, event.data)
      if (event.type === 'waibrain/wake-delivered' || event.type === 'waibrain/wake-discarded-on-close') {
        pending.delete(event.data.wakeMessageId)
      }
    }
    return [...pending.values()]
  }

  /** Find lanes that were still running at the last durable event. */
  private unresolvedLanes(events: readonly SessionEvent[]): Array<{
    roundId: WaiBrainRoundId
    mainRunning: boolean
    brains: Array<{ id: string; label: string }>
  }> {
    const rounds = new Map<WaiBrainRoundId, {
      mainRunning: boolean
      brains: Map<string, { id: string; label: string; running: boolean }>
    }>()
    for (const event of events) {
      if (event.type === 'waibrain/round-admitted') {
        rounds.set(event.data.roundId, {
          mainRunning: true,
          brains: new Map(event.data.externalBrains.map(brain => [brain.id, {
            id: brain.id,
            label: brain.label,
            running: true,
          }])),
        })
      } else if (event.type === 'waibrain/main-status') {
        const round = rounds.get(event.data.roundId)
        if (round !== undefined) round.mainRunning = event.data.status === 'running'
      } else if (event.type === 'waibrain/brain-status') {
        const round = rounds.get(event.data.roundId)
        if (round === undefined) continue
        round.brains.set(event.data.externalBrainId, {
          id: event.data.externalBrainId,
          label: event.data.label,
          running: event.data.status === 'running',
        })
      }
    }
    return [...rounds].flatMap(([roundId, round]) => {
      const brains = [...round.brains.values()].filter(brain => brain.running)
      return round.mainRunning || brains.length > 0 ? [{ roundId, mainRunning: round.mainRunning, brains }] : []
    })
  }

  /** Rebuild one committed wake from its child Session or durable fallback. */
  private async recoverWakeText(
    events: readonly SessionEvent[],
    wake: { roundId: WaiBrainRoundId; externalBrainId: string; childSessionId?: SessionId; fallback: string },
  ): Promise<string> {
    const round = events.find(event => event.type === 'waibrain/round-admitted' && event.data.roundId === wake.roundId)
    const label = round?.type === 'waibrain/round-admitted'
      ? round.data.externalBrains.find(brain => brain.id === wake.externalBrainId)?.label ?? wake.externalBrainId
      : wake.externalBrainId
    const child = wake.childSessionId === undefined ? undefined : await this.childResult(wake.childSessionId)
    return buildWaiBrainWake(label, child?.text || wake.fallback)
  }

  /** Read live events first, then inspect the standard durable Session without resuming it. */
  private async eventsFor(row: WaiBrainConversationRow): Promise<readonly SessionEvent[]> {
    const sessionId = SessionId(row.sessionId)
    const live = this.ctx.get('sessions')?.get(sessionId)
    if (live !== undefined) return live.snapshotEvents()
    const query = this.ctx.get('sessionQuery')
    if (query === undefined) return []
    using observation = await query.observeSession(sessionId)
    return observation.events
  }

  /** Fold one stable browser projection from main Session events. */
  private async projectConversation(row: WaiBrainConversationRow, source: readonly SessionEvent[]) {
    const closedAtSeq = row.closedAtSeq
    const messageEvents = row.status === 'closed' && closedAtSeq !== undefined
      ? source.filter(event => event.seq <= closedAtSeq)
      : source
    const messages: WaiBrainConversationMessage[] = []
    for (const event of messageEvents) {
      if (event.type === 'user/message' && event.data.source.kind === 'user') {
        const text = this.contentText(event.data.content)
        if (text.length > 0) messages.push({ id: event.data.id, role: 'user', text, seq: event.seq })
      } else if (event.type === 'assistant/message') {
        const text = this.contentText(event.data.message.content)
        if (text.length > 0) messages.push({ id: event.data.message.id, role: 'assistant', text, seq: event.seq })
      }
    }
    const rounds = new Map<WaiBrainRoundId, {
      id: WaiBrainRoundId
      configRevision: number
      userMessageId: string
      mainStatus: 'running' | 'completed' | 'failed' | 'host-restarted'
      externalBrains: Array<{
        externalBrainId: string
        label: string
        status: 'running' | 'completed' | 'empty' | 'error' | 'timeout' | 'host-restarted'
        childSessionId?: string
        summary?: string
        truncated?: boolean
        resultUnavailable?: boolean
      }>
    }>()
    for (const event of source) {
      if (event.type === 'waibrain/round-admitted') {
        rounds.set(event.data.roundId, {
          id: event.data.roundId,
          configRevision: event.data.configRevision,
          userMessageId: event.data.userMessageId,
          mainStatus: 'running',
          externalBrains: event.data.externalBrains.map(brain => ({
            externalBrainId: brain.id,
            label: brain.label,
            status: 'running',
          })),
        })
      } else if (event.type === 'waibrain/main-status') {
        const round = rounds.get(event.data.roundId)
        if (round !== undefined) round.mainStatus = event.data.status
      } else if (event.type === 'waibrain/brain-status') {
        const round = rounds.get(event.data.roundId)
        const lane = round?.externalBrains.find(item => item.externalBrainId === event.data.externalBrainId)
        if (round !== undefined && lane === undefined) {
          round.externalBrains.push({
            externalBrainId: event.data.externalBrainId,
            label: event.data.label,
            status: event.data.status,
            ...(event.data.childSessionId === undefined ? {} : { childSessionId: event.data.childSessionId }),
            ...(event.data.summary === undefined ? {} : { summary: event.data.summary }),
            ...(event.data.truncated === undefined ? {} : { truncated: event.data.truncated }),
          })
        } else if (lane !== undefined) {
          Object.assign(lane, {
            status: event.data.status,
            ...(event.data.childSessionId === undefined ? {} : { childSessionId: event.data.childSessionId }),
            ...(event.data.summary === undefined ? {} : { summary: event.data.summary }),
            ...(event.data.truncated === undefined ? {} : { truncated: event.data.truncated }),
          })
        }
      }
    }
    await Promise.all([...rounds.values()].flatMap(round => round.externalBrains.map(async (lane) => {
      if (lane.childSessionId === undefined || lane.status !== 'completed') return
      const result = await this.childResult(SessionId(lane.childSessionId))
      if (result === undefined) {
        Object.assign(lane, { resultUnavailable: true })
        return
      }
      Object.assign(lane, {
        summary: result.text,
        ...(result.truncated ? { truncated: true } : {}),
      })
    })))
    const live = this.ctx.get('agents')?.get(SessionId(row.sessionId))
    return {
      conversation: this.conversationSummary(row),
      busy: row.status === 'open' && (row.hasPendingWake || live?.status === 'running'),
      messages,
      rounds: [...rounds.values()],
    }
  }

  /** Read the authoritative result text from a child Session without resuming it. */
  private async childResult(sessionId: SessionId): Promise<{ text: string; truncated: boolean } | undefined> {
    try {
      const live = this.ctx.get('sessions')?.get(sessionId)
      const events = live !== undefined
        ? live.snapshotEvents()
        : await this.observedEvents(sessionId)
      const message = events.findLast(event => event.type === 'assistant/message')
      if (message?.type !== 'assistant/message') return undefined
      return this.clipUtf8(this.contentText(message.data.message.content), this.maxResultBytes)
    } catch {
      return undefined
    }
  }

  /** Read one persisted Session's events through the live-preferred query seam. */
  private async observedEvents(sessionId: SessionId): Promise<readonly SessionEvent[]> {
    const query = this.ctx.get('sessionQuery')
    if (query === undefined) return []
    using observation = await query.observeSession(sessionId)
    return observation.events
  }

  /** Update the persona and installed model route for the next main step. */
  private setActiveRevision(sessionId: SessionId, revision: WaiBrainAgentRevision): void {
    this.activeConfigs.set(sessionId, revision)
    this.modelSelectionForSession(sessionId).current = this.modelSelection(revision.config.mainSelection)
  }

  /** Dispose a temporarily resumed Agent while keeping its durable Session available. */
  private async disposeConversationAgent(row: WaiBrainConversationRow): Promise<void> {
    const sessionId = SessionId(row.sessionId)
    const handle = this.handles.get(sessionId)
    if (handle !== undefined) await handle.dispose()
    this.handles.delete(sessionId)
    this.activeConfigs.delete(sessionId)
    this.selections.delete(sessionId)
  }

  /** Convert a browser selection into the branded runtime model selection. */
  private modelSelection(selection: WaiBrainModelSelection) {
    return {
      provider: selection.provider,
      model: selection.model,
      ...(selection.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: ReasoningEffortId(selection.reasoningEffort) }),
    }
  }

  /** Convert a browser selection into Agent creation options. */
  private agentOptions(selection: WaiBrainModelSelection) {
    return this.modelSelection(selection)
  }

  /** Flatten visible text blocks without presenting reasoning or tool internals. */
  private contentText(content: readonly ContentBlock[]): string {
    return content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
  }

  /** Clip a UTF-8 string without splitting a multibyte scalar. */
  private clipUtf8(text: string, maxBytes: number): { text: string; truncated: boolean } {
    const encoded = new TextEncoder().encode(text)
    if (encoded.byteLength <= maxBytes) return { text, truncated: false }
    let end = maxBytes
    /* v8 ignore next -- truncation guarantees every positive end is within the encoded array. */
    while (end > 0 && ((encoded.at(end) ?? 0) & 0xc0) === 0x80) end -= 1
    return { text: new TextDecoder().decode(encoded.slice(0, end)), truncated: true }
  }

  /** Find a committed conversation row by its standard Session identity. */
  private rowForSession(sessionId: SessionId): WaiBrainConversationRow | undefined {
    return [...this.requireConversations().entries()].find(([, row]) => row.sessionId === sessionId)?.[1]
  }

  /** Detach the browser-safe conversation index fields. */
  private conversationSummary(row: WaiBrainConversationRow) {
    return {
      id: row.id,
      agentId: row.agentId,
      sessionId: row.sessionId,
      createdAt: row.createdAt,
      status: row.status,
    }
  }

  private requireDomain(): Domain<typeof waibrainDomainSpec> {
    if (this.domain === undefined) throw new Error('host-waibrain: domain is not initialized')
    return this.domain
  }

  private requireAgents(): KvTable<WaiBrainAgentId, WaiBrainAgentRow> {
    if (this.agents === undefined) throw new Error('host-waibrain: Agent table is not initialized')
    return this.agents
  }

  private requireConversations(): KvTable<WaiBrainConversationId, WaiBrainConversationRow> {
    if (this.conversations === undefined) throw new Error('host-waibrain: conversation table is not initialized')
    return this.conversations
  }
}

export default WaiBrainHostService
