/**
 * AgentOptions.reasoningEffort 的请求种子优先级:
 * 显式 options 努力度在首请求种子上胜过持久化 header 的恢复值——修 fork 影子与主对话同模型时
 * 把主对话的 off 努力度错误恢复给识别影子的陷阱;options 未定义时维持原有恢复语义;
 * 后续请求跟随已落盘 header,不回退到 options;agent/request 瀑布(模型选择)仍可覆写。
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { ReasoningEffortId, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { MockAdapter, textResponse } from './mock-adapter.ts'

const REASONING = {
  efforts: ['off', 'low', 'high', 'max'].map(id => ({ id: ReasoningEffortId(id), name: id })),
  defaultEffort: ReasoningEffortId('high'),
}

async function harness(adapter: MockAdapter) {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: 'stable base' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['mock'], adapter)
  return ctx
}

function waitForIdle(ctx: Context, agent: unknown): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') {
        dispose()
        resolve()
      }
    })
  })
}

function send(agent: { followup(message: unknown): void }, text: string) {
  agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
}

function lastRequestHeader(agent: { session: { events: readonly { type: string; data: unknown }[] } }) {
  const event = [...agent.session.events].reverse().find(e => e.type === 'request/header')
  if (event?.type !== 'request/header') return undefined
  const data = event.data as { header?: { config?: { reasoningEffort?: unknown }; adapterDefaults?: unknown } }
  return data.header
}

describe('AgentOptions.reasoningEffort 请求种子优先级', () => {
  it('首请求显式 options 努力度生效并落盘 header', async () => {
    const adapter = new MockAdapter([textResponse('one')], REASONING)
    const ctx = await harness(adapter)
    const agent = ctx.agentLoop.create(SessionId('a1'), {
      provider: 'mock', model: 'mock', reasoningEffort: ReasoningEffortId('low'),
    })
    send(agent, 'go')
    await waitForIdle(ctx, agent)

    expect(adapter.requests[0]?.reasoningEffort).toBe(ReasoningEffortId('low'))
    const header = lastRequestHeader(agent)
    expect(header?.config?.reasoningEffort).toBe(ReasoningEffortId('low'))
    expect(header?.adapterDefaults).toBeUndefined()
  })

  it('fork 种子场景:显式 options 努力度胜过同模型持久化 header 的恢复值', async () => {
    const adapter = new MockAdapter([textResponse('seed'), textResponse('forked')], REASONING)
    const ctx = await harness(adapter)
    const parent = ctx.agentLoop.create(SessionId('parent'), {
      provider: 'mock', model: 'mock', reasoningEffort: ReasoningEffortId('off'),
    })
    send(parent, 'seed')
    await waitForIdle(ctx, parent)

    const handle = await ctx.agents.create({
      sessionId: SessionId('child'),
      seed: parent.session.events,
      agentOptions: { provider: 'mock', model: 'mock', reasoningEffort: ReasoningEffortId('low') },
    })
    const child = handle.agent
    send(child, 'go')
    await waitForIdle(ctx, child)

    expect(adapter.requests[1]?.reasoningEffort).toBe(ReasoningEffortId('low'))
    await handle.dispose()
  })

  it('options 未定义时仍从同模型 header 恢复(既有语义不变)', async () => {
    const adapter = new MockAdapter([textResponse('seed'), textResponse('forked')], REASONING)
    const ctx = await harness(adapter)
    const parent = ctx.agentLoop.create(SessionId('parent'), {
      provider: 'mock', model: 'mock', reasoningEffort: ReasoningEffortId('max'),
    })
    send(parent, 'seed')
    await waitForIdle(ctx, parent)

    const handle = await ctx.agents.create({
      sessionId: SessionId('child'),
      seed: parent.session.events,
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    const child = handle.agent
    send(child, 'go')
    await waitForIdle(ctx, child)

    expect(adapter.requests[1]?.reasoningEffort).toBe(ReasoningEffortId('max'))
    await handle.dispose()
  })

  it('后续请求跟随已落盘 header,不回退到 options', async () => {
    const adapter = new MockAdapter([textResponse('one'), textResponse('two')], REASONING)
    const ctx = await harness(adapter)
    const agent = ctx.agentLoop.create(SessionId('a2'), {
      provider: 'mock', model: 'mock', reasoningEffort: ReasoningEffortId('low'),
    })
    send(agent, 'first')
    await waitForIdle(ctx, agent)
    send(agent, 'second')
    await waitForIdle(ctx, agent)

    expect(adapter.requests.map(request => request.reasoningEffort)).toEqual([
      ReasoningEffortId('low'), ReasoningEffortId('low'),
    ])
  })

  it('agent/request 瀑布(模型选择)仍可覆写 options 努力度', async () => {
    const adapter = new MockAdapter([textResponse('one')], REASONING)
    const ctx = await harness(adapter)
    const agent = ctx.agentLoop.create(SessionId('a3'), {
      provider: 'mock', model: 'mock', reasoningEffort: ReasoningEffortId('low'),
    })
    ctx.on('agent/request', async (_payload, next) => {
      const config = await next()
      return { ...config, reasoningEffort: ReasoningEffortId('max') }
    })
    send(agent, 'go')
    await waitForIdle(ctx, agent)

    expect(adapter.requests[0]?.reasoningEffort).toBe(ReasoningEffortId('max'))
  })
})
