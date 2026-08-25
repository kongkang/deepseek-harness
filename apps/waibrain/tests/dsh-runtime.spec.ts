/** Browser wire acceptance for the Host-backed WaiBrain client. */

import { describe, expect, it } from 'vitest'
import { DshRuntimeClient, type RpcFetch, type WaiBrainAgentConfig } from '../src/dsh-runtime.ts'

function successful(value: unknown): Response {
  return new Response(JSON.stringify({ rpcId: 'test', result: { ok: true, value } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function body(init: RequestInit | undefined): { method: string; payload: Record<string, unknown> } {
  if (typeof init?.body !== 'string') throw new Error('request body must be JSON text')
  return JSON.parse(init.body) as { method: string; payload: Record<string, unknown> }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

const config: WaiBrainAgentConfig = {
  label: '林川',
  role: {
    name: '林川', tagline: '思考伙伴', personality: '温和', voice: '简洁', scenario: '长期陪伴',
    greeting: '我在。', examples: '用户：你好。', systemPrompt: '你是林川。',
  },
  mainSelection: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'off' },
  externalBrains: [{
    id: 'facts', label: '事实', direction: '查证', persona: '先查证。', enabled: true,
    selection: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'high' },
  }],
}

describe('WaiBrain Host runtime client', () => {
  it('keeps the existing model catalog carrier', async () => {
    const calls: Array<{ url: string; method: string; payload: Record<string, unknown> }> = []
    const fetch: RpcFetch = async (input, init) => {
      const request = body(init)
      calls.push({ url: requestUrl(input), method: request.method, payload: request.payload })
      return successful({ groups: [], failures: [] })
    }
    const client = new DshRuntimeClient(fetch)
    await expect(client.models()).resolves.toEqual({ groups: [], failures: [] })
    expect(calls).toEqual([{ url: '/api/llm.models', method: 'llm.models', payload: {} }])
  })

  it('uses strict Typert request args for every WaiBrain Remote', async () => {
    const calls: Array<{ url: string; method: string; payload: Record<string, unknown> }> = []
    const fetch: RpcFetch = async (input, init) => {
      const request = body(init)
      calls.push({ url: requestUrl(input), method: request.method, payload: request.payload })
      if (request.method === 'waibrain/bootstrap') {
        return successful({ limits: {}, agents: [], conversations: [], selectedAgentId: null, selectedConversationId: null })
      }
      return successful({ ok: true, value: request.method === 'waibrain/saveAgent' ? { agent: { id: 'a1' } } : {} })
    }
    const client = new DshRuntimeClient(fetch)
    await client.bootstrap()
    await client.saveAgent({ expectedRevision: null, config })
    await client.selectAgent({ agentId: 'a1' })
    await client.createConversation({ agentId: 'a1' })
    await client.selectConversation({ conversationId: 'c1' })
    await client.conversation({ conversationId: 'c1' })
    await client.prompt({ conversationId: 'c1', text: '你好' })
    await client.closeConversation({ conversationId: 'c1' })

    expect(calls.map(call => [call.url, call.method])).toEqual([
      ['/api/waibrain/bootstrap', 'waibrain/bootstrap'],
      ['/api/waibrain/saveAgent', 'waibrain/saveAgent'],
      ['/api/waibrain/selectAgent', 'waibrain/selectAgent'],
      ['/api/waibrain/createConversation', 'waibrain/createConversation'],
      ['/api/waibrain/selectConversation', 'waibrain/selectConversation'],
      ['/api/waibrain/conversation', 'waibrain/conversation'],
      ['/api/waibrain/prompt', 'waibrain/prompt'],
      ['/api/waibrain/closeConversation', 'waibrain/closeConversation'],
    ])
    expect(calls[0]?.payload).toEqual({ args: {} })
    expect(calls[1]?.payload).toEqual({ args: { request: { expectedRevision: null, config } } })
    expect(calls[6]?.payload).toEqual({ args: { request: { conversationId: 'c1', text: '你好' } } })
  })

  it('preserves Host business rejections inside a successful transport', async () => {
    const fetch: RpcFetch = async () => successful({
      ok: false,
      error: { code: 'conversation-busy', conversationId: 'c1' },
    })
    const client = new DshRuntimeClient(fetch)
    await expect(client.prompt({ conversationId: 'c1', text: '第二条' })).resolves.toEqual({
      ok: false,
      error: { code: 'conversation-busy', conversationId: 'c1' },
    })
  })
})
