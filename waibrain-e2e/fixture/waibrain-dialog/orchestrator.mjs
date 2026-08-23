/**
 * 外脑对话 1+N 编排插件(import-free 版本)。
 *
 * 用户自建预设的相对路径插件必须「零 import」:DSH 加载器走 Node 的 ESM resolver,
 * 从 ~/.dsh 出发解析不到仓库里的 TypeScript 源码(@deepseek-ai/* 裸包名解析不到),
 * 而且 .ts 文件会触发 require(esm) 循环错误。因此本文件:
 * - 用 .mjs(显式 ESM)
 * - 不 import 任何包(id 用 globalThis.crypto.randomUUID(),深度判断内联)
 * - 子智能体派发 / 搜索 / 注入全靠注入的服务 ctx.subagents + ctx.web + agent 句柄
 *
 * 数据驱动的 1+N(编排在 agent 之外,不让模型自己触发):
 * - 配置 = 本插件行的 config.shadows:N 个影子,每个有任务描述、识别模型/思考程度,
 *   可选 worker 干活层(模型/思考程度)与 search 开关;
 * - 每轮主对话第一步,按配置从主对话 fork N 个识别影子(flash),各自用结构化输出
 *   独立判断「这轮归不归我管」;
 * - 命中的识别影子:配了 worker 则派对应的干活影子(pro,可选先做搜索),否则直接把
 *   brief 当结果;产出以第一人称「闪念」注入主对话下一轮(非唤醒 next-step)。
 *
 * @module waibrain-orchestrator
 */
export const name = 'waibrain-orchestrator'
export const inject = ['subagents', 'web', 'tools']

/** 宿主全局配置里可见的审查工具名:外脑主对话必须零工具,在预设层藏掉它们。 */
const DENIED_TOOLS = ['reviewer_glm', 'reviewer_deepseek']

/** 影子请求的 provider 路由(配置只声明模型与思考程度,路由固定)。 */
const PROVIDER = 'deepseek-official'
/** 适配器接受的合法思考程度(off/low/high/max)。 */
const EFFORTS = ['off', 'low', 'high', 'max']
/** 闪念文本上限(防止干活影子跑题输出淹没对话)。 */
const MAX_THOUGHT_LENGTH = 300
/** 搜索结果进干活 prompt 的字节上限。 */
const MAX_FACTS_LENGTH = 2000

/** 识别影子的结构化输出约定:relevant 判断 + brief 工作要点(或直接闪念)。 */
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    relevant: { type: 'boolean' },
    brief: { type: 'string' },
  },
  required: ['relevant', 'brief'],
  additionalProperties: false,
}

/** fail-loud 配置校验:坏配置在插件加载时抛错,而不是每轮静默降级。 */
function validateConfig(config) {
  const shadows = config?.shadows
  if (!Array.isArray(shadows) || shadows.length === 0) {
    throw new Error('waibrain-orchestrator: config.shadows must be a non-empty array')
  }
  const ids = new Set()
  for (const [index, shadow] of shadows.entries()) {
    const at = `waibrain-orchestrator: shadows[${index}]`
    if (typeof shadow !== 'object' || shadow === null) throw new Error(`${at} must be an object`)
    if (typeof shadow.id !== 'string' || shadow.id === '') throw new Error(`${at}.id must be a non-empty string`)
    if (ids.has(shadow.id)) throw new Error(`${at}.id duplicates "${shadow.id}"`)
    ids.add(shadow.id)
    if (typeof shadow.task !== 'string' || shadow.task === '') throw new Error(`${at}.task must be a non-empty string`)
    if (typeof shadow.model !== 'string' || shadow.model === '') throw new Error(`${at}.model must be a non-empty string`)
    if (!EFFORTS.includes(shadow.reasoningEffort)) {
      throw new Error(`${at}.reasoningEffort must be one of ${EFFORTS.join('/')}`)
    }
    if (shadow.search !== undefined && typeof shadow.search !== 'boolean') {
      throw new Error(`${at}.search must be a boolean`)
    }
    if (shadow.worker !== undefined) {
      if (typeof shadow.worker !== 'object' || shadow.worker === null) throw new Error(`${at}.worker must be an object`)
      if (typeof shadow.worker.model !== 'string' || shadow.worker.model === '') {
        throw new Error(`${at}.worker.model must be a non-empty string`)
      }
      if (!EFFORTS.includes(shadow.worker.reasoningEffort)) {
        throw new Error(`${at}.worker.reasoningEffort must be one of ${EFFORTS.join('/')}`)
      }
    }
  }
}

function textOf(messages) {
  let out = ''
  for (const message of messages) {
    for (const block of message.content ?? []) {
      if (block.type === 'text') out += block.text
    }
  }
  return out
}

/** 内联 delegationDepthOf:主对话为 0,子智能体 ≥ 1(header 为单调下限)。 */
function delegationDepth(agent) {
  const runtime = agent?.options?.subagentDepth ?? 0
  const header = agent?.session?.header?.delegationDepth ?? 0
  return Math.max(header, runtime)
}

/** 识别 persona:范围判断 + 结构化输出约定。无 worker 的影子直接产出最终闪念。 */
function recognitionPersona(shadow) {
  const withWorker = shadow.worker !== undefined
  return [
    `你是「外脑对话」的识别影子「${shadow.label ?? shadow.id}」。`,
    `任务范围:${shadow.task}`,
    '你的上下文里已有与主对话相同的历史,最后一条用户消息是这一轮要判断的内容。',
    '判断这轮是否需要你出手:完全在任务范围内才算「需要」,拿不准就是不需要。',
    '无论判断结果如何,都要调用 structured_output 工具给出结论:',
    '不需要 → {"relevant": false, "brief": ""}',
    withWorker
      ? '需要 → {"relevant": true, "brief": "写一句工作要点(要查什么、盯什么),交给干活影子执行"}'
      : '需要 → {"relevant": true, "brief": "直接给出最终「闪念」:一句第一人称、口语化的观察(20~50 字),像脑子里刚闪过的念头"}',
    '除调用工具外不要输出任何其他内容。',
  ].join('\n')
}

/** 干活 persona:把工作要点(+可选搜索结果)措辞成一句第一人称闪念。 */
function workerPersona(shadow) {
  return [
    `你是「外脑对话」的干活影子「${shadow.label ?? shadow.id}」。`,
    `任务范围:${shadow.task}`,
    '用户消息里是识别影子给出的工作要点,可能附带搜索结果。',
    '产出一句简短、第一人称、口语化的「闪念」(20~50 字),像说话人刚查完、刚看过后脑子里闪过的念头,把最关键的一两个信息自然带出来。',
    '只输出这一句话本身,不要标题、不要解释、不要 Markdown、不要链接、不要引用代码。',
  ].join('\n')
}

/** 可选日志:优先注入的 logger 服务,组合里没有时退回 console(便于本地排查)。 */
function warn(ctx, message) {
  const logger = typeof ctx.get === 'function' ? ctx.get('logger') : undefined
  if (logger?.warn) logger.warn(message)
  else console.warn(message)
}

/** 剥掉模型可能自带的【闪念】前缀,统一由注入端加前缀;再按上限截断。 */
function normalizeThought(text) {
  let out = String(text ?? '').trim()
  out = out.replace(/^【闪念】/, '').replace(/^「闪念」/, '').trim()
  return out.slice(0, MAX_THOUGHT_LENGTH)
}

function thoughtText(result) {
  return (result.output ?? [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** 第一人称闪念注入:非唤醒的 next-step 上下文,主对话下一轮自然带出。 */
function injectThought(agent, thought) {
  if (thought === '') return
  agent.inject({
    id: crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: `【闪念】${thought}` }],
    source: { kind: 'plugin', plugin: 'waibrain-orchestrator', form: 'notice', summary: '后台闪念' },
  })
}

/** fork 一个识别影子并读回结构化判断;任何异常只记日志,该影子视为「无关」。 */
async function recognize(ctx, agent, userText, signal, shadow) {
  try {
    const run = await ctx.subagents.start('fork', {
      label: `${shadow.label ?? shadow.id}·识别`,
      prompt: [{ type: 'text', text: `这一轮的用户消息:\n${userText}` }],
      parent: agent,
      agentOptions: { provider: PROVIDER, model: shadow.model, reasoningEffort: shadow.reasoningEffort },
      persona: recognitionPersona(shadow),
      outputSchema: VERDICT_SCHEMA,
      signal,
    })
    try {
      const result = await run.result
      const verdict = result?.structured
      if (verdict === null || typeof verdict !== 'object') return { shadow, verdict: undefined }
      return {
        shadow,
        verdict: {
          relevant: verdict.relevant === true,
          brief: typeof verdict.brief === 'string' ? verdict.brief : '',
        },
      }
    } finally {
      await run.dispose()
    }
  } catch (error) {
    warn(ctx, `waibrain-orchestrator: ${shadow.id}: ${error?.message ?? error}`)
    return { shadow, error }
  }
}

/** 命中一个影子:可选先搜索,再派干活影子(或直接产出),结果注入闪念。 */
async function handleHit(ctx, agent, userText, signal, shadow, brief) {
  try {
    let facts = ''
    if (shadow.search === true) {
      try {
        const searched = await ctx.web.search({ query: userText, maxResults: 5 })
        facts = [
          searched.content ?? '',
          ...(searched.sources ?? []).map(source => `${source.title ?? ''} ${source.snippet ?? ''}`.trim()).filter(Boolean),
        ].join('\n').slice(0, MAX_FACTS_LENGTH)
      } catch (error) {
        warn(ctx, `waibrain-orchestrator: ${shadow.id}: search failed: ${error?.message ?? error}`)
      }
    }
    if (shadow.worker === undefined) {
      injectThought(agent, normalizeThought(brief))
      return
    }
    const run = await ctx.subagents.start('fork', {
      label: `${shadow.label ?? shadow.id}·干活`,
      prompt: [{ type: 'text', text: `工作要点:\n${brief}${facts === '' ? '' : `\n搜索结果:\n${facts}`}` }],
      parent: agent,
      agentOptions: { provider: PROVIDER, model: shadow.worker.model, reasoningEffort: shadow.worker.reasoningEffort },
      persona: workerPersona(shadow),
      signal,
    })
    try {
      const result = await run.result
      injectThought(agent, normalizeThought(thoughtText(result)))
    } finally {
      await run.dispose()
    }
  } catch (error) {
    warn(ctx, `waibrain-orchestrator: ${shadow.id}: ${error?.message ?? error}`)
  }
}

/**
 * 一轮编排:并行 fork N 个识别影子,等全部判断完再并行派干活影子。
 * 全程 void,绝不阻塞主对话;主轮次中止信号传播到所有影子。
 */
async function orchestrateRound(ctx, agent, userText, parentSignal, shadows) {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (parentSignal.aborted) controller.abort()
  else parentSignal.addEventListener('abort', onAbort, { once: true })
  try {
    const recognitions = await Promise.all(
      shadows.map(shadow => recognize(ctx, agent, userText, controller.signal, shadow)),
    )
    const hits = recognitions.filter(entry => entry.error === undefined && entry.verdict?.relevant === true)
    await Promise.all(hits.map(({ shadow, verdict }) => (
      handleHit(ctx, agent, userText, controller.signal, shadow, verdict.brief.trim())
    )))
  } catch (error) {
    warn(ctx, `waibrain-orchestrator: ${error?.message ?? error}`)
  } finally {
    parentSignal.removeEventListener('abort', onAbort)
  }
}

export function apply(ctx, config) {
  validateConfig(config)
  const shadows = config.shadows
  // 主对话零工具:藏掉宿主全局的工具(识别影子在子作用域仍能注册 structured_output)。
  ctx.tools.restrict({ deny: DENIED_TOOLS })

  ctx.on('agent/pre-step', async (payload, next) => {
    const { agent, messages, step, signal } = payload
    const decision = await next()

    // 只编排主对话(depth 0),忽略子智能体自己的 turn,避免递归触发。
    if (delegationDepth(agent) > 0) return decision
    if (step !== 1 || decision.kind !== 'enter') return decision

    const userText = textOf(messages.filter(message => message.source?.kind === 'user'))
    if (userText.trim() === '') return decision

    void orchestrateRound(ctx, agent, userText, signal, shadows)
    return decision
  })
}
