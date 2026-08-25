import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPresets from '@deepseek-ai/dsh-agent-presets'
import LlmRuntime, {
  freezeMessage,
  LlmAdapter,
  MessageId,
  ReasoningEffortId,
  createAssistantMessage,
  createUserMessage,
  type GenerateOptions,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { SubagentRun } from '@deepseek-ai/dsh-subagent'
import * as ForkInProcess from '@deepseek-ai/dsh-subagent-fork-in-process'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import WaiBrainHost, {
  buildWaiBrainPersona,
  NEUTRAL_WAIBRAIN_PERSONA,
  type WaiBrainAgentConfig,
  type WaiBrainAgentRevision,
  type WaiBrainRoundId,
} from '../src/index.ts'
import * as WaiBrainSessionPlugin from '../src/session.ts'
import type { WaiBrainAgentRow, WaiBrainConversationRow, WaiBrainDomainState } from '../src/spec.ts'

const fixtureRoot = join(process.cwd(), 'packages/host/waibrain/tests/fixture')
const transcriptExpected = join(process.cwd(), 'packages/host/waibrain/tests/snapshots/one-plus-n.expected.json')
const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.allSettled(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function textResponse(text: string, finishKind: 'stop' | 'max-tokens' = 'stop'): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 8, outputTokens: text.length } },
    { type: 'finish', reason: { kind: finishKind } },
  ]
}

class RoutingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  private readonly holds = new Map<string, Array<{ promise: Promise<void>; release: () => void }>>()
  private readonly finishKinds = new Map<string, 'stop' | 'max-tokens'>()

  holdNext(model: string): () => void {
    let release!: () => void
    const promise = new Promise<void>((resolve) => { release = resolve })
    const queue = this.holds.get(model) ?? []
    queue.push({ promise, release })
    this.holds.set(model, queue)
    return release
  }

  finishNext(model: string, kind: 'stop' | 'max-tokens'): void {
    this.finishKinds.set(model, kind)
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      reasoning: {
        efforts: ['off', 'low', 'high', 'max'].map(id => ({ id: ReasoningEffortId(id), name: id })),
      },
    })
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const hold = this.holds.get(options.model)?.shift()
    if (hold !== undefined) {
      await Promise.race([
        hold.promise,
        new Promise<never>((_resolve, reject) => {
          const rejectAbort = (): void => {
            reject(new Error('aborted'))
          }
          if (options.signal?.aborted === true) rejectAbort()
          else options.signal?.addEventListener('abort', rejectAbort, { once: true })
        }),
      ])
    }
    const system = options.system ?? ''
    const messages = options.messages.flatMap(message => message.content)
      .flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
    const text = system.includes('事实人格')
      ? '事实路答案'
      : system.includes('任务人格')
        ? '任务路答案'
        : messages.includes('【闪念】')
          ? '我吸收了这条闪念。'
          : '我先接住这个问题。'
    const finishKind = this.finishKinds.get(options.model) ?? 'stop'
    this.finishKinds.delete(options.model)
    yield* textResponse(text, finishKind)
  }
}

function config(): WaiBrainAgentConfig {
  return {
    label: '林川',
    role: {
      name: '林川',
      tagline: '长期思考伙伴',
      personality: '温和、诚实',
      voice: '自然、简洁',
      scenario: '长期陪伴',
      greeting: '我在。',
      examples: '用户：你好。\n林川：你好。',
      systemPrompt: '不要解释后台机制。',
    },
    mainSelection: { provider: 'mock', model: 'main', reasoningEffort: 'off' },
    externalBrains: [
      {
        id: 'facts', label: '事实与新知', direction: '查证事实', persona: '事实人格', enabled: true,
        selection: { provider: 'mock', model: 'facts', reasoningEffort: 'high' },
      },
      {
        id: 'tasks', label: '任务与进程', direction: '梳理任务', persona: '任务人格', enabled: true,
        selection: { provider: 'mock', model: 'tasks', reasoningEffort: 'low' },
      },
    ],
  }
}

async function waitFor(check: () => boolean | Promise<boolean>, label: string): Promise<void> {
  const until = Date.now() + 10_000
  while (!await check()) {
    if (Date.now() >= until) throw new Error(`timeout waiting for ${label}`)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

async function harness(
  root?: string,
  adapter = new RoutingAdapter(),
  hostConfig: Partial<{ externalBrainTimeoutMs: number; maxResultBytes: number }> = {},
) {
  const storageRoot = root ?? await mkdtemp(join(tmpdir(), 'dsh-waibrain-runtime-'))
  if (root === undefined) roots.push(storageRoot)
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = `${pathToFileURL(`${join(process.cwd(), 'apps/cli')}/`).href}/`
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(JsonlSessionPersistence, {
    root: join(storageRoot, 'sessions'), compression: 'none', writeBatchMaxDelayMs: 1,
  })
  await ctx.plugin(SystemPrompt, { persona: 'deployment persona' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  await ctx.plugin(ForkInProcess, { providerName: 'fork' })
  await ctx.plugin(AgentPresets, {
    default: 'waibrain-dialog', roots: [{ path: fixtureRoot, trust: 'system' }], includeUserRoot: false,
  })
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: join(storageRoot, 'domain') })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  ctx.llm.registerAdapter(['mock'], adapter)
  await ctx.plugin(WaiBrainHost, {
    maxAdmittedBranches: 8,
    externalBrainTimeoutMs: hostConfig.externalBrainTimeoutMs ?? 2_000,
    externalBrainMaxTokens: 256,
    maxResultBytes: hostConfig.maxResultBytes ?? 1_024,
  })
  return { ctx, service: ctx.waibrainHost, adapter, root: storageRoot }
}

function runtimeInternals(service: typeof Context.prototype.waibrainHost): {
  activeConfigs: Map<SessionId, WaiBrainAgentRevision>
  domain: { global: { get(): WaiBrainDomainState; set(value: WaiBrainDomainState): Promise<void> } }
  agents: {
    get(id: WaiBrainAgentRevision['id']): WaiBrainAgentRow | undefined
    put(id: WaiBrainAgentRevision['id'], value: WaiBrainAgentRow): Promise<void>
  }
  conversations: {
    get(id: WaiBrainConversationRow['id']): WaiBrainConversationRow | undefined
    put(id: WaiBrainConversationRow['id'], value: WaiBrainConversationRow): Promise<void>
    delete(id: WaiBrainConversationRow['id']): Promise<boolean>
  }
  disposeConversationAgent(row: WaiBrainConversationRow): Promise<void>
  childResult(sessionId: SessionId): Promise<{ text: string; truncated: boolean } | undefined>
  contentText(content: readonly unknown[]): string
  clipUtf8(text: string, maxBytes: number): { text: string; truncated: boolean }
  deliverPendingWake(
    conversationId: WaiBrainConversationRow['id'],
    roundId: WaiBrainRoundId,
    externalBrainId: string,
    wakeText: string,
  ): Promise<void>
  recoverWakeText(
    events: readonly SessionEvent[],
    wake: { roundId: WaiBrainRoundId; externalBrainId: string; childSessionId?: SessionId; fallback: string },
  ): Promise<string>
  recoverPendingOperation(): Promise<void>
  unresolvedLanes(events: readonly SessionEvent[]): unknown[]
  trackMain(conversationId: WaiBrainConversationRow['id'], roundId: WaiBrainRoundId, agent: Agent): Promise<void>
  settleExternalBrain(
    conversationId: WaiBrainConversationRow['id'],
    roundId: WaiBrainRoundId,
    brain: WaiBrainAgentConfig['externalBrains'][number],
    run: SubagentRun,
    controller: AbortController,
  ): Promise<void>
} {
  return service as unknown as ReturnType<typeof runtimeInternals>
}

describe('WaiBrain Host standard Session runtime', () => {
  it('runs the source preset companion in neutral and Host-bound admission modes', async () => {
    const instance = await harness()
    const unboundId = SessionId('waibrain-source-neutral')
    const unbound = await instance.ctx.agents.create({
      sessionId: unboundId,
      agentOptions: { provider: 'mock', model: 'main' },
      setup: async (agentCtx) => { await agentCtx.plugin(WaiBrainSessionPlugin) },
    })
    expect(renderPrompt(await unbound.agent.ctx.systemPrompt.assemble({ scope: unbound.agent })))
      .toBe(NEUTRAL_WAIBRAIN_PERSONA)
    unbound.agent.followup(createUserMessage({
      content: [{ type: 'text', text: '普通中性对话' }],
      source: { kind: 'user' },
    }))
    await unbound.agent.whenIdle()
    expect(instance.adapter.requests.at(-1)?.system).toBe(NEUTRAL_WAIBRAIN_PERSONA)
    expect(instance.adapter.requests.at(-1)?.tools ?? []).toEqual([])

    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const boundId = SessionId('waibrain-source-bound')
    const conversationId = '00000000-0000-4000-8000-000000000010' as never
    const internals = runtimeInternals(instance.service)
    internals.activeConfigs.set(boundId, saved.value.agent)
    await internals.domain.global.set({
      ...internals.domain.global.get(),
      pendingOperation: {
        kind: 'create-conversation',
        conversationId,
        agentId: saved.value.agent.id,
        sessionId: boundId,
      },
    })
    const bound = await instance.ctx.agents.create({
      sessionId: boundId,
      agentOptions: { provider: 'mock', model: 'main' },
      setup: async (agentCtx) => { await agentCtx.plugin(WaiBrainSessionPlugin) },
    })
    const before = instance.adapter.requests.length
    bound.agent.followup(createUserMessage({
      content: [{ type: 'text', text: '绕过绑定 Host' }],
      source: { kind: 'user' },
    }))
    await bound.agent.whenIdle()
    expect(instance.adapter.requests).toHaveLength(before)
    expect(bound.agent.session.events.some(event => event.type === 'waibrain/foreign-turn-rejected')).toBe(true)

    await internals.conversations.put(conversationId, {
      id: conversationId,
      agentId: saved.value.agent.id,
      sessionId: boundId,
      createdAt: Date.now(),
      status: 'open',
      hasPendingWake: false,
    })
    await internals.domain.global.set({ ...internals.domain.global.get(), pendingOperation: null })
    const admitted = createUserMessage({
      content: [{ type: 'text', text: '已接纳的绑定消息' }],
      source: { kind: 'user' },
    })
    bound.agent.session.append('waibrain/round-admitted', {
      conversationId,
      roundId: '00000000-0000-4000-8000-000000000011' as never,
      configRevision: saved.value.agent.revision,
      config: saved.value.agent.config,
      userMessageId: admitted.id,
      externalBrains: [],
    })
    bound.agent.followup(admitted)
    await bound.agent.whenIdle()
    expect(instance.adapter.requests).toHaveLength(before + 1)
    expect(instance.adapter.requests.at(-1)?.system).toBe(buildWaiBrainPersona(config()))
    await Promise.all([unbound.dispose(), bound.dispose()])
  }, 20_000)

  it('keeps the source companion neutral when mounted without its optional Host', async () => {
    const adapter = new RoutingAdapter()
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt, { persona: 'deployment persona' })
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    ctx.llm.registerAdapter(['mock'], adapter)
    const handle = await ctx.agents.create({
      sessionId: SessionId('waibrain-without-host'),
      agentOptions: { provider: 'mock', model: 'main' },
      setup: async (agentCtx) => { await agentCtx.plugin(WaiBrainSessionPlugin) },
    })
    handle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: '无 Host 中性对话' }],
      source: { kind: 'user' },
    }))
    await handle.agent.whenIdle()
    expect(adapter.requests.at(-1)?.system).toBe(NEUTRAL_WAIBRAIN_PERSONA)
    await handle.dispose()
  })

  it('runs dynamic 1+N, protects admission, and restores the durable view cold', async () => {
    const first = await harness()
    const saved = await first.service.saveAgent({ expectedRevision: null, config: config() })
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    const created = await first.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code === 'runtime-unavailable' ? created.error.message : created.error.code)
    expect(created).toMatchObject({ ok: true })
    const sessionId = SessionId(created.value.conversation.sessionId)
    const main = first.ctx.agents.get(sessionId)
    expect(main?.session.header).toMatchObject({ agentPreset: 'waibrain-dialog' })
    expect(main?.session.header.systemPrompt).toBeUndefined()

    const admitted = await first.service.prompt({ conversationId: created.value.conversation.id, text: '请帮我想一想。' })
    expect(admitted.ok).toBe(true)
    try {
      await waitFor(async () => {
        const view = await first.service.conversation({ conversationId: created.value.conversation.id })
        return view.ok && !view.value.busy && view.value.rounds[0]?.externalBrains.every(lane => lane.status === 'completed') === true
      }, 'main and two external brains')
    } catch (error) {
      const view = await first.service.conversation({ conversationId: created.value.conversation.id })
      const liveAgents = view.ok
        ? [sessionId, ...view.value.rounds.flatMap(round => round.externalBrains.map(lane => lane.childSessionId))]
          .filter((id): id is string => id !== undefined)
          .map(id => first.ctx.agents.get(SessionId(id)))
          .filter(agent => agent !== undefined)
          .map(agent => ({ id: agent.session.header.id, events: agent.session.events }))
        : []
      throw new Error(JSON.stringify({ error: String(error), view, requests: first.adapter.requests, liveAgents }, null, 2))
    }

    expect(first.adapter.requests).toHaveLength(5)
    const mainRequests = first.adapter.requests.filter(request => request.model === 'main')
    expect(mainRequests).toHaveLength(3)
    expect(mainRequests.every(request => request.system === buildWaiBrainPersona(config()))).toBe(true)
    expect(mainRequests.every(request => (request.tools ?? []).length === 0)).toBe(true)
    expect(first.adapter.requests.find(request => request.model === 'facts')?.reasoningEffort).toBe(ReasoningEffortId('high'))
    expect(first.adapter.requests.find(request => request.model === 'tasks')?.reasoningEffort).toBe(ReasoningEffortId('low'))

    const beforeBypass = await first.service.conversation({ conversationId: created.value.conversation.id })
    expect(beforeBypass.ok).toBe(true)
    const beforeMessageCount = beforeBypass.ok ? beforeBypass.value.messages.length : 0
    main?.followup(createUserMessage({ content: [{ type: 'text', text: '绕过 Host' }], source: { kind: 'user' } }))
    await main?.whenIdle()
    const afterBypass = await first.service.conversation({ conversationId: created.value.conversation.id })
    expect(afterBypass.ok && afterBypass.value.messages).toHaveLength(beforeMessageCount)
    expect(main?.session.events.some(event => event.type === 'waibrain/foreign-turn-rejected')).toBe(true)

    await first.ctx.sessions.flush(main!.session)
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)
    const restarted = await harness(first.root)
    const bootstrap = restarted.service.bootstrap()
    expect(bootstrap.selectedConversationId).toBe(created.value.conversation.id)
    expect(restarted.ctx.agents.get(sessionId)).toBeUndefined()
    const cold = await restarted.service.conversation({ conversationId: created.value.conversation.id })
    expect(cold.ok && cold.value.messages.map(message => message.text)).toEqual([
      '请帮我想一想。',
      '我先接住这个问题。',
      '我吸收了这条闪念。',
      '我吸收了这条闪念。',
    ])
    if (!cold.ok) return
    await expect(`${JSON.stringify({
      messages: cold.value.messages.map(message => ({ role: message.role, text: message.text })),
      rounds: cold.value.rounds.map(round => ({
        configRevision: round.configRevision,
        mainStatus: round.mainStatus,
        externalBrains: round.externalBrains.map(lane => ({
          label: lane.label,
          status: lane.status,
          summary: lane.summary,
        })),
      })),
    }, null, 2)}\n`).toMatchFileSnapshot(transcriptExpected)
  }, 20_000)

  it('admits a new round after the main lane is idle while an older external brain still runs', async () => {
    const adapter = new RoutingAdapter()
    const releaseFacts = adapter.holdNext('facts')
    const instance = await harness(undefined, adapter)
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)

    const first = await instance.service.prompt({ conversationId: created.value.conversation.id, text: '第一轮' })
    expect(first.ok).toBe(true)
    await waitFor(async () => {
      const view = await instance.service.conversation({ conversationId: created.value.conversation.id })
      if (!view.ok) return false
      const round = view.value.rounds[0]
      return !view.value.busy
        && round?.mainStatus === 'completed'
        && round.externalBrains.find(lane => lane.externalBrainId === 'facts')?.status === 'running'
    }, 'main idle before the slow external brain')

    const second = await instance.service.prompt({ conversationId: created.value.conversation.id, text: '第二轮' })
    expect(second.ok).toBe(true)
    releaseFacts()
    await waitFor(async () => {
      const view = await instance.service.conversation({ conversationId: created.value.conversation.id })
      return view.ok
        && !view.value.busy
        && view.value.rounds.length === 2
        && view.value.rounds.every(round => round.externalBrains.every(lane => lane.status === 'completed'))
    }, 'both independent rounds')
  }, 20_000)

  it('returns busy and closed product states while keeping close idempotent', async () => {
    const adapter = new RoutingAdapter()
    const releaseMain = adapter.holdNext('main')
    const instance = await harness(undefined, adapter)
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    await expect(instance.service.selectConversation({ conversationId: created.value.conversation.id }))
      .resolves.toMatchObject({ ok: true })
    await expect(instance.service.prompt({ conversationId: created.value.conversation.id, text: '第一条' }))
      .resolves.toMatchObject({ ok: true })
    await waitFor(() => instance.ctx.agents.get(SessionId(created.value.conversation.sessionId))?.status === 'running', 'busy main lane')
    await expect(instance.service.prompt({ conversationId: created.value.conversation.id, text: '第二条' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'conversation-busy' } })
    releaseMain()
    await waitFor(async () => {
      const view = await instance.service.conversation({ conversationId: created.value.conversation.id })
      return view.ok && !view.value.busy
    }, 'main and late wakes before close')
    await expect(instance.service.closeConversation({ conversationId: created.value.conversation.id }))
      .resolves.toEqual({ ok: true, value: { closed: true } })
    await expect(instance.service.closeConversation({ conversationId: created.value.conversation.id }))
      .resolves.toEqual({ ok: true, value: { closed: true } })
    await expect(instance.service.prompt({ conversationId: created.value.conversation.id, text: '关闭后' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'conversation-closed' } })
  }, 20_000)

  it('records a late result on a closed conversation without waking it and clips UTF-8 safely', async () => {
    const adapter = new RoutingAdapter()
    const releaseFacts = adapter.holdNext('facts')
    const instance = await harness(undefined, adapter, { maxResultBytes: 4 })
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    await instance.service.prompt({ conversationId: created.value.conversation.id, text: '关闭前的问题' })
    await waitFor(async () => {
      const view = await instance.service.conversation({ conversationId: created.value.conversation.id })
      return view.ok && view.value.rounds[0]?.mainStatus === 'completed'
    }, 'main reply before close')
    const before = await instance.service.conversation({ conversationId: created.value.conversation.id })
    if (!before.ok) throw new Error(before.error.code)
    await expect(instance.service.closeConversation({ conversationId: created.value.conversation.id }))
      .resolves.toMatchObject({ ok: true })
    releaseFacts()
    await waitFor(async () => {
      const view = await instance.service.conversation({ conversationId: created.value.conversation.id })
      return view.ok && view.value.rounds[0]?.externalBrains.find(lane => lane.externalBrainId === 'facts')?.status === 'completed'
    }, 'late closed result')
    const after = await instance.service.conversation({ conversationId: created.value.conversation.id })
    if (!after.ok) throw new Error(after.error.code)
    expect(after.value.messages).toEqual(before.value.messages)
    const facts = after.value.rounds[0]?.externalBrains.find(lane => lane.externalBrainId === 'facts')
    expect(facts?.summary).toBe('事')
    expect(facts?.summary).not.toContain('�')
    expect(facts?.truncated).toBe(true)
    expect(instance.adapter.requests.filter(request => request.model === 'main')).toHaveLength(1)
  }, 20_000)

  it('marks interrupted lanes after restart and clears stale busy flags with no pending wake', async () => {
    const first = await harness()
    const saved = await first.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const interrupted = await first.service.createConversation({ agentId: saved.value.agent.id })
    const stale = await first.service.createConversation({ agentId: saved.value.agent.id })
    const orphan = await first.service.createConversation({ agentId: saved.value.agent.id })
    const brainOnly = await first.service.createConversation({ agentId: saved.value.agent.id })
    if (!interrupted.ok) throw new Error(interrupted.error.code)
    if (!stale.ok) throw new Error(stale.error.code)
    if (!orphan.ok) throw new Error(orphan.error.code)
    if (!brainOnly.ok) throw new Error(brainOnly.error.code)

    const interruptedAgent = first.ctx.agents.get(SessionId(interrupted.value.conversation.sessionId))
    if (interruptedAgent === undefined) throw new Error('missing interrupted Agent')
    const roundId = '00000000-0000-4000-8000-000000000020' as never
    interruptedAgent.session.append('waibrain/round-admitted', {
      conversationId: interrupted.value.conversation.id,
      roundId,
      configRevision: saved.value.agent.revision,
      config: saved.value.agent.config,
      userMessageId: MessageId('00000000-0000-4000-8000-000000000021'),
      externalBrains: saved.value.agent.config.externalBrains,
    })
    interruptedAgent.session.append('waibrain/main-status', { roundId, status: 'running' })
    for (const brain of saved.value.agent.config.externalBrains) {
      interruptedAgent.session.append('waibrain/brain-status', {
        roundId,
        externalBrainId: brain.id,
        label: brain.label,
        status: 'running',
      })
    }
    await first.ctx.sessions.flush(interruptedAgent.session)

    const internals = runtimeInternals(first.service)
    const staleRow = internals.conversations.get(stale.value.conversation.id)
    if (staleRow === undefined) throw new Error('missing stale row')
    await internals.conversations.put(staleRow.id, { ...staleRow, hasPendingWake: true })
    const staleAgent = first.ctx.agents.get(SessionId(stale.value.conversation.sessionId))
    if (staleAgent === undefined) throw new Error('missing stale Agent')
    const staleRoundId = '00000000-0000-4000-8000-000000000022' as never
    staleAgent.session.append('waibrain/round-admitted', {
      conversationId: stale.value.conversation.id,
      roundId: staleRoundId,
      configRevision: saved.value.agent.revision,
      config: saved.value.agent.config,
      userMessageId: MessageId('00000000-0000-4000-8000-000000000023'),
      externalBrains: [],
    })
    staleAgent.session.append('waibrain/main-status', { roundId: staleRoundId, status: 'completed' })
    await first.ctx.sessions.flush(staleAgent.session)
    const orphanAgent = first.ctx.agents.get(SessionId(orphan.value.conversation.sessionId))
    if (orphanAgent === undefined) throw new Error('missing orphan Agent')
    const orphanRoundId = '00000000-0000-4000-8000-000000000028' as never
    orphanAgent.session.append('waibrain/round-admitted', {
      conversationId: orphan.value.conversation.id,
      roundId: orphanRoundId,
      configRevision: saved.value.agent.revision,
      config: saved.value.agent.config,
      userMessageId: MessageId('00000000-0000-4000-8000-000000000029'),
      externalBrains: [],
    })
    orphanAgent.session.append('waibrain/main-status', { roundId: orphanRoundId, status: 'running' })
    await first.ctx.sessions.flush(orphanAgent.session)
    const orphanRow = internals.conversations.get(orphan.value.conversation.id)
    if (orphanRow === undefined) throw new Error('missing orphan row')
    await internals.conversations.put(orphanRow.id, {
      ...orphanRow,
      agentId: '00000000-0000-4000-8000-00000000002f' as never,
    })
    const brainOnlyAgent = first.ctx.agents.get(SessionId(brainOnly.value.conversation.sessionId))
    if (brainOnlyAgent === undefined) throw new Error('missing brain-only Agent')
    const brainOnlyRoundId = '00000000-0000-4000-8000-000000000035' as never
    const onlyBrain = saved.value.agent.config.externalBrains[0]!
    brainOnlyAgent.session.append('waibrain/round-admitted', {
      conversationId: brainOnly.value.conversation.id,
      roundId: brainOnlyRoundId,
      configRevision: saved.value.agent.revision,
      config: saved.value.agent.config,
      userMessageId: MessageId('00000000-0000-4000-8000-000000000036'),
      externalBrains: [onlyBrain],
    })
    brainOnlyAgent.session.append('waibrain/main-status', { roundId: brainOnlyRoundId, status: 'completed' })
    brainOnlyAgent.session.append('waibrain/brain-status', {
      roundId: brainOnlyRoundId,
      externalBrainId: onlyBrain.id,
      label: onlyBrain.label,
      status: 'running',
    })
    await first.ctx.sessions.flush(brainOnlyAgent.session)
    await internals.conversations.put('00000000-0000-4000-8000-00000000002a' as never, {
      ...internals.conversations.get(interrupted.value.conversation.id)!,
      id: '00000000-0000-4000-8000-00000000002a' as never,
      sessionId: SessionId('00000000-0000-4000-8000-00000000002b'),
    })
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)

    const restarted = await harness(first.root)
    const interruptedView = await restarted.service.conversation({ conversationId: interrupted.value.conversation.id })
    if (!interruptedView.ok) throw new Error(interruptedView.error.code)
    expect(interruptedView.value.busy).toBe(false)
    expect(interruptedView.value.rounds[0]).toMatchObject({ mainStatus: 'host-restarted' })
    expect(interruptedView.value.rounds[0]?.externalBrains.map(lane => lane.status)).toEqual([
      'host-restarted',
      'host-restarted',
    ])
    const staleView = await restarted.service.conversation({ conversationId: stale.value.conversation.id })
    expect(staleView.ok && staleView.value.busy).toBe(false)
    const brainOnlyView = await restarted.service.conversation({ conversationId: brainOnly.value.conversation.id })
    expect(brainOnlyView.ok && brainOnlyView.value.rounds[0]).toMatchObject({
      mainStatus: 'completed',
      externalBrains: [expect.objectContaining({ status: 'host-restarted' })],
    })
  }, 20_000)

  it('finishes or clears an interrupted conversation-creation transaction after restart', async () => {
    const first = await harness()
    const saved = await first.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await first.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    const agent = first.ctx.agents.get(SessionId(created.value.conversation.sessionId))
    if (agent === undefined) throw new Error('missing transaction Agent')
    const roundId = '00000000-0000-4000-8000-000000000024' as never
    agent.session.append('waibrain/round-admitted', {
      conversationId: created.value.conversation.id,
      roundId,
      configRevision: saved.value.agent.revision,
      config: saved.value.agent.config,
      userMessageId: MessageId('00000000-0000-4000-8000-000000000025'),
      externalBrains: [],
    })
    agent.session.append('waibrain/main-status', { roundId, status: 'completed' })
    await first.ctx.sessions.flush(agent.session)
    const internals = runtimeInternals(first.service)
    const row = internals.conversations.get(created.value.conversation.id)
    if (row === undefined) throw new Error('missing transaction row')
    await internals.conversations.delete(row.id)
    await internals.domain.global.set({
      ...internals.domain.global.get(),
      selectedConversationId: null,
      pendingOperation: {
        kind: 'create-conversation',
        conversationId: row.id,
        agentId: row.agentId,
        sessionId: SessionId(row.sessionId),
      },
    })
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)

    const restarted = await harness(first.root)
    expect(restarted.service.bootstrap()).toMatchObject({
      selectedConversationId: row.id,
      conversations: [expect.objectContaining({ id: row.id })],
    })
    const restartedInternals = runtimeInternals(restarted.service)
    const abandonedId = '00000000-0000-4000-8000-000000000026' as never
    await restartedInternals.domain.global.set({
      ...restartedInternals.domain.global.get(),
      pendingOperation: {
        kind: 'create-conversation',
        conversationId: abandonedId,
        agentId: saved.value.agent.id,
        sessionId: SessionId('00000000-0000-4000-8000-000000000027'),
      },
    })
    await restarted.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(restarted.ctx), 1)
    const cleared = await harness(first.root)
    expect(runtimeInternals(cleared.service).domain.global.get().pendingOperation).toBeNull()
    await expect(cleared.service.conversation({ conversationId: abandonedId }))
      .resolves.toMatchObject({ ok: false, error: { code: 'conversation-not-found' } })

    const clearedInternals = runtimeInternals(cleared.service)
    const inspected = await cleared.ctx.sessionPersistence.inspect(SessionId(row.sessionId))
    const wrongPresetId = '00000000-0000-4000-8000-00000000002c' as never
    const inspect = vi.spyOn(cleared.ctx.sessionPersistence, 'inspect').mockResolvedValueOnce({
      ...inspected,
      meta: { ...inspected.meta, agentPreset: 'other-preset' },
    })
    await clearedInternals.domain.global.set({
      ...clearedInternals.domain.global.get(),
      pendingOperation: {
        kind: 'create-conversation',
        conversationId: wrongPresetId,
        agentId: saved.value.agent.id,
        sessionId: SessionId(row.sessionId),
      },
    })
    await clearedInternals.recoverPendingOperation()
    expect(clearedInternals.conversations.get(wrongPresetId)).toBeUndefined()
    inspect.mockRestore()

    await clearedInternals.domain.global.set({
      ...clearedInternals.domain.global.get(),
      pendingOperation: {
        kind: 'create-conversation',
        conversationId: '00000000-0000-4000-8000-00000000002d' as never,
        agentId: '00000000-0000-4000-8000-00000000002e' as never,
        sessionId: SessionId(row.sessionId),
      },
    })
    await clearedInternals.recoverPendingOperation()
    expect(clearedInternals.domain.global.get().pendingOperation).toBeNull()
  }, 20_000)

  it('delivers a committed pending wake exactly once after restart', async () => {
    const first = await harness()
    const saved = await first.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await first.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    const agent = first.ctx.agents.get(SessionId(created.value.conversation.sessionId))
    if (agent === undefined) throw new Error('missing main Agent')
    const roundId = '00000000-0000-4000-8000-000000000030' as never
    const wakeMessageId = 'waibrain:recovery:pending'
    const brain = saved.value.agent.config.externalBrains[0]!
    agent.session.append('waibrain/round-admitted', {
      conversationId: created.value.conversation.id,
      roundId,
      configRevision: saved.value.agent.revision,
      config: saved.value.agent.config,
      userMessageId: MessageId('00000000-0000-4000-8000-000000000031'),
      externalBrains: [brain],
    })
    agent.session.append('waibrain/main-status', { roundId, status: 'completed' })
    agent.session.append('waibrain/brain-status', {
      roundId,
      externalBrainId: brain.id,
      label: brain.label,
      status: 'completed',
      summary: '恢复后的事实',
    })
    agent.session.append('waibrain/wake-pending', {
      roundId,
      externalBrainId: brain.id,
      wakeMessageId,
      fallback: '恢复后的事实',
    })
    await first.ctx.sessions.flush(agent.session)
    const internals = runtimeInternals(first.service)
    const row = internals.conversations.get(created.value.conversation.id)
    if (row === undefined) throw new Error('missing conversation row')
    await internals.conversations.put(row.id, { ...row, hasPendingWake: true })
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)

    const restarted = await harness(first.root)
    await waitFor(async () => {
      const view = await restarted.service.conversation({ conversationId: created.value.conversation.id })
      return view.ok && !view.value.busy && view.value.messages.some(message => message.text === '我吸收了这条闪念。')
    }, 'recovered late wake')
    expect(restarted.adapter.requests.filter(request => request.model === 'main')).toHaveLength(1)
    const live = restarted.ctx.agents.get(SessionId(created.value.conversation.sessionId))
    expect(live?.session.events.filter(event => event.type === 'waibrain/wake-delivered')).toHaveLength(1)
    await restarted.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(restarted.ctx), 1)

    const secondRestart = await harness(first.root)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(secondRestart.adapter.requests).toHaveLength(0)
    const cold = await secondRestart.service.conversation({ conversationId: created.value.conversation.id })
    expect(cold.ok && cold.value.messages.filter(message => message.text === '我吸收了这条闪念。')).toHaveLength(1)
  }, 20_000)

  it('reconciles entered and closed pending wakes without replaying either model turn', async () => {
    const first = await harness()
    const saved = await first.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const entered = await first.service.createConversation({ agentId: saved.value.agent.id })
    const closed = await first.service.createConversation({ agentId: saved.value.agent.id })
    if (!entered.ok) throw new Error(entered.error.code)
    if (!closed.ok) throw new Error(closed.error.code)
    const internals = runtimeInternals(first.service)

    for (const [created, suffix, status] of [
      [entered, 'entered', 'open'],
      [closed, 'closed', 'closed'],
    ] as const) {
      const agent = first.ctx.agents.get(SessionId(created.value.conversation.sessionId))
      if (agent === undefined) throw new Error('missing recovery Agent')
      const roundId = `00000000-0000-4000-8000-00000000004${suffix === 'entered' ? '0' : '1'}` as never
      const wakeMessageId = `waibrain:recovery:${suffix}`
      const brain = saved.value.agent.config.externalBrains[0]!
      agent.session.append('waibrain/round-admitted', {
        conversationId: created.value.conversation.id,
        roundId,
        configRevision: saved.value.agent.revision,
        config: saved.value.agent.config,
        userMessageId: MessageId(`00000000-0000-4000-8000-00000000005${suffix === 'entered' ? '0' : '1'}`),
        externalBrains: [brain],
      })
      agent.session.append('waibrain/main-status', { roundId, status: 'completed' })
      agent.session.append('waibrain/brain-status', {
        roundId,
        externalBrainId: brain.id,
        label: brain.label,
        status: 'completed',
        summary: suffix,
      })
      agent.session.append('waibrain/wake-pending', {
        roundId,
        externalBrainId: brain.id,
        wakeMessageId,
        fallback: suffix,
      })
      if (suffix === 'entered') {
        agent.session.append('user/message', freezeMessage({
          id: MessageId(wakeMessageId),
          role: 'user',
          content: [{ type: 'text', text: '已进入但未标记' }],
          source: {
            kind: 'waibrain-result',
            conversationId: created.value.conversation.id,
            roundId,
            externalBrainId: brain.id,
          },
        }), { surfaceOp: 'append' })
      }
      await first.ctx.sessions.flush(agent.session)
      const row = internals.conversations.get(created.value.conversation.id)
      if (row === undefined) throw new Error('missing recovery row')
      await internals.conversations.put(row.id, { ...row, status, hasPendingWake: true })
    }
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)

    const restarted = await harness(first.root)
    expect(restarted.adapter.requests).toHaveLength(0)
    for (const created of [entered, closed]) {
      const view = await restarted.service.conversation({ conversationId: created.value.conversation.id })
      expect(view.ok && view.value.busy).toBe(false)
    }
    const enteredEvents = (await restarted.ctx.sessionPersistence.inspect(SessionId(entered.value.conversation.sessionId))).events
    const closedEvents = (await restarted.ctx.sessionPersistence.inspect(SessionId(closed.value.conversation.sessionId))).events
    expect(enteredEvents.some(event => event.type === 'waibrain/wake-delivered')).toBe(true)
    expect(closedEvents.some(event => event.type === 'waibrain/wake-discarded-on-close')).toBe(true)
  }, 20_000)

  it('records startup and settlement infrastructure failures as independent lane errors', async () => {
    const instance = await harness()
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    vi.spyOn(instance.ctx.subagents, 'start').mockRejectedValueOnce(new Error('fork unavailable'))
    await expect(instance.service.prompt({ conversationId: created.value.conversation.id, text: '部分启动失败' }))
      .resolves.toMatchObject({ ok: true })
    await waitFor(async () => {
      const view = await instance.service.conversation({ conversationId: created.value.conversation.id })
      return view.ok
        && !view.value.busy
        && view.value.rounds[0]?.externalBrains.every(lane => lane.status !== 'running') === true
    }, 'startup failure settlement')
    const first = await instance.service.conversation({ conversationId: created.value.conversation.id })
    if (!first.ok) throw new Error(first.error.code)
    expect(first.value.rounds[0]?.externalBrains.find(lane => lane.externalBrainId === 'facts'))
      .toMatchObject({ status: 'error', summary: 'fork unavailable' })
    expect(first.value.rounds[0]?.externalBrains.find(lane => lane.externalBrainId === 'tasks')?.status).toBe('completed')

    vi.restoreAllMocks()
    vi.spyOn(instance.ctx.subagents, 'start').mockRejectedValueOnce('fork unavailable as text')
    await waitFor(async () => {
      const admission = await instance.service.prompt({ conversationId: created.value.conversation.id, text: '非 Error 启动失败' })
      return admission.ok
    }, 'next admission after the prior late wake')
    await waitFor(async () => {
      const view = await instance.service.conversation({ conversationId: created.value.conversation.id })
      return view.ok && view.value.rounds.length === 2
        && view.value.rounds[1]?.externalBrains.every(lane => lane.status !== 'running') === true
    }, 'non-Error startup failure settlement')

    const agent = instance.ctx.agents.get(SessionId(created.value.conversation.sessionId))
    if (agent === undefined) throw new Error('missing main Agent')
    const brain = saved.value.agent.config.externalBrains[0]!
    const roundId = '00000000-0000-4000-8000-000000000060' as never
    agent.session.append('waibrain/round-admitted', {
      conversationId: created.value.conversation.id,
      roundId,
      configRevision: saved.value.agent.revision,
      config: saved.value.agent.config,
      userMessageId: MessageId('00000000-0000-4000-8000-000000000061'),
      externalBrains: [brain],
    })
    agent.session.append('waibrain/main-status', { roundId, status: 'completed' })
    agent.session.append('waibrain/brain-status', {
      roundId,
      externalBrainId: brain.id,
      label: brain.label,
      status: 'running',
    })
    await instance.ctx.sessions.flush(agent.session)
    await runtimeInternals(instance.service).settleExternalBrain(
      created.value.conversation.id,
      roundId,
      brain,
      {
        id: SessionId('00000000-0000-4000-8000-000000000062'),
        localAgent: undefined,
        result: Promise.resolve({ output: [], stopReason: 'completed' }),
        dispose: () => Promise.resolve(),
      },
      new AbortController(),
    )
    const second = await instance.service.conversation({ conversationId: created.value.conversation.id })
    if (!second.ok) throw new Error(second.error.code)
    expect(second.value.rounds.at(-1)?.externalBrains[0]).toMatchObject({
      status: 'error',
      summary: 'fork provider did not expose its local child Agent',
    })
  }, 20_000)

  it('records a main-lane tracking failure instead of leaving the round running', async () => {
    const instance = await harness()
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    const agent = instance.ctx.agents.get(SessionId(created.value.conversation.sessionId))
    if (agent === undefined) throw new Error('missing main Agent')
    const roundId = '00000000-0000-4000-8000-000000000063' as never
    agent.session.append('waibrain/round-admitted', {
      conversationId: created.value.conversation.id,
      roundId,
      configRevision: saved.value.agent.revision,
      config: saved.value.agent.config,
      userMessageId: MessageId('00000000-0000-4000-8000-000000000064'),
      externalBrains: [],
    })
    agent.session.append('waibrain/main-status', { roundId, status: 'running' })
    await instance.ctx.sessions.flush(agent.session)
    await runtimeInternals(instance.service).trackMain(created.value.conversation.id, roundId, agent)
    let view = await instance.service.conversation({ conversationId: created.value.conversation.id })
    if (!view.ok) throw new Error(view.error.code)
    expect(view.value.rounds[0]?.mainStatus).toBe('failed')

    agent.session.append('waibrain/main-status', { roundId, status: 'running' })
    const whenIdle = vi.spyOn(agent, 'whenIdle').mockRejectedValueOnce(new Error('main tracker unavailable'))
    await runtimeInternals(instance.service).trackMain(created.value.conversation.id, roundId, agent)
    whenIdle.mockRestore()
    view = await instance.service.conversation({ conversationId: created.value.conversation.id })
    if (!view.ok) throw new Error(view.error.code)
    expect(view.value.rounds[0]?.mainStatus).toBe('failed')

    const missingWhenIdle = vi.spyOn(agent, 'whenIdle').mockRejectedValueOnce(new Error('missing parent'))
    await runtimeInternals(instance.service).trackMain(
      '00000000-0000-4000-8000-000000000065' as never,
      roundId,
      agent,
    )
    missingWhenIdle.mockRestore()

    agent.session.append('waibrain/main-status', { roundId, status: 'running' })
    const failedWhenIdle = vi.spyOn(agent, 'whenIdle').mockRejectedValueOnce(new Error('record failure'))
    const failedFlush = vi.spyOn(instance.ctx.sessions, 'flush').mockRejectedValueOnce(new Error('persistence unavailable'))
    await runtimeInternals(instance.service).trackMain(created.value.conversation.id, roundId, agent)
    failedWhenIdle.mockRestore()
    failedFlush.mockRestore()
  }, 20_000)

  it('treats a main response stopped at its token ceiling as a settled main lane', async () => {
    const adapter = new RoutingAdapter()
    adapter.finishNext('main', 'max-tokens')
    const instance = await harness(undefined, adapter)
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    await instance.service.prompt({ conversationId: created.value.conversation.id, text: '主路达到 token 上限' })
    await waitFor(async () => {
      const view = await instance.service.conversation({ conversationId: created.value.conversation.id })
      return view.ok && view.value.rounds[0]?.mainStatus === 'completed'
    }, 'max-token main settlement')
  }, 20_000)

  it('projects empty and failed external results without scheduling a wake', async () => {
    const instance = await harness()
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    const agent = instance.ctx.agents.get(SessionId(created.value.conversation.sessionId))
    if (agent === undefined) throw new Error('missing result Agent')
    const internals = runtimeInternals(instance.service)
    const brain = saved.value.agent.config.externalBrains[0]!
    const cases = [
      { suffix: '0', output: [], stopReason: 'completed' as const, expected: 'empty' },
      { suffix: '1', output: [], stopReason: 'error' as const, expected: 'error' },
    ]
    for (const item of cases) {
      const roundId = `00000000-0000-4000-8000-00000000015${item.suffix}` as never
      agent.session.append('waibrain/round-admitted', {
        conversationId: created.value.conversation.id,
        roundId,
        configRevision: saved.value.agent.revision,
        config: saved.value.agent.config,
        userMessageId: MessageId(`00000000-0000-4000-8000-00000000016${item.suffix}`),
        externalBrains: [brain],
      })
      agent.session.append('waibrain/main-status', { roundId, status: 'completed' })
      agent.session.append('waibrain/brain-status', {
        roundId,
        externalBrainId: brain.id,
        label: brain.label,
        status: 'running',
      })
      await internals.settleExternalBrain(
        created.value.conversation.id,
        roundId,
        brain,
        {
          id: SessionId(`00000000-0000-4000-8000-00000000017${item.suffix}`),
          localAgent: agent,
          result: Promise.resolve({ output: item.output, stopReason: item.stopReason }),
          dispose: () => Promise.resolve(),
        },
        new AbortController(),
      )
    }
    const view = await instance.service.conversation({ conversationId: created.value.conversation.id })
    if (!view.ok) throw new Error(view.error.code)
    expect(view.value.rounds.map(round => round.externalBrains[0]?.status)).toEqual(['empty', 'error'])
    expect(view.value.rounds[1]?.externalBrains[0]?.summary).toBe('外挂外脑没有返回正文')
    expect(view.value.busy).toBe(false)

    await internals.settleExternalBrain(
      '00000000-0000-4000-8000-000000000180' as never,
      '00000000-0000-4000-8000-000000000181' as never,
      brain,
      {
        id: SessionId('00000000-0000-4000-8000-000000000182'),
        localAgent: agent,
        result: Promise.resolve({ output: [{ type: 'text', text: '孤立结果' }], stopReason: 'completed' }),
        dispose: () => Promise.resolve(),
      },
      new AbortController(),
    )
    await internals.settleExternalBrain(
      '00000000-0000-4000-8000-000000000183' as never,
      '00000000-0000-4000-8000-000000000184' as never,
      brain,
      {
        id: SessionId('00000000-0000-4000-8000-000000000185'),
        localAgent: undefined,
        result: Promise.reject(new Error('settlement rejected')),
        dispose: () => Promise.resolve(),
      },
      new AbortController(),
    )
    const stringSettlement = vi.fn<() => SubagentRun['result']>().mockRejectedValue('settlement rejected as text')
    await internals.settleExternalBrain(
      '00000000-0000-4000-8000-000000000188' as never,
      '00000000-0000-4000-8000-000000000189' as never,
      brain,
      {
        id: SessionId('00000000-0000-4000-8000-000000000190'),
        localAgent: undefined,
        result: stringSettlement(),
        dispose: () => Promise.resolve(),
      },
      new AbortController(),
    )

    const failedFlush = vi.spyOn(instance.ctx.sessions, 'flush').mockRejectedValueOnce(new Error('lane record unavailable'))
    await internals.settleExternalBrain(
      created.value.conversation.id,
      '00000000-0000-4000-8000-000000000186' as never,
      brain,
      {
        id: SessionId('00000000-0000-4000-8000-000000000187'),
        localAgent: undefined,
        result: Promise.resolve({ output: [], stopReason: 'completed' }),
        dispose: () => Promise.resolve(),
      },
      new AbortController(),
    )
    failedFlush.mockRestore()
  }, 20_000)

  it('persists child and parent results before release and releases every failed run', async () => {
    const instance = await harness()
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    const parent = instance.ctx.agents.get(SessionId(created.value.conversation.sessionId))
    if (parent === undefined) throw new Error('missing settlement parent Agent')
    const internals = runtimeInternals(instance.service)
    const brain = saved.value.agent.config.externalBrains[0]!
    const appendRunningRound = (roundId: WaiBrainRoundId, suffix: string): void => {
      parent.session.append('waibrain/round-admitted', {
        conversationId: created.value.conversation.id,
        roundId,
        configRevision: saved.value.agent.revision,
        config: saved.value.agent.config,
        userMessageId: MessageId(`00000000-0000-4000-8000-00000000019${suffix}`),
        externalBrains: [brain],
      })
      parent.session.append('waibrain/main-status', { roundId, status: 'completed' })
      parent.session.append('waibrain/brain-status', {
        roundId,
        externalBrainId: brain.id,
        label: brain.label,
        status: 'running',
      })
    }

    const orderedRoundId = '00000000-0000-4000-8000-000000000191' as WaiBrainRoundId
    appendRunningRound(orderedRoundId, '2')
    await instance.ctx.sessions.flush(parent.session)
    const child = await instance.ctx.agents.create({
      sessionId: SessionId('00000000-0000-4000-8000-000000000193'),
      agentOptions: { provider: 'mock', model: 'facts' },
      setup: async () => {},
    })
    const order: string[] = []
    const flushSession = instance.ctx.sessions.flush.bind(instance.ctx.sessions)
    const flush = vi.spyOn(instance.ctx.sessions, 'flush').mockImplementation(async (session) => {
      order.push(session.header.id === child.agent.id ? 'child' : 'parent')
      return flushSession(session)
    })
    await internals.settleExternalBrain(created.value.conversation.id, orderedRoundId, brain, {
      id: child.agent.id,
      localAgent: child.agent,
      result: Promise.resolve({ output: [], stopReason: 'completed' }),
      dispose: async () => {
        order.push('dispose')
        await child.dispose()
      },
    }, new AbortController())
    flush.mockRestore()
    expect(order).toEqual(['child', 'parent', 'dispose'])
    const persisted = await instance.ctx.sessionPersistence.inspect(parent.id)
    expect(persisted.events.some(event => event.type === 'waibrain/brain-status'
      && event.data.roundId === orderedRoundId
      && event.data.childSessionId === child.agent.id)).toBe(true)

    const rejectedDispose = vi.fn().mockResolvedValue(undefined)
    await internals.settleExternalBrain(
      '00000000-0000-4000-8000-000000000194' as never,
      '00000000-0000-4000-8000-000000000195' as never,
      brain,
      {
        id: SessionId('00000000-0000-4000-8000-000000000196'),
        localAgent: undefined,
        result: Promise.reject(new Error('result transport failed')),
        dispose: rejectedDispose,
      },
      new AbortController(),
    )
    expect(rejectedDispose).toHaveBeenCalledOnce()

    const releaseFailureRoundId = '00000000-0000-4000-8000-000000000197' as WaiBrainRoundId
    appendRunningRound(releaseFailureRoundId, '8')
    await instance.ctx.sessions.flush(parent.session)
    const releaseFailureChild = await instance.ctx.agents.create({
      sessionId: SessionId('00000000-0000-4000-8000-000000000199'),
      agentOptions: { provider: 'mock', model: 'facts' },
      setup: async () => {},
    })
    await expect(internals.settleExternalBrain(created.value.conversation.id, releaseFailureRoundId, brain, {
      id: releaseFailureChild.agent.id,
      localAgent: releaseFailureChild.agent,
      result: Promise.resolve({ output: [], stopReason: 'completed' }),
      dispose: vi.fn().mockRejectedValue(new Error('child release failed')),
    }, new AbortController())).resolves.toBeUndefined()
    const view = await instance.service.conversation({ conversationId: created.value.conversation.id })
    if (!view.ok) throw new Error(view.error.code)
    expect(view.value.rounds.find(round => round.id === releaseFailureRoundId)?.externalBrains[0]?.status).toBe('empty')
  }, 20_000)

  it('rolls back failed creation and reports prompt admission configuration failures', async () => {
    const instance = await harness()
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const internals = runtimeInternals(instance.service)
    const put = vi.spyOn(internals.conversations, 'put').mockRejectedValueOnce('conversation storage unavailable')
    await expect(instance.service.createConversation({ agentId: saved.value.agent.id })).resolves.toEqual({
      ok: false,
      error: { code: 'runtime-unavailable', message: 'conversation storage unavailable' },
    })
    expect(internals.domain.global.get().pendingOperation).toBeNull()
    put.mockRestore()

    const replacementConversationId = '00000000-0000-4000-8000-000000000071' as never
    const replaced = vi.spyOn(internals.conversations, 'put').mockImplementationOnce(async () => {
      await internals.domain.global.set({
        ...internals.domain.global.get(),
        pendingOperation: {
          kind: 'create-conversation',
          conversationId: replacementConversationId,
          agentId: saved.value.agent.id,
          sessionId: SessionId('00000000-0000-4000-8000-000000000072'),
        },
      })
      throw new Error('superseded transaction failed')
    })
    await expect(instance.service.createConversation({ agentId: saved.value.agent.id }))
      .resolves.toMatchObject({ ok: false, error: { code: 'runtime-unavailable' } })
    expect(internals.domain.global.get().pendingOperation?.conversationId).toBe(replacementConversationId)
    replaced.mockRestore()
    await internals.domain.global.set({ ...internals.domain.global.get(), pendingOperation: null })

    const create = vi.spyOn(instance.ctx.agents, 'create').mockRejectedValueOnce(new Error('Agent create unavailable'))
    await expect(instance.service.createConversation({ agentId: saved.value.agent.id })).resolves.toEqual({
      ok: false,
      error: { code: 'runtime-unavailable', message: 'Agent create unavailable' },
    })
    create.mockRestore()

    const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    const row = internals.conversations.get(created.value.conversation.id)
    if (row === undefined) throw new Error('missing prompt row')
    await internals.conversations.put(row.id, {
      ...row,
      agentId: '00000000-0000-4000-8000-000000000070' as never,
    })
    await expect(instance.service.prompt({ conversationId: row.id, text: '缺少 Agent' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'runtime-unavailable' } })
    await internals.conversations.put(row.id, row)

    const agentRow = internals.agents.get(saved.value.agent.id)
    if (agentRow === undefined) throw new Error('missing Agent row')
    const current = agentRow.revisions.at(-1)!
    await internals.agents.put(saved.value.agent.id, {
      ...agentRow,
      revisions: [
        ...agentRow.revisions.slice(0, -1),
        {
          ...current,
          config: {
            ...current.config,
            externalBrains: Array.from({ length: 9 }, (_, index) => ({
              ...current.config.externalBrains[0]!,
              id: `extra-${index}`,
            })),
          },
        },
      ],
    })
    await expect(instance.service.prompt({ conversationId: row.id, text: '分支漂移' })).resolves.toEqual({
      ok: false,
      error: { code: 'branch-limit-exceeded', maxAdmittedBranches: 8, enabledCount: 9 },
    })
    await internals.agents.put(saved.value.agent.id, agentRow)

    await internals.disposeConversationAgent(row)
    const resume = vi.spyOn(instance.ctx.agents, 'resume').mockRejectedValueOnce(new Error('resume unavailable'))
    await expect(instance.service.prompt({ conversationId: row.id, text: '恢复失败' })).resolves.toEqual({
      ok: false,
      error: { code: 'runtime-unavailable', message: 'resume unavailable' },
    })
    resume.mockRestore()
    const stringResume = vi.spyOn(instance.ctx.agents, 'resume').mockRejectedValueOnce('resume unavailable as text')
    await expect(instance.service.prompt({ conversationId: row.id, text: '非 Error 恢复失败' })).resolves.toEqual({
      ok: false,
      error: { code: 'runtime-unavailable', message: 'resume unavailable as text' },
    })
    stringResume.mockRestore()
  }, 20_000)

  it('closes a cold conversation by discarding its durable pending wake', async () => {
    const instance = await harness()
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    const agent = instance.ctx.agents.get(SessionId(created.value.conversation.sessionId))
    if (agent === undefined) throw new Error('missing close Agent')
    const roundId = '00000000-0000-4000-8000-000000000080' as never
    const brain = saved.value.agent.config.externalBrains[0]!
    agent.session.append('waibrain/round-admitted', {
      conversationId: created.value.conversation.id,
      roundId,
      configRevision: saved.value.agent.revision,
      config: saved.value.agent.config,
      userMessageId: MessageId('00000000-0000-4000-8000-000000000081'),
      externalBrains: [brain],
    })
    agent.session.append('waibrain/main-status', { roundId, status: 'completed' })
    agent.session.append('waibrain/brain-status', {
      roundId,
      externalBrainId: brain.id,
      label: brain.label,
      status: 'completed',
      summary: '关闭前已提交',
    })
    agent.session.append('waibrain/wake-pending', {
      roundId,
      externalBrainId: brain.id,
      wakeMessageId: 'waibrain:close:cold',
      fallback: '关闭前已提交',
    })
    await instance.ctx.sessions.flush(agent.session)
    const internals = runtimeInternals(instance.service)
    const row = internals.conversations.get(created.value.conversation.id)
    if (row === undefined) throw new Error('missing close row')
    await internals.conversations.put(row.id, { ...row, hasPendingWake: true })
    await internals.disposeConversationAgent(row)
    await internals.disposeConversationAgent(row)

    await expect(instance.service.closeConversation({ conversationId: row.id }))
      .resolves.toEqual({ ok: true, value: { closed: true } })
    const view = await instance.service.conversation({ conversationId: row.id })
    expect(view.ok && view.value.conversation.status).toBe('closed')
    expect(view.ok && view.value.busy).toBe(false)
    const events = (await instance.ctx.sessionPersistence.inspect(SessionId(row.sessionId))).events
    expect(events.some(event => event.type === 'waibrain/wake-discarded-on-close')).toBe(true)
  }, 20_000)

  it('rejects a cold pending close when its Agent revision or resume runtime is unavailable', async () => {
    const instance = await harness()
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    const agent = instance.ctx.agents.get(SessionId(created.value.conversation.sessionId))
    if (agent === undefined) throw new Error('missing rejected-close Agent')
    const roundId = '00000000-0000-4000-8000-000000000083' as never
    agent.session.append('waibrain/wake-pending', {
      roundId,
      externalBrainId: 'facts',
      wakeMessageId: 'waibrain:close:rejected',
      fallback: '待处理',
    })
    await instance.ctx.sessions.flush(agent.session)
    const internals = runtimeInternals(instance.service)
    const row = internals.conversations.get(created.value.conversation.id)
    if (row === undefined) throw new Error('missing rejected-close row')
    await internals.conversations.put(row.id, { ...row, hasPendingWake: true })
    await internals.disposeConversationAgent(row)
    await internals.conversations.put(row.id, {
      ...row,
      agentId: '00000000-0000-4000-8000-000000000084' as never,
      hasPendingWake: true,
    })
    await expect(instance.service.closeConversation({ conversationId: row.id }))
      .resolves.toMatchObject({ ok: false, error: { code: 'runtime-unavailable' } })

    await internals.conversations.put(row.id, { ...row, hasPendingWake: true })
    const resume = vi.spyOn(instance.ctx.agents, 'resume').mockRejectedValueOnce('resume close unavailable')
    await expect(instance.service.closeConversation({ conversationId: row.id })).resolves.toEqual({
      ok: false,
      error: { code: 'runtime-unavailable', message: 'resume close unavailable' },
    })
    resume.mockRestore()
    const errorResume = vi.spyOn(instance.ctx.agents, 'resume').mockRejectedValueOnce(new Error('resume close Error'))
    await expect(instance.service.closeConversation({ conversationId: row.id })).resolves.toEqual({
      ok: false,
      error: { code: 'runtime-unavailable', message: 'resume close Error' },
    })
    errorResume.mockRestore()
  }, 20_000)

  it('projects empty messages, unknown lanes, unavailable child results, and every admission source', async () => {
    const instance = await harness()
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    const agent = instance.ctx.agents.get(SessionId(created.value.conversation.sessionId))
    if (agent === undefined) throw new Error('missing projection Agent')
    const roundId = '00000000-0000-4000-8000-000000000090' as never
    const admittedId = MessageId('00000000-0000-4000-8000-000000000091')
    agent.session.append('waibrain/round-admitted', {
      conversationId: created.value.conversation.id,
      roundId,
      configRevision: saved.value.agent.revision,
      config: saved.value.agent.config,
      userMessageId: admittedId,
      externalBrains: [],
    })
    agent.session.append('waibrain/main-status', { roundId, status: 'completed' })
    agent.session.append('waibrain/brain-status', {
      roundId,
      externalBrainId: 'late-added',
      label: '迟到外挂',
      status: 'completed',
      childSessionId: SessionId('00000000-0000-4000-8000-000000000092'),
      summary: '持久化摘要',
      truncated: true,
    })
    agent.session.append('waibrain/brain-status', {
      roundId,
      externalBrainId: 'late-empty',
      label: '无附加字段',
      status: 'error',
    })
    agent.session.append('waibrain/main-status', {
      roundId: '00000000-0000-4000-8000-000000000093' as never,
      status: 'failed',
    })
    agent.session.append('waibrain/brain-status', {
      roundId: '00000000-0000-4000-8000-000000000093' as never,
      externalBrainId: 'orphan',
      label: '孤立状态',
      status: 'error',
    })
    agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: '' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    agent.session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: createAssistantMessage({
        content: [{ type: 'text', text: '' }],
        source: { provider: 'mock', model: 'main' },
      }),
    }, { surfaceOp: 'append' })
    await instance.ctx.sessions.flush(agent.session)

    const view = await instance.service.conversation({ conversationId: created.value.conversation.id })
    if (!view.ok) throw new Error(view.error.code)
    expect(view.value.messages).toEqual([])
    expect(view.value.rounds[0]?.externalBrains).toEqual([
      {
        externalBrainId: 'late-added',
        label: '迟到外挂',
        status: 'completed',
        childSessionId: '00000000-0000-4000-8000-000000000092',
        summary: '持久化摘要',
        truncated: true,
        resultUnavailable: true,
      },
      {
        externalBrainId: 'late-empty',
        label: '无附加字段',
        status: 'error',
      },
    ])

    const internals = runtimeInternals(instance.service)
    expect(internals.unresolvedLanes(agent.session.events)).toEqual([])
    await expect(internals.childResult(agent.id)).resolves.toEqual({ text: '', truncated: false })
    const empty = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!empty.ok) throw new Error(empty.error.code)
    await expect(internals.childResult(SessionId(empty.value.conversation.sessionId))).resolves.toBeUndefined()
    expect(internals.contentText([
      { type: 'reasoning', text: '不可见推理' },
      { type: 'text', text: '可见正文' },
    ])).toBe('可见正文')
    expect(internals.clipUtf8('截断', 0)).toEqual({ text: '', truncated: true })
    await expect(instance.service.authorizeMessages(agent, [])).resolves.toBe(true)

    const admitted = freezeMessage({
      id: admittedId,
      role: 'user',
      content: [{ type: 'text', text: '已接纳' }],
      source: { kind: 'user' },
    })
    await expect(instance.service.authorizeMessages(agent, [admitted])).resolves.toBe(true)
    agent.session.append('user/message', admitted, { surfaceOp: 'append' })
    await expect(instance.service.authorizeMessages(agent, [admitted])).resolves.toBe(false)

    const wakeMessageId = 'waibrain:projection:wake'
    agent.session.append('waibrain/wake-pending', {
      roundId,
      externalBrainId: 'late-added',
      wakeMessageId,
      fallback: '外挂结果',
    })
    const wake = freezeMessage({
      id: MessageId(wakeMessageId),
      role: 'user',
      content: [{ type: 'text', text: '外挂结果' }],
      source: {
        kind: 'waibrain-result',
        conversationId: created.value.conversation.id,
        roundId,
        externalBrainId: 'late-added',
      },
    })
    await expect(instance.service.authorizeMessages(agent, [wake])).resolves.toBe(true)
    await expect(instance.service.authorizeMessages(agent, [{
      ...wake,
      id: MessageId('waibrain:projection:foreign'),
      source: { kind: 'foreign-source' },
    } as never])).resolves.toBe(false)
    await expect(instance.service.authorizeMessages(agent, [{
      ...wake,
      source: { ...wake.source, externalBrainId: 'wrong' },
    }])).resolves.toBe(false)
  }, 20_000)

  it('makes pending-wake delivery idempotent across missing, closed, and already-entered states', async () => {
    const instance = await harness()
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    const agent = instance.ctx.agents.get(SessionId(created.value.conversation.sessionId))
    if (agent === undefined) throw new Error('missing wake Agent')
    const internals = runtimeInternals(instance.service)
    const roundId = '00000000-0000-4000-8000-000000000130' as never
    const wakeMessageId = 'waibrain:delivery:entered'
    const brain = saved.value.agent.config.externalBrains[0]!
    agent.session.append('waibrain/round-admitted', {
      conversationId: created.value.conversation.id,
      roundId,
      configRevision: saved.value.agent.revision,
      config: saved.value.agent.config,
      userMessageId: MessageId('00000000-0000-4000-8000-000000000131'),
      externalBrains: [brain],
    })
    agent.session.append('waibrain/main-status', { roundId, status: 'completed' })
    agent.session.append('waibrain/wake-pending', {
      roundId,
      externalBrainId: brain.id,
      wakeMessageId,
      fallback: '已进入',
    })
    agent.session.append('user/message', freezeMessage({
      id: MessageId(wakeMessageId),
      role: 'user',
      content: [{ type: 'text', text: '已进入' }],
      source: {
        kind: 'waibrain-result',
        conversationId: created.value.conversation.id,
        roundId,
        externalBrainId: brain.id,
      },
    }), { surfaceOp: 'append' })
    await instance.ctx.sessions.flush(agent.session)
    const row = internals.conversations.get(created.value.conversation.id)
    if (row === undefined) throw new Error('missing wake row')
    await internals.conversations.put(row.id, { ...row, hasPendingWake: true })

    await internals.deliverPendingWake(row.id, roundId, brain.id, '不会重复进入')
    expect(agent.session.events.filter(event => event.type === 'waibrain/wake-delivered')).toHaveLength(1)
    expect(instance.adapter.requests).toHaveLength(0)
    await internals.deliverPendingWake(row.id, roundId, brain.id, '已经送达')
    expect(agent.session.events.filter(event => event.type === 'waibrain/wake-delivered')).toHaveLength(1)

    await internals.deliverPendingWake(
      '00000000-0000-4000-8000-000000000132' as never,
      roundId,
      brain.id,
      '会话不存在',
    )
    await internals.conversations.put(row.id, {
      ...row,
      agentId: '00000000-0000-4000-8000-000000000133' as never,
    })
    await internals.deliverPendingWake(row.id, roundId, brain.id, 'Agent 不存在')
    await internals.conversations.put(row.id, { ...row, status: 'closed' })
    await internals.deliverPendingWake(row.id, roundId, brain.id, '会话已关闭')
    expect(instance.adapter.requests).toHaveLength(0)
  }, 20_000)

  it('keeps post-delivery race guards idempotent when close or another committer wins', async () => {
    const instance = await harness()
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const internals = runtimeInternals(instance.service)
    const brain = saved.value.agent.config.externalBrains[0]!

    const prepare = async (suffix: string) => {
      const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
      if (!created.ok) throw new Error(created.error.code)
      const agent = instance.ctx.agents.get(SessionId(created.value.conversation.sessionId))
      if (agent === undefined) throw new Error('missing race Agent')
      const roundId = `00000000-0000-4000-8000-00000000019${suffix}` as never
      const wakeMessageId = `waibrain:race:${suffix}`
      agent.session.append('waibrain/wake-pending', {
        roundId,
        externalBrainId: brain.id,
        wakeMessageId,
        fallback: '竞态结果',
      })
      await instance.ctx.sessions.flush(agent.session)
      const row = internals.conversations.get(created.value.conversation.id)
      if (row === undefined) throw new Error('missing race row')
      await internals.conversations.put(row.id, { ...row, hasPendingWake: true })
      return { agent, row, roundId, wakeMessageId }
    }

    const closing = await prepare('0')
    const closingIdle = closing.agent.whenIdle.bind(closing.agent)
    let closingWaits = 0
    const closeRace = vi.spyOn(closing.agent, 'whenIdle').mockImplementation(async () => {
      await closingIdle()
      closingWaits += 1
      if (closingWaits === 2) {
        await internals.conversations.put(closing.row.id, {
          ...closing.row,
          status: 'closed',
          hasPendingWake: false,
        })
      }
    })
    await internals.deliverPendingWake(closing.row.id, closing.roundId, brain.id, '关闭竞态')
    closeRace.mockRestore()

    const committed = await prepare('1')
    const committedIdle = committed.agent.whenIdle.bind(committed.agent)
    let committedWaits = 0
    const commitRace = vi.spyOn(committed.agent, 'whenIdle').mockImplementation(async () => {
      await committedIdle()
      committedWaits += 1
      if (committedWaits === 2) {
        committed.agent.session.append('waibrain/wake-delivered', {
          roundId: committed.roundId,
          externalBrainId: brain.id,
          wakeMessageId: committed.wakeMessageId,
        })
        await instance.ctx.sessions.flush(committed.agent.session)
      }
    })
    await internals.deliverPendingWake(committed.row.id, committed.roundId, brain.id, '提交竞态')
    commitRace.mockRestore()

    const dropped = await prepare('2')
    const followup = vi.spyOn(dropped.agent, 'followup').mockImplementation(() => {})
    await internals.deliverPendingWake(dropped.row.id, dropped.roundId, brain.id, '未进入竞态')
    followup.mockRestore()
    expect(dropped.agent.session.events.some(event => event.type === 'waibrain/wake-delivered')).toBe(false)
  }, 20_000)

  it('rebuilds wake text from child output and falls back when the configured lane is absent', async () => {
    const instance = await harness()
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    await instance.service.prompt({ conversationId: created.value.conversation.id, text: '生成主回复' })
    await waitFor(async () => {
      const view = await instance.service.conversation({ conversationId: created.value.conversation.id })
      return view.ok && !view.value.busy
    }, 'main reply for wake recovery')
    const agent = instance.ctx.agents.get(SessionId(created.value.conversation.sessionId))
    if (agent === undefined) throw new Error('missing wake source Agent')
    const internals = runtimeInternals(instance.service)
    const round = agent.session.events.find(event => event.type === 'waibrain/round-admitted')
    if (round?.type !== 'waibrain/round-admitted') throw new Error('missing admitted round')

    await expect(internals.recoverWakeText(agent.session.events, {
      roundId: round.data.roundId,
      externalBrainId: 'removed-lane',
      fallback: '持久化兜底',
    })).resolves.toBe('【闪念】「removed-lane」持久化兜底')
    await expect(internals.recoverWakeText([], {
      roundId: '00000000-0000-4000-8000-000000000140' as never,
      externalBrainId: 'child-backed',
      childSessionId: agent.id,
      fallback: '不应使用',
    })).resolves.toBe('【闪念】「child-backed」我先接住这个问题。')
  }, 20_000)

  it('times out one external brain without blocking its sibling or the main lane', async () => {
    const adapter = new RoutingAdapter()
    adapter.holdNext('facts')
    const instance = await harness(undefined, adapter, { externalBrainTimeoutMs: 20 })
    const saved = await instance.service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const created = await instance.service.createConversation({ agentId: saved.value.agent.id })
    if (!created.ok) throw new Error(created.error.code)
    await instance.service.prompt({ conversationId: created.value.conversation.id, text: '超时测试' })
    await waitFor(async () => {
      const view = await instance.service.conversation({ conversationId: created.value.conversation.id })
      if (!view.ok) return false
      const lanes = view.value.rounds[0]?.externalBrains
      return view.value.rounds[0]?.mainStatus === 'completed'
        && lanes?.find(lane => lane.externalBrainId === 'facts')?.status === 'timeout'
        && lanes.find(lane => lane.externalBrainId === 'tasks')?.status === 'completed'
    }, 'isolated branch timeout')
  }, 20_000)
})
