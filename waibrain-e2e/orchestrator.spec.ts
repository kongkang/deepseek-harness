/**
 * 外脑编排器单元测试(无真实 API):import fixture 里的 orchestrator.mjs,
 * 用 fake ctx 驱动 agent/pre-step,断言 1+N 配置解析、每轮按配置 fork N 个识别影子、
 * 命中派干活影子(或直接产出)、第一人称「闪念」回灌、以及边界与 fail-loud 校验。
 * test-first 基线:旧编排器(关键词 2 分支)下这些用例应全部失败。
 */
// @ts-nocheck -- 本 spec 只用本地 fake,不引仓库类型
import { describe, expect, it } from 'vitest'
import { apply } from './fixture/waibrain-dialog/orchestrator.mjs'

/** 与 fixture agent.cordis.yml 的 shadows 同构的测试配置。 */
const CONFIG = {
  shadows: [
    {
      id: 'dev-watch', label: '任务与进程监控', task: '开发任务、构建进程等本机事项',
      model: 'deepseek-v4-flash', reasoningEffort: 'low',
      worker: { model: 'deepseek-v4-pro', reasoningEffort: 'high' },
    },
    {
      id: 'search', label: '搜索与新知', task: '需要查证的外部事实问题',
      model: 'deepseek-v4-flash', reasoningEffort: 'low', search: true,
      worker: { model: 'deepseek-v4-pro', reasoningEffort: 'high' },
    },
    {
      id: 'mood', label: '情绪观察', task: '对话情绪与氛围观察',
      model: 'deepseek-v4-flash', reasoningEffort: 'off',
    },
  ],
}

const USER_TEXT = '最近有什么新电影值得看?'

const VERDICT_SCHEMA = {
  type: 'object',
  properties: { relevant: { type: 'boolean' }, brief: { type: 'string' } },
  required: ['relevant', 'brief'],
  additionalProperties: false,
}

function textResult(text) {
  return { output: [{ type: 'text', text }], stopReason: 'completed' }
}

function verdictResult(relevant, brief) {
  return { output: [], structured: { relevant, brief }, stopReason: 'completed' }
}

async function waitFor(cond, label, timeoutMs = 3000) {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`)
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

/** 构造 fake ctx + 主 agent;scripted 按 start 调用顺序给出子智能体结果(Error 表示 start 抛错)。 */
function harness(scripted = [], config = CONFIG) {
  const listeners = new Map()
  const starts = []
  const injected = []
  const searches = []
  const warns = []
  const restrictions = []
  const ctx = {
    get: (name) => (name === 'logger' ? { warn: (...args) => { warns.push(args.map(String).join(' ')) } } : undefined),
    on: (event, fn) => { listeners.set(event, fn) },
    tools: { restrict: (restriction) => { restrictions.push(restriction) } },
    subagents: {
      start: async (provider, request) => {
        const index = starts.length
        starts.push({ provider, request })
        const scriptedResult = scripted[index]
        if (scriptedResult instanceof Error) throw scriptedResult
        const isRecognition = request.outputSchema !== undefined
        const result = scriptedResult ?? (isRecognition ? verdictResult(false, '') : textResult(''))
        return {
          id: `child-${index + 1}`,
          localAgent: {
            id: `child-${index + 1}`,
            session: { id: `child-${index + 1}`, events: [] },
            options: { provider: request.agentOptions?.provider, model: request.agentOptions?.model, subagentDepth: 1 },
          },
          result: Promise.resolve(result),
          dispose: async () => {},
        }
      },
    },
    web: {
      search: async (req) => {
        searches.push(req.query)
        return { content: 'FACTS-CONTENT', sources: [{ title: 'T', snippet: 'S', url: 'https://example.test' }] }
      },
    },
  }
  const agent = {
    options: { subagentDepth: 0 },
    session: { header: { delegationDepth: 0 }, events: [] },
    inject: (message) => { injected.push(message) },
  }
  apply(ctx, config)
  return { ctx, agent, starts, injected, searches, warns, restrictions, listeners }
}

/** 触发一轮 pre-step(返回瀑布决策),并等编排异步完成(由调用方 waitFor 具体条件)。 */
async function trigger(h, overrides = {}) {
  const payload = {
    agent: h.agent,
    messages: [{ content: [{ type: 'text', text: USER_TEXT }], source: { kind: 'user' } }],
    turn: 1, step: 1, signal: new AbortController().signal,
    ...overrides,
  }
  const decision = await h.listeners.get('agent/pre-step')(payload, async () => ({ kind: 'enter' }))
  return { payload, decision }
}

describe('配置校验(fail loud)', () => {
  it('挂载时隐藏全局审查工具,快脑保持零工具', () => {
    const h = harness()
    expect(h.restrictions).toEqual([
      { deny: ['reviewer_glm', 'reviewer_deepseek'] },
    ])
  })

  it('config 缺失或 shadows 不是非空数组时抛错', () => {
    const ctx = { on: () => {}, tools: { restrict: () => {} } }
    expect(() => apply(ctx, undefined)).toThrow(/waibrain-orchestrator/)
    expect(() => apply(ctx, {})).toThrow(/shadows/)
    expect(() => apply(ctx, { shadows: [] })).toThrow(/shadows/)
    expect(() => apply(ctx, { shadows: 'x' })).toThrow(/shadows/)
  })

  it('影子条目缺字段或类型错时抛错,并指出位置', () => {
    const ctx = { on: () => {}, tools: { restrict: () => {} } }
    const cases = [
      [{ task: 't', model: 'm', reasoningEffort: 'low' }], // 缺 id
      [{ id: 'a', model: 'm', reasoningEffort: 'low' }], // 缺 task
      [{ id: 'a', task: 't', reasoningEffort: 'low' }], // 缺 model
      [{ id: 'a', task: 't', model: 'm', reasoningEffort: 'medium' }], // 非法 effort
      [{ id: 'a', task: 't', model: 'm', reasoningEffort: 'low', search: 'yes' }], // search 非 bool
      [{ id: 'a', task: 't', model: 'm', reasoningEffort: 'low', worker: { model: 'p' } }], // worker 缺 effort
      [{ id: 'a', task: 't', model: 'm', reasoningEffort: 'low', worker: { reasoningEffort: 'high' } }], // worker 缺 model
      [
        { id: 'a', task: 't', model: 'm', reasoningEffort: 'low' },
        { id: 'a', task: 't2', model: 'm2', reasoningEffort: 'low' },
      ], // 重复 id
    ]
    for (const shadows of cases) {
      expect(() => apply(ctx, { shadows }), JSON.stringify(shadows)).toThrow(/waibrain-orchestrator/)
    }
  })

  it('合法配置不抛错(label 可缺省回退 id)', () => {
    const ctx = { on: () => {}, tools: { restrict: () => {} } }
    expect(() => apply(ctx, CONFIG)).not.toThrow()
    expect(() => apply(ctx, {
      shadows: [{ id: 'solo', task: 't', model: 'm', reasoningEffort: 'off' }],
    })).not.toThrow()
  })
})

describe('每轮按配置 fork N 个识别影子', () => {
  it('一轮 pre-step 后按配置并行 fork 3 个识别影子,字段逐项正确', async () => {
    const h = harness()
    const { decision } = await trigger(h)
    expect(decision.kind).toBe('enter')
    await waitFor(() => h.starts.length === 3, '3 个识别影子 fork')

    for (const [index, shadow] of CONFIG.shadows.entries()) {
      const { provider, request } = h.starts[index]
      expect(provider).toBe('fork')
      expect(request.parent).toBe(h.agent)
      expect(request.agentOptions).toEqual({
        provider: 'deepseek-official', model: shadow.model, reasoningEffort: shadow.reasoningEffort,
      })
      expect(request.outputSchema).toEqual(VERDICT_SCHEMA)
      expect(request.persona).toContain(shadow.label)
      expect(request.persona).toContain(shadow.task)
      expect(request.label).toBe(`${shadow.label}·识别`)
      expect(request.prompt[0].text).toContain(USER_TEXT)
      expect(request.signal).toBeInstanceOf(AbortSignal)
    }
    // 默认脚本:全部「无关」→ 不派 worker、不注入。
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(h.starts.length).toBe(3)
    expect(h.injected).toHaveLength(0)
  })

  it('识别影子结构化结果缺失(未调工具)时不派、不注入、不抛错', async () => {
    const h = harness([
      { output: [], structured: undefined, stopReason: 'error' },
      verdictResult(false, ''),
      verdictResult(false, ''),
    ])
    await trigger(h)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(h.starts.length).toBe(3)
    expect(h.injected).toHaveLength(0)
    // 除例行诊断(round start / pre-step)外,不得有错误日志。
    expect(h.warns.filter(w => !w.includes('round start') && !w.includes('pre-step'))).toHaveLength(0)
  })
})

describe('命中 → 派干活影子 → 闪念回灌', () => {
  it('有 worker 的影子命中后派 pro 干活影子,结果以【闪念】注入', async () => {
    const h = harness([
      verdictResult(true, '查一下构建状态'), // dev-watch
      verdictResult(true, '查最近上映的电影'), // search
      verdictResult(false, ''), // mood
      textResult('我刚看了一眼,构建还在跑。'), // dev-watch 干活
      textResult('我刚查了,最近上映的有《XX》。'), // search 干活
    ])
    await trigger(h)
    await waitFor(() => h.injected.length === 2, '两个干活影子闪念注入')

    const workerStarts = h.starts.slice(3)
    expect(workerStarts).toHaveLength(2)
    for (const { provider, request } of workerStarts) {
      expect(provider).toBe('fork')
      expect(request.outputSchema).toBeUndefined()
      expect(request.agentOptions).toEqual({ provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'high' })
      expect(request.label?.endsWith('·干活')).toBe(true)
    }
    expect(workerStarts[0].request.prompt[0].text).toContain('查一下构建状态')
    expect(workerStarts[1].request.prompt[0].text).toContain('查最近上映的电影')
    expect(workerStarts[1].request.prompt[0].text).toContain('FACTS-CONTENT')
    expect(h.searches).toEqual([USER_TEXT])

    const texts = h.injected.map(message => message.content[0].text)
    expect(texts).toContain('【闪念】我刚看了一眼,构建还在跑。')
    expect(texts).toContain('【闪念】我刚查了,最近上映的有《XX》。')
    for (const message of h.injected) {
      expect(message.source.kind).toBe('plugin')
      expect(message.source.plugin).toBe('waibrain-orchestrator')
      expect(message.source.form).toBe('notice')
      expect(message.role).toBe('user')
    }
  })

  it('无 worker 的影子命中后直接把 brief 当闪念注入', async () => {
    const h = harness([
      verdictResult(false, ''), // dev-watch
      verdictResult(false, ''), // search
      verdictResult(true, '气氛有点闷,可以聊聊轻松的话题。'), // mood 直接产出
    ])
    await trigger(h)
    await waitFor(() => h.injected.length === 1, '无 worker 影子直接注入')
    expect(h.starts).toHaveLength(3)
    expect(h.injected[0].content[0].text).toBe('【闪念】气氛有点闷,可以聊聊轻松的话题。')
  })

  it('search 影子搜索失败只记日志,干活影子照派(无搜索结果)', async () => {
    const h = harness([
      verdictResult(false, ''),
      verdictResult(true, '查最近上映的电影'),
      verdictResult(false, ''),
      textResult('我没找到更多信息。'),
    ])
    h.ctx.web.search = async () => { throw new Error('search down') }
    await trigger(h)
    await waitFor(() => h.injected.length === 1, '搜索失败仍回灌')
    expect(h.warns.some(w => w.includes('search failed'))).toBe(true)
    const workerPrompt = h.starts[3].request.prompt[0].text
    expect(workerPrompt).toContain('查最近上映的电影')
    expect(workerPrompt).not.toContain('FACTS-CONTENT')
  })
})

describe('边界与防御', () => {
  it('闪念剥掉重复【闪念】前缀并按 300 字截断', async () => {
    const long = '【闪念】' + '字'.repeat(500)
    const h = harness([
      verdictResult(true, 'x'), // dev-watch
      verdictResult(false, ''),
      verdictResult(false, ''),
      textResult(long),
    ])
    await trigger(h)
    await waitFor(() => h.injected.length === 1, '截断闪念注入')
    expect(h.injected[0].content[0].text).toBe('【闪念】' + '字'.repeat(300))
  })

  it('干活影子输出空白时不注入', async () => {
    const h = harness([
      verdictResult(true, 'x'),
      verdictResult(false, ''),
      verdictResult(false, ''),
      textResult('   \n  '),
    ])
    await trigger(h)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(h.injected).toHaveLength(0)
  })

  it('识别影子 start 抛错只记日志,不抛出、不中断其余影子', async () => {
    const h = harness([
      new Error('provider down'),
      verdictResult(false, ''),
      verdictResult(true, '气氛不错。'),
    ])
    const { decision } = await trigger(h)
    await waitFor(() => h.injected.length === 1, '其余影子照常注入')
    expect(decision.kind).toBe('enter')
    expect(h.warns.some(w => w.includes('provider down'))).toBe(true)
  })

  it('delegationDepth > 0(子智能体自身轮次)不编排', async () => {
    const h = harness()
    h.agent.options.subagentDepth = 1
    await trigger(h)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(h.starts).toHaveLength(0)
  })

  it('header 的 delegationDepth 同样挡住编排', async () => {
    const h = harness()
    h.agent.session.header.delegationDepth = 2
    await trigger(h)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(h.starts).toHaveLength(0)
  })

  it('step ≠ 1 或决策非 enter 不编排', async () => {
    const h = harness()
    await trigger(h, { step: 2 })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(h.starts).toHaveLength(0)

    const h2 = harness()
    await h2.listeners.get('agent/pre-step')(
      { agent: h2.agent, messages: [{ content: [{ type: 'text', text: USER_TEXT }], source: { kind: 'user' } }], turn: 1, step: 1, signal: new AbortController().signal },
      async () => ({ kind: 'reject' }),
    )
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(h2.starts).toHaveLength(0)
  })

  it('无用户文本不编排', async () => {
    const h = harness()
    await h.listeners.get('agent/pre-step')(
      { agent: h.agent, messages: [], turn: 1, step: 1, signal: new AbortController().signal },
      async () => ({ kind: 'enter' }),
    )
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(h.starts).toHaveLength(0)
  })

  it('主轮次中止信号传播到所有已 fork 的影子', async () => {
    const controller = new AbortController()
    const h = harness()
    await trigger(h, { signal: controller.signal })
    await waitFor(() => h.starts.length === 3, 'fork 已发出')
    controller.abort()
    await waitFor(() => h.starts.every(({ request }) => request.signal.aborted), '中止传播')
  })
})
