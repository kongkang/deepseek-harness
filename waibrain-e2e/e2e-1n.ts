/**
 * 外脑对话 1+N 真 API 端到端冒烟(需要 DEEPSEEK_API_KEY):
 * 经 Loader + AgentPresets 挂载真实预设,用真 flash 主对话(关思考)+ 真识别影子
 * (flash+low)+ 真干活影子(pro+high)+ 真实搜索,验证完整闭环:
 * ① 主对话首回复即时出现且不认怂;② 影子走 fork 且识别/干活努力度逐级透传;
 * ③ 闪念以第一人称注入;④ 第二轮主回复自然带出闪念。
 * 用法:tsx waibrain-e2e/e2e-1n.ts [--user](挂 ~/.dsh 真实用户预设,默认挂 fixture)
 */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { ReasoningEffortId, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as LlmDeepSeek from '@deepseek-ai/dsh-llm-deepseek'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import AgentRegistry, { installModelSelection } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPresets from '@deepseek-ai/dsh-agent-presets'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as ForkInProcess from '@deepseek-ai/dsh-subagent-fork-in-process'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as WebSearchDeepseek from '@deepseek-ai/dsh-web-search-deepseek'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WORKTREE = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE_ROOT = fileURLToPath(new URL('./fixture', import.meta.url))
const USER_ROOT = '/Users/kongkang/.dsh/.agent-presets'
const PRESET_ROOT = process.argv.includes('--user') ? USER_ROOT : FIXTURE_ROOT

function waitIdle(ctx, agent) {
  return new Promise((resolve) => {
    if (agent.status === 'idle') return resolve()
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') {
        dispose()
        resolve()
      }
    })
  })
}

async function waitFor(cond, label, timeoutMs) {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`)
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

function textOf(message) {
  return (message.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('')
}

function lastAssistantText(agent) {
  const event = [...agent.session.events].reverse().find(e => e.type === 'assistant/message')
  return event === undefined ? '' : textOf(event.data.message)
}

function claimedThoughts(agent) {
  const out = []
  for (const event of agent.session.events) {
    if (event.type === 'user/message' && event.data?.source?.plugin === 'waibrain-orchestrator') {
      out.push(textOf(event.data))
    }
  }
  return out
}

/** 子智能体结算时刻取证:会话还在注册表里,读它首请求 header 里实际生效的思考程度。 */
function collectSubagentEfforts(ctx) {
  const efforts = new Set()
  ctx.on('subagent/end', (info) => {
    const session = ctx.sessions.list().find(s => s.id === info.id)
    if (session === undefined) return
    const header = [...session.events].reverse().find(event => event.type === 'request/header')
    const effort = header?.data?.header?.config?.reasoningEffort
    if (effort !== undefined) efforts.add(String(effort))
  })
  return efforts
}

async function main() {
  console.log(`preset root: ${PRESET_ROOT}`)
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(WORKTREE + '/').href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(Credentials)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LlmDeepSeek, {})
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  await ctx.plugin(ForkInProcess, { providerName: 'fork' })
  await ctx.plugin(WebRuntime, { searchProvider: 'deepseek-official' })
  await ctx.plugin(WebSearchDeepseek, { apiKeyEnv: 'DEEPSEEK_API_KEY' })
  // 模拟用户 web 全局配置里的审查工具:外脑预设会在挂载时按名藏掉它们。
  for (const name of ['reviewer_glm', 'reviewer_deepseek']) {
    ctx.tools.register(defineContentToolFixture({
      name,
      description: 'fixture global reviewer tool',
      parameters: {},
      execute: async () => [{ type: 'text', text: 'reviewed' }],
    }))
  }
  await ctx.plugin(AgentPresets, { default: 'waibrain-dialog', roots: [{ path: PRESET_ROOT, trust: 'user' }], includeUserRoot: false })

  const subagentStarts = []
  ctx.on('subagent/start', info => subagentStarts.push(info))
  const subagentEfforts = collectSubagentEfforts(ctx)

  const handle = await ctx.agents.create({
    sessionId: SessionId(`waibrain-e2e-${Date.now()}`),
    meta: { cwd: process.cwd() },
    agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    setup: async (agentCtx) => {
      installModelSelection(agentCtx, {
        current: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: ReasoningEffortId('off') },
        assembled: undefined,
      })
      await ctx.agentPresets.mount(agentCtx, 'waibrain-dialog')
    },
  })
  const agent = handle.agent

  try {
    const turn1 = '最近有什么新电影值得看?'
    agent.followup(createUserMessage({ content: [{ type: 'text', text: turn1 }], source: { kind: 'user' } }))
    await waitIdle(ctx, agent)
    const firstReply = lastAssistantText(agent)
    console.log('===== 第一轮主对话回复(后台影子并行跑,不应阻塞)=====')
    console.log(firstReply)

    // 唤醒式回灌:闪念到达后主对话自动开启第二轮,把内容自然说出来,无需用户再发消息。
    await waitFor(() => claimedThoughts(agent).length > 0, '闪念注入并被消费', 120_000)
    console.log('===== 后台注入的闪念 =====')
    for (const thought of claimedThoughts(agent)) console.log(`  ${thought}`)
    await waitIdle(ctx, agent)
    const secondReply = lastAssistantText(agent)
    console.log('===== 第二轮主对话回复(应自然带出闪念)=====')
    console.log(secondReply)

    console.log('===== 断言 =====')
    console.log(`subagent/start 次数: ${subagentStarts.length}`)
    console.log(`子智能体会话努力度: ${JSON.stringify([...subagentEfforts])}`)
    console.log(`已 claim 的闪念: ${JSON.stringify(claimedThoughts(agent))}`)

    const failures = []
    if (firstReply.trim() === '') failures.push('主对话第一轮回复为空')
    if (/不能搜索|没有工具|无法访问/.test(firstReply)) failures.push('主对话第一轮认怂')
    if (subagentStarts.length < 2) failures.push(`影子派发不足(仅 ${subagentStarts.length} 次)`)
    if (!subagentStarts.every(info => info.provider === 'fork')) failures.push('存在非 fork 派发')
    const efforts = [...subagentEfforts]
    if (!efforts.includes('low')) failures.push('识别影子努力度未生效(缺 low)')
    if (!efforts.includes('high')) failures.push('干活影子努力度未生效(缺 high)')
    if (claimedThoughts(agent).length === 0) failures.push('闪念未被主对话消费')
    if (secondReply.trim() === '') failures.push('主对话第二轮回复为空')

    if (failures.length > 0) {
      console.error(`E2E FAILED:\n  ${failures.join('\n  ')}`)
      process.exitCode = 1
    } else {
      console.log('E2E PASSED:1 前台 + N 影子闭环成立')
    }
  } finally {
    await handle.dispose()
    await ctx.fiber?.dispose?.()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
