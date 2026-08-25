// @vitest-environment jsdom

/** User acceptance for the Host-backed first WaiBrain tab. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/dom'
import { mountApp } from '../src/app.ts'
import type {
  ModelCatalog,
  WaiBrainAgentConfig,
  WaiBrainAgentRevision,
  WaiBrainBootstrap,
  WaiBrainConversationSummary,
  WaiBrainConversationView,
  WaiBrainResult,
  WaiBrainRuntime,
} from '../src/dsh-runtime.ts'

const catalog: ModelCatalog = {
  groups: [{
    id: 'deepseek-official',
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-v4-flash', name: 'V4 Flash', reasoning: { efforts: [{ id: 'off', name: '关闭' }, { id: 'high', name: '高' }], defaultEffort: 'off' } },
      { id: 'deepseek-v4-pro', name: 'V4 Pro', reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }], defaultEffort: 'high' } },
    ],
  }],
  failures: [],
}

function agentConfig(name = '林川'): WaiBrainAgentConfig {
  return {
    label: name,
    role: {
      name, tagline: '长期思考伙伴', personality: '温和、诚实', voice: '自然简洁',
      scenario: '长期陪伴', greeting: '我在。', examples: '用户：你好。', systemPrompt: `你是${name}。`,
    },
    mainSelection: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'off' },
    externalBrains: [{
      id: 'facts', label: '事实与新知', direction: '查证事实', persona: '先查证。', enabled: true,
      selection: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'high' },
    }],
  }
}

class FakeRuntime implements WaiBrainRuntime {
  readonly agents: WaiBrainAgentRevision[] = []
  readonly conversations: WaiBrainConversationSummary[] = []
  readonly views = new Map<string, WaiBrainConversationView>()
  readonly savedConfigs: WaiBrainAgentConfig[] = []
  selectedAgentId: string | null = null
  selectedConversationId: string | null = null
  prompts: Array<{ conversationId: string; text: string }> = []
  conversationCalls = 0

  constructor(seed = false) {
    if (!seed) return
    const agent: WaiBrainAgentRevision = { id: 'agent-1', revision: 3, createdAt: 1, config: agentConfig() }
    const conversation: WaiBrainConversationSummary = {
      id: 'conversation-1', agentId: agent.id, sessionId: 'session-1', createdAt: 2, status: 'open',
    }
    this.agents.push(agent)
    this.conversations.push(conversation)
    this.selectedAgentId = agent.id
    this.selectedConversationId = conversation.id
    this.views.set(conversation.id, { conversation, busy: false, messages: [], rounds: [] })
  }

  models(): Promise<ModelCatalog> {
    return Promise.resolve(structuredClone(catalog))
  }

  bootstrap(): Promise<WaiBrainBootstrap> {
    return Promise.resolve(structuredClone({
      limits: { maxAdmittedBranches: 8, externalBrainTimeoutMs: 10_000, externalBrainMaxTokens: 256, maxResultBytes: 4096 },
      agents: this.agents,
      selectedAgentId: this.selectedAgentId,
      conversations: this.conversations,
      selectedConversationId: this.selectedConversationId,
    }))
  }

  saveAgent(
    request: { agentId?: string; expectedRevision: number | null; config: WaiBrainAgentConfig },
  ): Promise<WaiBrainResult<{ agent: WaiBrainAgentRevision }>> {
    const existing = request.agentId === undefined ? undefined : this.agents.find(agent => agent.id === request.agentId)
    const revision: WaiBrainAgentRevision = {
      id: existing?.id ?? `agent-${String(this.agents.length + 1)}`,
      revision: (existing?.revision ?? 0) + 1,
      createdAt: Date.now(),
      config: structuredClone(request.config),
    }
    if (existing === undefined) this.agents.push(revision)
    else this.agents[this.agents.indexOf(existing)] = revision
    this.selectedAgentId = revision.id
    this.savedConfigs.push(structuredClone(request.config))
    return Promise.resolve({ ok: true, value: { agent: structuredClone(revision) } })
  }

  selectAgent(request: { agentId: string }): Promise<WaiBrainResult<{ selectedAgentId: string }>> {
    this.selectedAgentId = request.agentId
    return Promise.resolve({ ok: true, value: { selectedAgentId: request.agentId } })
  }

  createConversation(request: { agentId: string }): Promise<WaiBrainResult<{ conversation: WaiBrainConversationSummary }>> {
    const conversation: WaiBrainConversationSummary = {
      id: `conversation-${String(this.conversations.length + 1)}`,
      agentId: request.agentId,
      sessionId: `session-${String(this.conversations.length + 1)}`,
      createdAt: Date.now(),
      status: 'open',
    }
    this.conversations.push(conversation)
    this.views.set(conversation.id, { conversation, busy: false, messages: [], rounds: [] })
    this.selectedConversationId = conversation.id
    return Promise.resolve({ ok: true, value: { conversation } })
  }

  selectConversation(request: { conversationId: string }): Promise<WaiBrainResult<{ selectedConversationId: string }>> {
    this.selectedConversationId = request.conversationId
    return Promise.resolve({ ok: true, value: { selectedConversationId: request.conversationId } })
  }

  conversation(request: { conversationId: string }): Promise<WaiBrainResult<WaiBrainConversationView>> {
    this.conversationCalls += 1
    const view = this.views.get(request.conversationId)
    if (view === undefined) return Promise.resolve({ ok: false, error: { code: 'conversation-not-found' } })
    return Promise.resolve({ ok: true, value: structuredClone(view) })
  }

  prompt(request: { conversationId: string; text: string }): Promise<WaiBrainResult<{ roundId: string }>> {
    this.prompts.push(request)
    const view = this.views.get(request.conversationId)
    const agent = this.agents.find(item => item.id === view?.conversation.agentId)
    if (view === undefined || agent === undefined) return Promise.resolve({ ok: false, error: { code: 'conversation-not-found' } })
    const number = view.rounds.length + 1
    view.messages.push(
      { id: `u${String(number)}`, role: 'user', text: request.text, seq: number * 10 },
      { id: `a${String(number)}`, role: 'assistant', text: '我听见了，我们慢慢拆开。', seq: number * 10 + 1 },
    )
    view.rounds.push({
      id: `round-${String(number)}`, configRevision: agent.revision, userMessageId: `u${String(number)}`,
      mainStatus: 'completed',
      externalBrains: agent.config.externalBrains.filter(brain => brain.enabled).map(brain => ({
        externalBrainId: brain.id, label: brain.label, status: 'completed', summary: `${brain.label}的独立答案`,
      })),
    })
    return Promise.resolve({ ok: true, value: { roundId: `round-${String(number)}` } })
  }

  closeConversation(request: { conversationId: string }): Promise<WaiBrainResult<{ closed: true }>> {
    const view = this.views.get(request.conversationId)
    if (view === undefined) return Promise.resolve({ ok: false, error: { code: 'conversation-not-found' } })
    view.conversation.status = 'closed'
    const row = this.conversations.find(item => item.id === request.conversationId)
    if (row !== undefined) row.status = 'closed'
    return Promise.resolve({ ok: true, value: { closed: true } })
  }
}

describe('Host-backed WaiBrain application', () => {
  let runtime: FakeRuntime
  let dispose: () => void

  beforeEach(() => {
    runtime = new FakeRuntime()
    const root = document.createElement('div')
    document.body.append(root)
    dispose = mountApp(root, { runtime, pollIntervalMs: 60_000 })
  })

  afterEach(() => {
    dispose()
    document.body.replaceChildren()
  })

  async function ready(): Promise<void> {
    await screen.findByText('Host 数据已同步')
  }

  it('creates a durable Agent with a dynamically added external brain', async () => {
    await ready()
    expect(screen.getByRole('heading', { name: '外挂外脑' })).not.toBeNull()
    expect(screen.queryByText(/页面内草稿|后端待接入/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '添加外挂外脑' }))
    fireEvent.input(screen.getByLabelText('外挂外脑名称'), { target: { value: '长期记忆' } })
    fireEvent.input(screen.getByLabelText('外挂外脑职责'), { target: { value: '维护长期偏好与约定' } })
    fireEvent.input(screen.getByLabelText('人格提示词'), { target: { value: '只保留长期有用的事实。' } })
    fireEvent.change(screen.getByLabelText('外挂外脑模型'), { target: { value: 'deepseek-official:deepseek-v4-pro' } })
    fireEvent.click(screen.getByRole('button', { name: '保存外挂外脑' }))
    fireEvent.click(screen.getAllByRole('button', { name: '保存 Agent' })[0]!)

    await waitFor(() => {
      expect(runtime.agents).toHaveLength(1)
    })
    const brain = runtime.agents[0]?.config.externalBrains[0]
    expect(brain?.label).toBe('长期记忆')
    expect(brain?.direction).toBe('维护长期偏好与约定')
    expect(brain?.persona).toBe('只保留长期有用的事实。')
    expect(brain?.enabled).toBe(true)
    expect(brain?.selection.model).toBe('deepseek-v4-pro')
    await screen.findByText(/Agent 已保存为配置 v1/)
  })

  it('restores Host state after remount instead of creating example records', async () => {
    dispose()
    document.body.replaceChildren()
    runtime = new FakeRuntime(true)
    const firstRoot = document.createElement('div')
    document.body.append(firstRoot)
    dispose = mountApp(firstRoot, { runtime, pollIntervalMs: 60_000 })
    await ready()
    expect(screen.getByLabelText<HTMLSelectElement>('选择 Agent').value).toBe('agent-1')
    expect(screen.getByLabelText<HTMLSelectElement>('选择历史对话').value).toBe('conversation-1')

    dispose()
    document.body.replaceChildren()
    const secondRoot = document.createElement('div')
    document.body.append(secondRoot)
    dispose = mountApp(secondRoot, { runtime, pollIntervalMs: 60_000 })
    await ready()
    expect(runtime.agents).toHaveLength(1)
    expect(screen.getByRole('heading', { name: '事实与新知' })).not.toBeNull()
  })

  it('edits and toggles external brains directly in the conversation right rail', async () => {
    dispose()
    document.body.replaceChildren()
    runtime = new FakeRuntime(true)
    const root = document.createElement('div')
    document.body.append(root)
    dispose = mountApp(root, { runtime, pollIntervalMs: 60_000 })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: '主对话' }))

    expect(screen.getByText(/右侧可直接编辑/)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '编辑 事实与新知' }))
    fireEvent.input(screen.getByLabelText('外挂外脑名称'), { target: { value: '事实核验' } })
    fireEvent.click(screen.getByRole('button', { name: '保存外挂外脑' }))
    await waitFor(() => {
      expect(runtime.agents[0]?.config.externalBrains[0]?.label).toBe('事实核验')
    })
    expect(screen.getByRole('heading', { name: '事实核验' })).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '关闭 事实核验' }))
    await waitFor(() => {
      expect(runtime.agents[0]?.config.externalBrains[0]?.enabled).toBe(false)
    })
    expect(runtime.agents[0]?.revision).toBe(5)
  })

  it('keeps one Agent while creating permanent selectable conversations', async () => {
    dispose()
    document.body.replaceChildren()
    runtime = new FakeRuntime(true)
    const root = document.createElement('div')
    document.body.append(root)
    dispose = mountApp(root, { runtime, pollIntervalMs: 60_000 })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: '新对话' }))
    await waitFor(() => {
      expect(runtime.conversations).toHaveLength(2)
    })
    expect(runtime.agents).toHaveLength(1)
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLSelectElement>('选择历史对话').options).toHaveLength(3)
    })
    await screen.findByRole('heading', { name: '与林川对话' })
  })

  it('sends through Host, shows the 1+N result, and closes the selected conversation', async () => {
    dispose()
    document.body.replaceChildren()
    runtime = new FakeRuntime(true)
    const root = document.createElement('div')
    document.body.append(root)
    dispose = mountApp(root, { runtime, pollIntervalMs: 60_000 })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: '主对话' }))
    fireEvent.input(screen.getByLabelText('给林川发消息'), { target: { value: '帮我核验一下' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await screen.findByText('我听见了，我们慢慢拆开。')
    expect(runtime.prompts).toEqual([{ conversationId: 'conversation-1', text: '帮我核验一下' }])
    expect(screen.getByText('事实与新知的独立答案')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '关闭对话' }))
    await screen.findByRole('button', { name: '对话已关闭' })
    expect(screen.getByLabelText<HTMLTextAreaElement>('给林川发消息').disabled).toBe(true)
  })

  it('does not lose focus, an unsaved draft value, or the Agent select across repeated polls when the conversation is unchanged', async () => {
    dispose()
    document.body.replaceChildren()
    runtime = new FakeRuntime(true)
    const root = document.createElement('div')
    document.body.append(root)
    dispose = mountApp(root, { runtime, pollIntervalMs: 120 })
    await ready()

    const agentSelect = screen.getByLabelText<HTMLSelectElement>('选择 Agent')
    const roleNameInput = screen.getByLabelText<HTMLInputElement>('角色名称')
    roleNameInput.focus()
    fireEvent.input(roleNameInput, { target: { value: '林川（编辑中，未保存）' } })

    await waitFor(() => {
      expect(runtime.conversationCalls).toBeGreaterThanOrEqual(2)
    })

    expect(document.activeElement).toBe(roleNameInput)
    expect(roleNameInput.value).toBe('林川（编辑中，未保存）')
    expect(screen.getByLabelText<HTMLSelectElement>('选择 Agent')).toBe(agentSelect)
  })

  it('reflects a real conversation change picked up by the poll without a full re-render', async () => {
    dispose()
    document.body.replaceChildren()
    runtime = new FakeRuntime(true)
    const root = document.createElement('div')
    document.body.append(root)
    dispose = mountApp(root, { runtime, pollIntervalMs: 120 })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: '主对话' }))
    await screen.findByRole('heading', { name: '与林川对话' })

    const composer = screen.getByLabelText<HTMLTextAreaElement>('给林川发消息')

    const view = runtime.views.get('conversation-1')
    expect(view).not.toBeUndefined()
    view?.messages.push({ id: 'u-ext', role: 'user', text: '外部注入的新消息', seq: 100 })

    await screen.findByText('外部注入的新消息')
    expect(screen.getByLabelText<HTMLTextAreaElement>('给林川发消息')).toBe(composer)
  })

  it('falls back to a full render so the header and composer reflect a conversation closed elsewhere', async () => {
    dispose()
    document.body.replaceChildren()
    runtime = new FakeRuntime(true)
    const root = document.createElement('div')
    document.body.append(root)
    dispose = mountApp(root, { runtime, pollIntervalMs: 120 })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: '主对话' }))
    await screen.findByRole('button', { name: '关闭对话' })

    const view = runtime.views.get('conversation-1')
    expect(view).not.toBeUndefined()
    if (view !== undefined) view.conversation.status = 'closed'
    const row = runtime.conversations.find(item => item.id === 'conversation-1')
    if (row !== undefined) row.status = 'closed'

    await screen.findByRole('button', { name: '对话已关闭' })
    expect(screen.getByLabelText<HTMLTextAreaElement>('给林川发消息').disabled).toBe(true)
  })
})
