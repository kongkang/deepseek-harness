import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import WaiBrainHost, {
  buildWaiBrainPersona,
  validatePersonaText,
  type WaiBrainAgentConfig,
  type WaiBrainHostService,
} from '../src/index.ts'
import { WaiBrainHostService as WaiBrainHostServiceClass } from '../src/index.ts'
import { waibrainAgentConfigSchema, waibrainAgentRowSchema } from '../src/spec.ts'
import type { WaiBrainAgentRow, WaiBrainConversationRow, WaiBrainDomainState } from '../src/spec.ts'
import * as WaiBrainSessionPlugin from '../src/session.ts'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function config(name = '林川'): WaiBrainAgentConfig {
  return {
    label: name,
    role: {
      name,
      tagline: '陪用户把混乱慢慢想清楚的人',
      personality: '温和、诚实、清醒',
      voice: '自然、简洁',
      scenario: '长期在场的思考伙伴',
      greeting: '我在。',
      examples: '用户：你好。\n林川：你好。',
      systemPrompt: `你是${name}。`,
    },
    mainSelection: {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      reasoningEffort: 'off',
    },
    externalBrains: [{
      id: 'facts',
      label: '事实与新知',
      direction: '查证外部事实',
      persona: '先查证，再简洁作答。',
      selection: {
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
        reasoningEffort: 'high',
      },
      enabled: true,
    }],
  }
}

async function harness(root?: string): Promise<{ ctx: Context; service: WaiBrainHostService; root: string }> {
  const storageRoot = root ?? await mkdtemp(join(tmpdir(), 'dsh-waibrain-test-'))
  if (root === undefined) roots.push(storageRoot)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: storageRoot })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(WaiBrainHost, {
    maxAdmittedBranches: 2,
    externalBrainTimeoutMs: 5_000,
    externalBrainMaxTokens: 256,
    maxResultBytes: 1_024,
  })
  return { ctx, service: ctx.waibrainHost, root: storageRoot }
}

function domainInternals(service: WaiBrainHostService): {
  domain: { global: { get(): WaiBrainDomainState; set(value: WaiBrainDomainState): Promise<void> } }
  agents: {
    get(id: WaiBrainAgentRow['revisions'][number]['id']): WaiBrainAgentRow | undefined
  }
  conversations: {
    get(id: WaiBrainConversationRow['id']): WaiBrainConversationRow | undefined
    put(id: WaiBrainConversationRow['id'], value: WaiBrainConversationRow): Promise<void>
  }
  recoverPendingOperation(): Promise<void>
  serial<T>(conversationId: WaiBrainConversationRow['id'], operation: () => Promise<T>): Promise<T>
  modelSelection(selection: WaiBrainAgentConfig['mainSelection']): Record<string, unknown>
  ensureConversationAgent(row: WaiBrainConversationRow, revision: WaiBrainAgentRow['revisions'][number]): Promise<unknown>
} {
  return service as unknown as ReturnType<typeof domainInternals>
}

describe('WaiBrain Host agent domain', () => {
  it('rejects every non-positive or non-integer deployment limit', () => {
    const valid = {
      maxAdmittedBranches: 1,
      externalBrainTimeoutMs: 1,
      externalBrainMaxTokens: 1,
      maxResultBytes: 1,
    }
    for (const [name, value] of [
      ['maxAdmittedBranches', 0],
      ['externalBrainTimeoutMs', -1],
      ['externalBrainMaxTokens', 1.5],
      ['maxResultBytes', Number.MAX_SAFE_INTEGER + 1],
    ] as const) {
      expect(() => new WaiBrainHostServiceClass(new Context(), { ...valid, [name]: value }))
        .toThrow(`host-waibrain: ${name} must be a positive safe integer`)
    }
  })

  it('renders an intentionally sparse persona without empty optional sections', () => {
    const sparse: WaiBrainAgentConfig = {
      ...config(),
      role: {
        name: '空白角色',
        tagline: '',
        personality: '',
        voice: '',
        scenario: '',
        greeting: '',
        examples: '',
        systemPrompt: '保留这一条。',
      },
    }
    expect(buildWaiBrainPersona(sparse)).toBe([
      '你是「空白角色」。',
      '保留这一条。',
      '你只负责自然对话，不调用任何工具。后台外挂外脑的结果会以【闪念】出现；只在有帮助时自然吸收，不解释后台机制，也不要逐字复述。',
    ].join('\n\n'))
  })

  it('rejects duplicate external-brain ids and inconsistent stored revision heads', () => {
    const base = config()
    const duplicated: WaiBrainAgentConfig = {
      ...base,
      externalBrains: [
        base.externalBrains[0]!,
        { ...base.externalBrains[0]!, label: '重复项' },
      ],
    }
    expect(waibrainAgentConfigSchema.safeParse(duplicated).success).toBe(false)
    expect(waibrainAgentRowSchema.safeParse({
      currentRevision: 2,
      revisions: [{
        id: '00000000-0000-4000-8000-000000000001',
        revision: 1,
        config: config(),
        createdAt: 0,
      }],
    }).success).toBe(false)
  })

  it('exposes the preset companion as a plugin namespace so Loader keeps its injection metadata', () => {
    expect(WaiBrainSessionPlugin).not.toHaveProperty('default')
    expect(WaiBrainSessionPlugin.inject).toEqual(['systemPrompt', 'tools'])
  })

  it('publishes the product Remote namespace', async () => {
    const { service } = await harness()
    expect(service.typertRemote.namespace).toBe('waibrain')
    expect(remoteMethods(service).map(method => method.method)).toEqual([
      'bootstrap',
      'saveAgent',
      'selectAgent',
      'createConversation',
      'selectConversation',
      'conversation',
      'prompt',
      'closeConversation',
    ])
  })

  it('creates immutable revisions and restores selection after a Host restart', async () => {
    const first = await harness()
    const created = await first.service.saveAgent({ expectedRevision: null, config: config() })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.value.agent.revision).toBe(1)
    expect(created.value.agent.config.role.name).toBe('林川')

    await expect(first.service.selectAgent({ agentId: created.value.agent.id })).resolves.toEqual({
      ok: true,
      value: { selectedAgentId: created.value.agent.id },
    })
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)

    const second = await harness(first.root)
    const restored = second.service.bootstrap()
    expect(restored.selectedAgentId).toBe(created.value.agent.id)
    expect(restored.agents).toEqual([created.value.agent])

    const updated = await second.service.saveAgent({
      agentId: created.value.agent.id,
      expectedRevision: 1,
      config: config('苏禾'),
    })
    expect(updated.ok).toBe(true)
    if (!updated.ok) return
    expect(updated.value.agent.revision).toBe(2)
    expect(updated.value.agent.config.role.name).toBe('苏禾')

    await expect(second.service.saveAgent({
      agentId: created.value.agent.id,
      expectedRevision: 1,
      config: config('旧页面'),
    })).resolves.toEqual({
      ok: false,
      error: { code: 'revision-conflict', current: updated.value.agent },
    })
  })

  it('returns typed not-found results and rejects a malformed create request before storage', async () => {
    const { service } = await harness()
    const missingAgent = '00000000-0000-4000-8000-000000000099' as never
    const missingConversation = '00000000-0000-4000-8000-000000000098' as never
    await expect(service.selectAgent({ agentId: missingAgent })).resolves.toMatchObject({
      ok: false, error: { code: 'agent-not-found' },
    })
    await expect(service.createConversation({ agentId: missingAgent })).resolves.toMatchObject({
      ok: false, error: { code: 'agent-not-found' },
    })
    await expect(service.selectConversation({ conversationId: missingConversation })).resolves.toMatchObject({
      ok: false, error: { code: 'conversation-not-found' },
    })
    await expect(service.conversation({ conversationId: missingConversation })).resolves.toMatchObject({
      ok: false, error: { code: 'conversation-not-found' },
    })
    await expect(service.prompt({ conversationId: missingConversation, text: '不存在' })).resolves.toMatchObject({
      ok: false, error: { code: 'conversation-not-found' },
    })
    await expect(service.closeConversation({ conversationId: missingConversation })).resolves.toMatchObject({
      ok: false, error: { code: 'conversation-not-found' },
    })
    await expect(service.saveAgent({ expectedRevision: 1, config: config() })).rejects.toThrow(
      'a new Agent requires expectedRevision=null',
    )
    await expect(service.saveAgent({ agentId: missingAgent, expectedRevision: 1, config: config() }))
      .resolves.toMatchObject({ ok: false, error: { code: 'agent-not-found' } })

    const saved = await service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    await expect(service.createConversation({ agentId: saved.value.agent.id })).resolves.toEqual({
      ok: false,
      error: { code: 'runtime-unavailable' },
    })
  })

  it('rejects enabled counts at save while preserving arbitrary disabled brains', async () => {
    const { service } = await harness()
    const base = config()
    const tooMany: WaiBrainAgentConfig = {
      ...base,
      externalBrains: [
        ...base.externalBrains,
        { ...base.externalBrains[0]!, id: 'tasks', label: '任务' },
        { ...base.externalBrains[0]!, id: 'memory', label: '记忆' },
      ],
    }
    await expect(service.saveAgent({ expectedRevision: null, config: tooMany })).resolves.toEqual({
      ok: false,
      error: { code: 'branch-limit-exceeded', maxAdmittedBranches: 2, enabledCount: 3 },
    })

    const withinLimit: WaiBrainAgentConfig = {
      ...tooMany,
      externalBrains: tooMany.externalBrains.map((brain, index) => index === 2 ? { ...brain, enabled: false } : brain),
    }
    const accepted = await service.saveAgent({ expectedRevision: null, config: withinLimit })
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.value.agent.config.externalBrains).toHaveLength(3)
  })

  it('uses the System Prompt renderer as the one persona-template validator', () => {
    expect(validatePersonaText('role.systemPrompt', '普通文本')).toBeUndefined()
    expect(validatePersonaText('role.systemPrompt', '孤立 {{ 可以')).toBeUndefined()
    expect(validatePersonaText('role.systemPrompt', '{{foo}}')).toMatchObject({
      code: 'invalid-persona-template', field: 'role.systemPrompt', offset: 0,
    })
    expect(validatePersonaText('role.systemPrompt', '{{model}}')).toMatchObject({
      code: 'invalid-persona-template', field: 'role.systemPrompt', offset: 0,
    })
    expect(validatePersonaText('role.systemPrompt', '前缀 {{a{b}}')).toMatchObject({
      code: 'invalid-persona-template', field: 'role.systemPrompt', offset: 3,
    })
  })

  it('returns the exact invalid field before touching storage', async () => {
    const { service } = await harness()
    const base = config()
    const invalid: WaiBrainAgentConfig = {
      ...base,
      externalBrains: base.externalBrains.map((brain, index) => index === 0
        ? { ...brain, persona: '请使用 {{model}}' }
        : brain),
    }
    await expect(service.saveAgent({ expectedRevision: null, config: invalid })).resolves.toEqual({
      ok: false,
      error: {
        code: 'invalid-persona-template',
        field: 'externalBrains[0].persona',
        offset: 4,
      },
    })
    expect(service.bootstrap().agents).toEqual([])
  })

  it('reports a role-field template before checking external brains', async () => {
    const { service } = await harness()
    const base = config()
    const invalid: WaiBrainAgentConfig = { ...base, role: { ...base.role, name: '{{bad}}' } }
    await expect(service.saveAgent({ expectedRevision: null, config: invalid })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-persona-template', field: 'role.name', offset: 0 },
    })
  })

  it('reconciles in-domain transactions, filters stale indexes, and keeps cold operations typed', async () => {
    const { service } = await harness()
    const saved = await service.saveAgent({ expectedRevision: null, config: config() })
    if (!saved.ok) throw new Error(saved.error.code)
    const internals = domainInternals(service)
    const newer: WaiBrainConversationRow = {
      id: '00000000-0000-4000-8000-000000000101' as never,
      agentId: saved.value.agent.id,
      sessionId: SessionId('00000000-0000-4000-8000-000000000111'),
      createdAt: 20,
      status: 'open',
      hasPendingWake: false,
    }
    const older: WaiBrainConversationRow = {
      ...newer,
      id: '00000000-0000-4000-8000-000000000100' as never,
      sessionId: SessionId('00000000-0000-4000-8000-000000000110'),
      createdAt: 10,
    }
    await internals.conversations.put(newer.id, newer)
    await internals.conversations.put(older.id, older)
    const staleAgentId = '00000000-0000-4000-8000-000000000199' as never
    await internals.domain.global.set({
      ...internals.domain.global.get(),
      agentIds: [saved.value.agent.id, staleAgentId],
      pendingOperation: {
        kind: 'create-conversation',
        conversationId: newer.id,
        agentId: newer.agentId,
        sessionId: SessionId(newer.sessionId),
      },
    })
    await internals.recoverPendingOperation()
    expect(service.bootstrap()).toMatchObject({
      agents: [saved.value.agent],
      selectedConversationId: newer.id,
      conversations: [{ id: older.id }, { id: newer.id }],
    })

    const abandoned = '00000000-0000-4000-8000-000000000102' as never
    await internals.domain.global.set({
      ...internals.domain.global.get(),
      pendingOperation: {
        kind: 'create-conversation',
        conversationId: abandoned,
        agentId: saved.value.agent.id,
        sessionId: SessionId('00000000-0000-4000-8000-000000000112'),
      },
    })
    await internals.recoverPendingOperation()
    expect(internals.domain.global.get().pendingOperation).toBeNull()

    await expect(service.prompt({ conversationId: older.id, text: '没有完整运行时' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'runtime-unavailable' } })
    await expect(internals.ensureConversationAgent(older, saved.value.agent))
      .rejects.toThrow('WaiBrain Agent runtime is unavailable')
    await expect(service.closeConversation({ conversationId: older.id }))
      .resolves.toEqual({ ok: true, value: { closed: true } })
    await expect(service.conversation({ conversationId: older.id })).resolves.toMatchObject({
      ok: true,
      value: { conversation: { status: 'closed' }, busy: false, messages: [], rounds: [] },
    })
    expect(service.personaForSession(SessionId('unbound'))).toBeUndefined()
    await internals.conversations.put(newer.id, { ...newer, agentId: staleAgentId })
    expect(service.personaForSession(SessionId(newer.sessionId))).toBeUndefined()
    expect(internals.modelSelection({ provider: 'mock', model: 'plain' })).toEqual({ provider: 'mock', model: 'plain' })
  })

  it('continues a serialized conversation after an earlier operation rejects', async () => {
    const { service } = await harness()
    const internals = domainInternals(service)
    const conversationId = '00000000-0000-4000-8000-000000000120' as never
    const first = internals.serial(conversationId, () => Promise.reject(new Error('first failed')))
    const second = internals.serial(conversationId, () => Promise.resolve('continued'))
    await expect(first).rejects.toThrow('first failed')
    await expect(second).resolves.toBe('continued')
  })

  it('fails loud when methods are called before Host storage initialization', async () => {
    const service = new WaiBrainHostServiceClass(new Context(), {
      maxAdmittedBranches: 1,
      externalBrainTimeoutMs: 1,
      externalBrainMaxTokens: 1,
      maxResultBytes: 1,
    })
    expect(() => service.bootstrap()).toThrow('domain is not initialized')
    await expect(service.saveAgent({ expectedRevision: null, config: config() }))
      .rejects.toThrow('Agent table is not initialized')
    await expect(service.conversation({ conversationId: '00000000-0000-4000-8000-000000000121' as never }))
      .rejects.toThrow('conversation table is not initialized')
  })
})
