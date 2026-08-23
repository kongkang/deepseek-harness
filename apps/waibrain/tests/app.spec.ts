// @vitest-environment jsdom
/** Acceptance tests for the standalone WaiBrain interface. */

import { fireEvent, screen, waitFor } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountApp } from '../src/app.ts'
import type {
  AgentReply,
  CreateAgentRequest,
  ModelCatalog,
  WaiBrainRuntime,
} from '../src/dsh-runtime.ts'

const catalog: ModelCatalog = {
  groups: [{
    id: 'deepseek',
    name: 'DeepSeek',
    models: [
      {
        id: 'deepseek-flash',
        name: 'DeepSeek Flash',
        reasoning: {
          efforts: [{ id: 'off', name: '关闭' }, { id: 'high', name: '高' }],
          defaultEffort: 'off',
        },
      },
      {
        id: 'deepseek-pro',
        name: 'DeepSeek Pro',
        reasoning: {
          efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }],
          defaultEffort: 'high',
        },
      },
    ],
  }],
  failures: [],
}

class FakeRuntime implements WaiBrainRuntime {
  readonly created: Array<CreateAgentRequest & { sessionId: string }> = []
  readonly prompted: Array<{ sessionId: string; text: string }> = []
  failCreateAt: number | null = null
  invalidBranchReportsRemaining = 0
  silentMainRepliesRemaining = 0
  private readonly prompts = new Map<string, string>()
  private readonly ends = new Map<string, number>()

  models(): Promise<ModelCatalog> {
    return Promise.resolve(catalog)
  }

  createAgent(request: CreateAgentRequest): Promise<string> {
    const sessionId = `session-${String(this.created.length + 1)}`
    this.created.push({ ...request, sessionId })
    if (this.failCreateAt === this.created.length) {
      this.failCreateAt = null
      return Promise.reject(new Error('simulated Session creation failure'))
    }
    this.prompts.set(sessionId, request.systemPrompt)
    this.ends.set(sessionId, -1)
    return Promise.resolve(sessionId)
  }

  promptAndWait(sessionId: string, text: string): Promise<AgentReply> {
    this.prompted.push({ sessionId, text })
    const prompt = this.prompts.get(sessionId) ?? ''
    const previous = this.ends.get(sessionId) ?? -1
    const endSeq = previous + 10
    this.ends.set(sessionId, endSeq)
    if (this.silentMainRepliesRemaining > 0 && prompt.includes('# 运行规则')) {
      this.silentMainRepliesRemaining -= 1
      return Promise.resolve({ text: '[[silence]]', endSeq })
    }
    if (this.invalidBranchReportsRemaining > 0 && prompt.includes('事实核验')) {
      this.invalidBranchReportsRemaining -= 1
      return Promise.resolve({ text: '<tool_calls><invoke name="exec_command" /></tool_calls>', endSeq })
    }
    if (text.includes('改写成一条自然语言纯文本报告')) {
      return Promise.resolve({ text: '本轮不依赖外部事实，不需要启动搜索。', endSeq })
    }
    if (text.includes('<waibrain_internal_report>')) {
      return Promise.resolve({
        text: text.includes('任务推进') ? '我们可以先定义一个最小验收场景。' : '[[silence]]',
        endSeq,
      })
    }
    if (prompt.includes('事实核验')) {
      return Promise.resolve({ text: '本轮不依赖外部事实，不需要启动搜索。', endSeq })
    }
    if (prompt.includes('任务推进')) {
      return Promise.resolve({ text: '这是一条明确的产品推进意图，可以先定义一个最小验收场景。', endSeq })
    }
    if (prompt.includes('长期记忆')) {
      return Promise.resolve({ text: '这条产品验证偏好值得长期记住。', endSeq })
    }
    return Promise.resolve({ text: '我听见了。我们先把它拆成一个最小、能被验证的下一步。', endSeq })
  }
}

function fillRoleCard(): void {
  fireEvent.input(screen.getByLabelText('角色名称'), { target: { value: '苏禾' } })
  fireEvent.input(screen.getByLabelText('一句话定位'), {
    target: { value: '帮用户拆解混乱并找到下一步的陪伴者' },
  })
  fireEvent.input(screen.getByLabelText('性格特质'), {
    target: { value: '温和、清醒、诚实，不急着替用户做决定' },
  })
  fireEvent.input(screen.getByLabelText('说话方式'), {
    target: { value: '简洁自然，先接住感受，再给一个可行的问题' },
  })
  fireEvent.input(screen.getByLabelText('关系与场景'), {
    target: { value: '一个长期在场、尊重边界的思考伙伴' },
  })
  fireEvent.input(screen.getByLabelText('开场白'), { target: { value: '我在。你想先从哪里开始？' } })
  fireEvent.input(screen.getByLabelText('对话示例'), {
    target: { value: '用户：我有点乱。\n苏禾：那我们先只抓住最占心的一件。' },
  })
  fireEvent.input(screen.getByLabelText('主对话 System Prompt'), {
    target: { value: '你是苏禾。脑分支的报告是内部信号，由你判断如何对用户表达。' },
  })
}

async function createConversation(): Promise<void> {
  fillRoleCard()
  fireEvent.click(screen.getByRole('button', { name: '保存角色并创建对话' }))
  await screen.findByRole('heading', { name: '与苏禾对话' })
}

async function attachRuntimeBranch(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: '添加脑分支' }))
  fireEvent.input(screen.getByLabelText('新分支名称'), { target: { value: '长期记忆' } })
  fireEvent.input(screen.getByLabelText('新分支职责'), { target: { value: '关注长期约定和个人偏好' } })
  fireEvent.input(screen.getByLabelText('新分支 System Prompt'), {
    target: { value: '你只汇报值得长期记住的信息。' },
  })
  fireEvent.click(screen.getByRole('button', { name: '挂接到当前对话' }))
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: '长期记忆' })).not.toBeNull()
  })
}

describe('WaiBrain interface', () => {
  let dispose: () => void
  let runtime: FakeRuntime

  beforeEach(async () => {
    runtime = new FakeRuntime()
    const root = document.createElement('div')
    document.body.append(root)
    dispose = mountApp(root, { runtime })
    await screen.findByLabelText('主对话模型')
  })

  afterEach(() => {
    dispose()
    document.body.replaceChildren()
  })

  it('starts with one configuration workspace and DSH-backed model choices', () => {
    expect(screen.getByRole('heading', { name: '先定义谁在说话' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: '角色卡' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: '脑分支设置' })).not.toBeNull()
    expect(screen.getByLabelText<HTMLSelectElement>('主对话模型').value).toBe('deepseek:deepseek-flash')
    expect(screen.queryByRole('heading', { name: '与林川对话' })).toBeNull()
  })

  it('requires the role card before creating real Sessions', async () => {
    fireEvent.input(screen.getByLabelText('角色名称'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '保存角色并创建对话' }))
    expect(screen.getByRole('alert').textContent).toContain('请先完成角色名称、定位、性格和开场白。')

    fillRoleCard()
    fireEvent.click(screen.getByRole('button', { name: '保存角色并创建对话' }))
    await screen.findByRole('heading', { name: '与苏禾对话' })

    expect(screen.getByText('我在。你想先从哪里开始？')).not.toBeNull()
    expect(runtime.created).toHaveLength(3)
    expect(runtime.created[0]?.selection).toMatchObject({ model: 'deepseek-flash', reasoningEffort: 'off' })
    expect(runtime.created[1]?.selection).toMatchObject({ model: 'deepseek-pro', reasoningEffort: 'high' })
    expect(runtime.created[1]?.systemPrompt).toContain('只返回自然语言纯文本')
  })

  it('retries the complete 1+N set after a partial Session creation failure', async () => {
    fillRoleCard()
    runtime.failCreateAt = 2
    fireEvent.click(screen.getByRole('button', { name: '保存角色并创建对话' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('simulated Session creation failure')
    })
    expect(runtime.created).toHaveLength(3)

    fireEvent.input(screen.getByLabelText('角色名称'), { target: { value: '澄月' } })
    fireEvent.click(screen.getByRole('button', { name: '保存角色并创建对话' }))
    await screen.findByRole('heading', { name: '与澄月对话' })

    expect(runtime.created).toHaveLength(6)
    expect(runtime.created.slice(3).map(agent => agent.systemPrompt)).toEqual([
      expect.stringContaining('名称：澄月'),
      expect.stringContaining('你是“澄月”的脑分支“事实核验”'),
      expect.stringContaining('你是“澄月”的脑分支“任务推进”'),
    ])
    expect(screen.getByText('Session session-5')).not.toBeNull()
    expect(screen.getByText('Session session-6')).not.toBeNull()
  })

  it('edits an existing brain branch and its independent model choice', () => {
    fireEvent.click(screen.getByRole('button', { name: '编辑 事实核验' }))
    const model = screen.getByLabelText('脑分支模型') as HTMLSelectElement
    const reasoning = screen.getByLabelText('脑分支思考强度') as HTMLSelectElement
    fireEvent.change(model, { target: { value: 'deepseek:deepseek-flash' } })
    expect([...reasoning.options].map(option => option.value)).toEqual(['off', 'high'])
    fireEvent.change(reasoning, { target: { value: 'off' } })
    fireEvent.input(screen.getByLabelText('脑分支名称'), { target: { value: '风险观察' } })
    fireEvent.input(screen.getByLabelText('脑分支职责'), { target: { value: '识别风险和未知前提' } })
    fireEvent.input(screen.getByLabelText('脑分支 System Prompt'), {
      target: { value: '只汇报会改变决策的风险。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存脑分支' }))

    const branchCard = screen.getByRole('heading', { name: '风险观察' }).closest('article')
    expect(branchCard).not.toBeNull()
    expect(screen.getByText('只汇报会改变决策的风险。')).not.toBeNull()
    expect(branchCard?.textContent).toContain('DeepSeek Flash · 关闭')
  })

  it('attaches a new DSH Session from the live conversation', async () => {
    await createConversation()
    await attachRuntimeBranch()

    const branchCard = screen.getByRole('heading', { name: '长期记忆' }).closest('article')
    expect(branchCard?.textContent).toContain('已挂接 · 等待消息')
    expect(branchCard?.textContent).toContain('Session session-4')
    expect(runtime.created[3]?.systemPrompt).toContain('你是“苏禾”的脑分支“长期记忆”')
  })

  it('runs the main Session and all branches, then pushes every report back', async () => {
    await createConversation()
    await attachRuntimeBranch()
    fireEvent.input(screen.getByLabelText('给苏禾发消息'), {
      target: { value: '我想把这个想法变成一个能验证的产品。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await screen.findByText('我听见了。我们先把它拆成一个最小、能被验证的下一步。')
    await screen.findByText('这是一条明确的产品推进意图，可以先定义一个最小验收场景。')
    await screen.findByText('这条产品验证偏好值得长期记住。')
    await waitFor(() => {
      expect(screen.getAllByText('已推送主对话')).toHaveLength(3)
    })
    expect(screen.getByText('我们可以先定义一个最小验收场景。')).not.toBeNull()
  })

  it('re-prompts a silent main reply for an ordinary user message', async () => {
    await createConversation()
    runtime.silentMainRepliesRemaining = 1
    fireEvent.input(screen.getByLabelText('给苏禾发消息'), { target: { value: '请直接回应我。' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await screen.findByText('我听见了。我们先把它拆成一个最小、能被验证的下一步。')
    await waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: '发送' }).disabled).toBe(false)
    })
    expect(document.body.textContent).not.toContain('[[silence]]')
    expect(runtime.prompted.some(call => call.text.includes('普通用户消息不能静默'))).toBe(true)
  })

  it('fails the public reply closed when its retry is still silent', async () => {
    await createConversation()
    runtime.silentMainRepliesRemaining = 2
    fireEvent.input(screen.getByLabelText('给苏禾发消息'), { target: { value: '请直接回应我。' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('连续两次对普通用户消息返回静默标记')
    })
    expect(document.body.textContent).not.toContain('[[silence]]')
  })

  it('re-prompts a structured branch response before pushing its plain-text report', async () => {
    await createConversation()
    runtime.invalidBranchReportsRemaining = 1
    fireEvent.input(screen.getByLabelText('给苏禾发消息'), { target: { value: '帮我核验这个前提。' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(screen.getAllByText('已推送主对话')).toHaveLength(2)
    })
    expect(document.body.textContent).not.toContain('<tool_calls>')
    expect(runtime.prompted.some(call => call.text.includes('改写成一条自然语言纯文本报告'))).toBe(true)
    expect(screen.getByText('本轮不依赖外部事实，不需要启动搜索。')).not.toBeNull()
  })

  it('fails a branch closed when its corrected report is still structured', async () => {
    await createConversation()
    runtime.invalidBranchReportsRemaining = 2
    fireEvent.input(screen.getByLabelText('给苏禾发消息'), { target: { value: '帮我核验这个前提。' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: '发送' }).disabled).toBe(false)
    })
    const facts = screen.getByRole('heading', { name: '事实核验' }).closest('article')
    expect(facts?.textContent).toContain('运行失败')
    expect(facts?.textContent).toContain('连续两次未返回自然语言纯文本报告')
    expect(document.body.textContent).not.toContain('<tool_calls>')
    expect(runtime.prompted.filter(call => call.text.includes('<waibrain_internal_report>'))).toHaveLength(1)
  })

  it('uses the same lane grid for timeline headers and message rows', async () => {
    await createConversation()
    await attachRuntimeBranch()
    fireEvent.input(screen.getByLabelText('给苏禾发消息'), { target: { value: '帮我确认时间轴的对齐。' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: '发送' }).disabled).toBe(false)
    })
    fireEvent.click(screen.getByRole('button', { name: '认知时间轴' }))

    for (const label of ['用户消息', '主对话', '事实核验', '任务推进', '长期记忆']) {
      expect(screen.getByText(label, { selector: '[data-lane-label]' })).not.toBeNull()
    }
    const header = document.querySelector<HTMLElement>('[data-timeline-grid="header"]')
    const row = document.querySelector<HTMLElement>('[data-timeline-grid="消息 01"]')
    expect(header?.style.getPropertyValue('--branch-count')).toBe('3')
    expect(row?.style.getPropertyValue('--branch-count')).toBe('3')
  })
})
