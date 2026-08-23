/** DSH wire acceptance for the standalone WaiBrain runtime. */

import { describe, expect, it } from 'vitest'
import {
  DshRuntimeClient,
  type ModelSelection,
  type RpcFetch,
} from '../src/dsh-runtime.ts'

function successful(value: unknown): Response {
  return new Response(JSON.stringify({
    rpcId: 'test',
    result: { ok: true, value },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function serializedBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== 'string') throw new Error('test request body must be a string')
  return init.body
}

describe('WaiBrain DSH runtime client', () => {
  it('loads the configured model catalog without reading settings documents', async () => {
    const calls: Array<{ method: string; payload: unknown }> = []
    const fetch: RpcFetch = async (_input, init) => {
      const body = JSON.parse(serializedBody(init)) as { method: string; payload: unknown }
      calls.push({ method: body.method, payload: body.payload })
      return successful({
        groups: [{
          id: 'deepseek-official',
          name: 'DeepSeek',
          models: [{
            id: 'deepseek-v4-flash',
            name: 'DeepSeek V4 Flash',
            reasoning: {
              efforts: [{ id: 'off', name: 'Off' }, { id: 'high', name: 'High' }],
              defaultEffort: 'high',
            },
          }],
        }],
        failures: [],
      })
    }
    const client = new DshRuntimeClient(fetch)

    const catalog = await client.models()

    expect(catalog.groups[0]?.models[0]?.reasoning?.efforts.map(effort => effort.id))
      .toEqual(['off', 'high'])
    expect(calls).toEqual([{ method: 'llm.models', payload: {} }])
  })

  it('creates a prompted Session and applies its model without changing the global default', async () => {
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = []
    const selection: ModelSelection = {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      reasoningEffort: 'off',
    }
    const fetch: RpcFetch = async (_input, init) => {
      const body = JSON.parse(serializedBody(init)) as {
        method: string
        payload: Record<string, unknown>
      }
      calls.push({ method: body.method, payload: body.payload })
      if (body.method === 'session.create') return successful({ sessionId: 'session-main' })
      if (body.method === 'session.selectModel') return successful({ selected: selection })
      throw new Error(`unexpected method ${body.method}`)
    }
    const client = new DshRuntimeClient(fetch)

    const sessionId = await client.createAgent({
      systemPrompt: 'You are Lin Chuan.',
      selection,
      agentPreset: 'waibrain',
    })

    expect(sessionId).toBe('session-main')
    expect(calls).toEqual([
      {
        method: 'session.create',
        payload: { systemPrompt: 'You are Lin Chuan.', agentPreset: 'waibrain' },
      },
      {
        method: 'session.selectModel',
        payload: {
          sessionId: 'session-main',
          provider: 'deepseek-official',
          model: 'deepseek-v4-flash',
          reasoningEffort: 'off',
          saveAsDefault: false,
        },
      },
    ])
  })

  it('submits prompts and returns the new durable assistant text after the turn settles', async () => {
    let historyReads = 0
    const fetch: RpcFetch = async (_input, init) => {
      const body = JSON.parse(serializedBody(init)) as { method: string }
      if (body.method === 'session.prompt') return successful({ accepted: true })
      if (body.method !== 'session.history') throw new Error(`unexpected method ${body.method}`)
      historyReads += 1
      return successful({
        events: historyReads === 1 ? [] : [
          {
            event: {
              type: 'assistant/message', seq: 0, time: 1,
              data: {
                turn: 1,
                step: 1,
                message: {
                  role: 'assistant', id: 'a1', source: { kind: 'model', provider: 'p', model: 'm' },
                  content: [{ type: 'text', text: 'Branch report ready.' }],
                },
              },
            },
          },
          {
            event: {
              type: 'turn/end', seq: 1, time: 2,
              data: { turn: 1, reason: { kind: 'completed' } },
            },
          },
        ],
        hasMore: false,
      })
    }
    const client = new DshRuntimeClient(fetch, { pollIntervalMs: 0 })

    const reply = await client.promptAndWait('branch-1', 'Inspect this.', -1)

    expect(reply).toEqual({ text: 'Branch report ready.', endSeq: 1 })
    expect(historyReads).toBe(2)
  })
})
