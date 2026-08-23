/**
 * 真实网页组合端到端:加载 ~/.dsh/profiles/web 的真实插件组合
 * (base + web-app bundle + 用户补丁,剔除纯浏览器/UI/网关行),
 * 建会话 → 空白时切换外脑对话 → 发消息,验证闪念闭环。
 * 这是本机能复现的最接近网页的路径;编排器诊断直接打到 stdout。
 */
import { Context } from '@deepseek-ai/cordis'
import { loadProfile, composeEntries, mountRootInclude } from '@deepseek-ai/dsh-app-boot'
import { ReasoningEffortId, createUserMessage } from '@deepseek-ai/dsh-llm'
import { fileURLToPath } from 'node:url'

const WORKTREE = fileURLToPath(new URL('..', import.meta.url))

/** 纯浏览器/UI/网关行:本机无头测试剔除。 */
const DROP = new Set([
  'webserver', 'web-startup', 'web-runtime', 'client-hmr', 'modules', 'connection',
  'api-remotes', 'client-runtime', 'cordis-client-runner', 'api-gateway', 'cordis-host-runner',
  'directory-picker', 'plugin-inventory', 'hmr', 'balance-sidebar', 'session-reference',
  'file-reference-local', 'native-path-opener', 'session-telemetry-otel', 'dsh-vision-proxy',
])
const DROP_PREFIXES = ['ui-']

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
  const profile = loadProfile('dsh', 'web', `${WORKTREE}/package.json`)
  const rows = composeEntries([
    profile.layers.flatMap(layer => layer.patches),
    profile.patches,
  ]).filter(row => !DROP.has(String(row.id)) && !DROP_PREFIXES.some(prefix => String(row.id).startsWith(prefix)))

  console.log(`[compose] ${rows.length} host rows:`)
  console.log(rows.map(row => `${row.id}${row.disabled === true ? '(disabled)' : ''}`).join(', '))

  const ctx = new Context()
  ctx.baseUrl = `file://${profile.dir}/`
  ctx.provide('dshHomePath', sub => `/Users/kongkang/.dsh/${sub}`)
  await ctx.plugin((await import('@deepseek-ai/cordis-plugin-loader')).default)
  const Include = (await import('@deepseek-ai/cordis-plugin-include')).default
  ctx.loader.builtins.include = Include

  // 与 CLI runProfile 相同的贴片路径:空叶子 + 组合行作为 insert 补丁。
  await mountRootInclude(ctx, `${profile.dir}/cordis.yml`, [{ insert: rows }], WORKTREE)
  await Promise.race([
    ctx.get('loader')?.await(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('loader settle timeout')), 60_000)),
  ])
  console.log('[compose] loader settled')

  const subagentStarts = []
  ctx.on('subagent/start', info => subagentStarts.push(info))
  ctx.on('subagent/end', info => console.log(`[subagent/end] ${info.provider} ${info.stopReason ?? '?'}`))

  const handle = await ctx.agents.create({
    sessionId: (await import('@deepseek-ai/dsh-session')).SessionId(`waibrain-webcompose-${Date.now()}`),
    meta: { cwd: process.cwd() },
    agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    setup: async (agentCtx) => {
      const { installModelSelection } = await import('@deepseek-ai/dsh-agent')
      installModelSelection(agentCtx, {
        current: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: ReasoningEffortId('off') },
        assembled: undefined,
      })
    },
  })
  const agent = handle.agent

  try {
    await ctx.agentPresets.recompose(agent.ctx, 'waibrain-dialog')
    console.log('[step] recomposed to waibrain-dialog')

    agent.followup(createUserMessage({ content: [{ type: 'text', text: '最近有什么新电影值得看?' }], source: { kind: 'user' } }))
    await waitIdle(ctx, agent)
    console.log('[step] main turn idle; watching for injected thought...')

    const hasThought = () => {
      for (const event of agent.session.events) {
        if (event.type !== 'agent/inbox/spliced') continue
        for (const message of event.data.inserted ?? []) {
          if (message.source?.plugin === 'waibrain-orchestrator') return true
        }
      }
      return false
    }
    await waitFor(hasThought, '闪念注入', 120_000)
    console.log('[RESULT] 闪念已注入 ✓')
    for (const event of agent.session.events) {
      if (event.type !== 'agent/inbox/spliced') continue
      for (const message of event.data.inserted ?? []) {
        if (message.source?.plugin === 'waibrain-orchestrator') {
          console.log('  闪念:', message.content.map(block => block.text ?? '').join(''))
        }
      }
    }
    console.log(`[RESULT] subagent/start 次数: ${subagentStarts.length}`)
    const tools = []
    for (const event of agent.session.events) {
      if (event.type === 'request/header') tools.push((event.data?.header?.config?.tools ?? []).map(t => t.name))
    }
    console.log('[RESULT] 主请求工具:', JSON.stringify(tools[0] ?? []))
  } finally {
    await handle.dispose()
    await ctx.fiber?.dispose?.()
  }
}

main().catch((error) => {
  console.error('FATAL:', error?.message ?? error)
  const errors = error?.cause?.errors ?? []
  for (const [index, entry] of errors.entries()) {
    console.error(`  cause ${index + 1}:`, entry?.message ?? entry)
  }
  process.exit(1)
})
