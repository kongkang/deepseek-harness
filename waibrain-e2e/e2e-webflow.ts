/**
 * 复刻网页路径的调试脚本:建会话(不挂预设)→ 空白时 recompose 切换到 waibrain-dialog
 * → 发消息,打印 subagent 事件/闪念/编排器警告,定位网页里闪念缺失的断点。
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
const PRESET_ROOT = '/Users/kongkang/.dsh/.agent-presets'

async function waitFor(cond, label, timeoutMs) {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`)
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

function waitIdle(ctx, agent) {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') {
        dispose()
        resolve()
      }
    })
  })
}

async function main() {
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
  ctx.on('subagent/end', info => console.log(`[subagent/end] ${info.provider} ${info.stopReason ?? '?'}`))

  // 网页路径:建会话(不挂预设)→ 空白时 recompose 切换。
  const handle = await ctx.agents.create({
    sessionId: SessionId(`waibrain-webflow-${Date.now()}`),
    meta: { cwd: process.cwd() },
    agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    setup: async (agentCtx) => {
      installModelSelection(agentCtx, {
        current: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: ReasoningEffortId('off') },
        assembled: undefined,
      })
    },
  })
  const agent = handle.agent
  console.log('[step] agent created, preset =', ctx.agentPresets.composedPreset(agent.ctx) ?? '(none)')

  try {
    await ctx.agentPresets.recompose(agent.ctx, 'waibrain-dialog')
    console.log('[step] recomposed, preset =', ctx.agentPresets.composedPreset(agent.ctx))

    agent.followup(createUserMessage({ content: [{ type: 'text', text: '最近有什么新电影值得看?' }], source: { kind: 'user' } }))
    await waitIdle(ctx, agent)
    console.log('[step] main turn idle')

    try {
      await waitFor(() => {
        for (const event of agent.session.events) {
          if (event.type !== 'agent/inbox/spliced') continue
          for (const message of event.data.inserted ?? []) {
            if (message.source?.plugin === 'waibrain-orchestrator') return true
          }
        }
        return false
      }, '闪念注入', 90_000)
      console.log('[RESULT] 闪念已注入(网页路径复现失败 → 问题在网页额外插件)')
    } catch (error) {
      console.log('[RESULT] 90 秒内无闪念注入(网页路径复现成功!)')
      console.log(`subagent/start 次数: ${subagentStarts.length}`)
      console.log(`会话事件: ${[...agent.session.events].map(event => event.type).join(',')}`)
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
