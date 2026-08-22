import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPresets from '@deepseek-ai/dsh-agent-presets'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import BashSandbox from '@deepseek-ai/dsh-bash-sandbox'
import * as ShellEnv from '@deepseek-ai/dsh-shell-env'
import SubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { pathToFileURL } from 'node:url'

const WORKTREE = '/Users/kongkang/Developer/deepseek-harness/.worktree/voice-skill-design'
const USER_ROOT = '/Users/kongkang/.dsh/.agent-presets'

async function main(): Promise<void> {
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
  // Host-plane services the web profile provides (moved out of presets):
  await ctx.plugin(SubagentRuntime)
  await ctx.plugin(Spawn, { providerName: 'spawn' })
  await ctx.plugin(SubprocessRuntime)
  await ctx.plugin(BashSandbox)
  await ctx.plugin(ShellEnv)
  await ctx.plugin(AgentPresets, {
    default: 'waibrain-dialog',
    roots: [{ path: USER_ROOT, trust: 'user' }],
    includeUserRoot: false,
  })

  const listed = await ctx.agentPresets.list()
  console.log('roster:', JSON.stringify(listed.map(p => ({ id: p.id, broken: p.broken, trust: p.trust }))))

  try {
    const handle = await ctx.agents.create({
      sessionId: SessionId('waibrain-mount-check'),
      setup: async (agentCtx: Context) => {
        await ctx.agentPresets.mount(agentCtx, 'waibrain-dialog')
      },
    })
    console.log('MOUNT OK. tools =', JSON.stringify(ctx.tools.schemas(handle.agent).map(s => s.name).sort()))
    await handle.dispose()
  } catch (error) {
    console.log('MOUNT FAILED:')
    console.log(error instanceof Error ? error.message : String(error))
    if (error instanceof Error && error.cause !== undefined) {
      console.log('--- cause ---')
      console.log(String(error.cause).slice(0, 800))
    }
  }
  await ctx.fiber?.dispose?.()
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
