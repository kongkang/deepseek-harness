/**
 * B0 组合测试(无真实 API):经 Loader + AgentPresets 挂载 fixture 预设的真实
 * agent.cordis.yml,用脚本化 mock adapter 驱动完整 1+N 闭环:
 * 用户消息 → 编排器 fork 识别影子(结构化判断)→ 命中派干活影子 → 【闪念】注入 → 第二轮自然带出。
 * 同时验证:subagent 生命周期事件计数、识别/干活请求的 reasoningEffort 逐级透传、
 * 搜索结果进入干活 prompt、干活影子零工具(防工具意外继承)。
 * test-first 基线:旧编排器(关键词 2 分支,走 spawn 且无 fork)下应全部失败。
 */
// @ts-nocheck -- 组合脚本,宽类型即可
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId, LlmAdapter, ReasoningEffortId, createUserMessage } from '@deepseek-ai/dsh-llm'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry, { installModelSelection } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPresets from '@deepseek-ai/dsh-agent-presets'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as ForkInProcess from '@deepseek-ai/dsh-subagent-fork-in-process'
import WebRuntime from '@deepseek-ai/dsh-web'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WORKTREE = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE_ROOT = fileURLToPath(new URL('./fixture', import.meta.url))

const EFFORTS = ['off', 'low', 'high', 'max'].map(id => ({ id: ReasoningEffortId(id), name: id }))

function textChunks(text) {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: text.length } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function toolChunks(callId, name, args) {
  const json = JSON.stringify(args)
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: CallId(callId), name, argumentsDelta: json },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId(callId), name, arguments: json } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

/** 脚本化 adapter:每次模型调用消费一个入口(函数按请求内容路由),并记录完整请求。 */
class ScriptedAdapter extends LlmAdapter {
  requests = []

  constructor(script) {
    super()
    this.script = script
  }

  prepareCall(provider, model, _signal) {
    const requests = this.requests
    const script = this.script
    return Promise.resolve({
      model: {
        provider, id: model, name: model,
        inputModalities: ['text'],
        context: { contextWindow: 1_000_000 },
        defaultMaxTokens: 8192,
        reasoning: { efforts: EFFORTS, defaultEffort: ReasoningEffortId('max') },
      },
      stream: async function* stream(options) {
        requests.push(options)
        const entry = script.shift() ?? (() => textChunks('done'))
        for (const chunk of entry(options)) yield chunk
      },
    })
  }
}

function requestText(options) {
  return [options.system ?? '', ...(options.messages ?? []).map(
    message => (message.content ?? []).map(block => block.type === 'text' ? block.text : '').join(''),
  )].join('\n')
}

function hasStructuredTool(options) {
  return (options.tools ?? []).some(tool => tool.name === 'structured_output')
}

function waitForIdle(ctx, agent) {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') {
        dispose()
        resolve()
      }
    })
  })
}

async function waitFor(cond, label, timeoutMs = 10_000) {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

function injectedThoughts(agent) {
  const out = []
  for (const event of agent.session.events) {
    if (event.type === 'user/message' && event.data?.source?.plugin === 'waibrain-orchestrator') {
      out.push((event.data.content ?? []).filter(block => block.type === 'text').map(block => block.text).join(''))
    }
  }
  return out
}

/** 闪念注入后在收件箱里等待下一轮 claim:盯 inbox/spliced 事件里的插件消息。 */
function pendingThoughts(agent) {
  const out = []
  for (const event of agent.session.events) {
    if (event.type !== 'agent/inbox/spliced') continue
    for (const message of event.data.inserted ?? []) {
      if (message.source?.plugin === 'waibrain-orchestrator') {
        out.push((message.content ?? []).filter(block => block.type === 'text').map(block => block.text).join(''))
      }
    }
  }
  return out
}

it('挂载真实预设配置:1 前台 + 2 识别影子 + 命中派干活影子,闪念回灌第二轮', async () => {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(WORKTREE + '/').href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  await ctx.plugin(ForkInProcess, { providerName: 'fork' })
  await ctx.plugin(WebRuntime, { searchProvider: 'stub-search' })
  ctx.web.registerSearchProvider({
    id: 'stub-search',
    available: () => true,
    search: async () => ({ content: 'FACTS-CONTENT', sources: [{ title: 'T', snippet: 'S', url: 'https://example.test' }] }),
  })
  await ctx.plugin(AgentPresets, { default: 'waibrain-dialog', roots: [{ path: FIXTURE_ROOT, trust: 'user' }], includeUserRoot: false })

  // 按内容路由:识别影子(有 structured_output 工具)→ 结构化判断;
  // 干活影子(prompt 带工作要点)→ 文本闪念;主对话 → 文本接话。
  const route = (options) => {
    const text = requestText(options)
    if (hasStructuredTool(options)) {
      if (text.includes('搜索与新知')) return toolChunks('rec-search', 'structured_output', { relevant: true, brief: '查最近上映的电影' })
      if (text.includes('任务与进程')) return toolChunks('rec-dev', 'structured_output', { relevant: false, brief: '' })
      throw new Error(`unexpected recognition child: ${text.slice(0, 200)}`)
    }
    if (text.includes('工作要点')) return textChunks('我刚查了一下,最近上映的有《XX》。')
    return textChunks('我帮你看看。')
  }
  const adapter = new ScriptedAdapter([
    route, route, route, // 主对话第一轮 + 2 个识别影子(并发,顺序不定)
    route, // 干活影子
    () => textChunks('对了,我刚查到了,是《XX》。'), // 主对话第二轮
  ])
  ctx.llm.registerAdapter(['deepseek-official'], adapter)

  const subagentStarts = []
  ctx.on('subagent/start', info => subagentStarts.push(info))

  const handle = await ctx.agents.create({
    sessionId: SessionId(`waibrain-b0-${Date.now()}`),
    meta: { cwd: process.cwd() },
    agentOptions: { provider: 'deepseek-official', model: 'mock-main' },
    setup: async (agentCtx) => {
      installModelSelection(agentCtx, {
        current: { provider: 'deepseek-official', model: 'mock-main', reasoningEffort: ReasoningEffortId('off') },
        assembled: undefined,
      })
      await ctx.agentPresets.mount(agentCtx, 'waibrain-dialog')
    },
  })
  const agent = handle.agent

  try {
    agent.followup(createUserMessage({ content: [{ type: 'text', text: '最近有什么新电影值得看?' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    await waitFor(() => pendingThoughts(agent).length > 0, '闪念注入(收件箱)')

    agent.followup(createUserMessage({ content: [{ type: 'text', text: '哦,那还有别的要注意的吗?' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    // ① 影子派发走 fork provider:第一轮 2 识别 + 1 干活;第二轮还会再 fork 识别影子(每轮都编排)。
    expect(subagentStarts.length).toBeGreaterThanOrEqual(3)
    for (const info of subagentStarts) expect(info.provider).toBe('fork')

    // ② 闪念注入事件:第一人称【闪念】,带干活影子产出。
    const thoughts = injectedThoughts(agent)
    expect(thoughts.some(text => text.startsWith('【闪念】') && text.includes('《XX》'))).toBe(true)

    // ③ 努力度逐级透传:主对话 off,识别 low,干活 high。
    const recognitionRequests = adapter.requests.filter(options => hasStructuredTool(options))
    expect(recognitionRequests.length).toBeGreaterThanOrEqual(2)
    for (const request of recognitionRequests) {
      expect(request.reasoningEffort).toBe(ReasoningEffortId('low'))
    }
    const workerRequests = adapter.requests.filter(options => !hasStructuredTool(options) && requestText(options).includes('工作要点'))
    expect(workerRequests).toHaveLength(1)
    expect(workerRequests[0].reasoningEffort).toBe(ReasoningEffortId('high'))
    const mainRequests = adapter.requests.filter(options => requestText(options).includes('主对话人格'))
    expect(mainRequests.map(request => request.reasoningEffort)).toEqual([
      ReasoningEffortId('off'), ReasoningEffortId('off'),
    ])

    // ④ 搜索结果进入干活影子 prompt(交接旧 bug 的守门断言),且干活影子零工具。
    expect(requestText(workerRequests[0])).toContain('FACTS-CONTENT')
    expect(workerRequests[0].tools ?? []).toHaveLength(0)
    for (const request of recognitionRequests) {
      expect(request.tools.map(tool => tool.name)).toEqual(['structured_output'])
    }

    // ⑤ 闪念进入第二轮主对话请求(模型可见 ⟺ 已入日志),第二轮回复非空。
    const secondMain = mainRequests[1]
    expect(requestText(secondMain)).toContain('【闪念】')
    const lastAssistant = [...agent.session.events].reverse().find(event => event.type === 'assistant/message')
    const lastText = (lastAssistant?.data.message.content ?? [])
      .filter(block => block.type === 'text').map(block => block.text).join('')
    expect(lastText.length).toBeGreaterThan(0)
  } finally {
    await handle.dispose()
    await ctx.fiber?.dispose?.()
  }
}, 60_000)
