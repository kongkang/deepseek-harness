/**
 * 外脑对话 1+N 编排插件(import-free 版本)。
 *
 * 1 个前台对话人格(flash 关思考,零工具)+ N 个数据驱动的子代理:
 * - 每轮主对话第一步,编排器并行 fork N 个子代理(配置 = 本插件行的 config.shadows);
 * - 每个子代理收到与主对话相同的用户消息,按自己的职责人设独立给出答案(各答各的);
 * - 只有主对话的回复直接对用户可见;子代理答案合并后以第一人称回灌主对话,
 *   主对话唤醒式自动接一轮,自然说出结果;
 * - 子代理输出「无」或空文本视为没有值得说的,编排器丢弃,不打扰主对话;
 * - 编排在 agent 之外,确定性;任何子代理错误只记日志,不阻塞主对话。
 *
 * 用户自建预设的相对路径插件必须「零 import」:从 ~/.dsh 出发 Node ESM resolver
 * 看不到仓库 TypeScript 源码,且 .ts 会触发 require/esm 循环。因此本文件用 .mjs、
 * 不 import 任何包(id 用 globalThis.crypto.randomUUID(),深度判断内联),
 * 子智能体派发全靠注入的服务 ctx.subagents。
 *
 * @module waibrain-orchestrator
 */
export const name = 'waibrain-orchestrator'
export const inject = ['subagents', 'tools']

/** 宿主全局配置里可见的审查工具名:外脑主对话必须零工具,在预设层藏掉它们。 */
const DENIED_TOOLS = ['reviewer_glm', 'reviewer_deepseek']

/** 子代理请求的 provider 路由(配置只声明模型与思考程度,路由固定)。 */
const PROVIDER = 'deepseek-official'
/** 适配器接受的合法思考程度(off/low/high/max)。 */
const EFFORTS = ['off', 'low', 'high', 'max']
/** 子代理答案文本上限(防止长答案淹没主对话)。 */
const MAX_ANSWER_LENGTH = 300
/** 子代理表示「本轮没有值得说的」时输出的短句;编排器丢弃它,不回灌。 */
const NO_ANSWER = '无'

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
    if (shadow.label !== undefined && typeof shadow.label !== 'string') {
      throw new Error(`${at}.label must be a string`)
    }
    if (typeof shadow.task !== 'string' || shadow.task === '') {
      throw new Error(`${at}.task must be a non-empty string`)
    }
    if (typeof shadow.model !== 'string' || shadow.model === '') {
      throw new Error(`${at}.model must be a non-empty string`)
    }
    if (!EFFORTS.includes(shadow.reasoningEffort)) {
      throw new Error(`${at}.reasoningEffort must be one of ${EFFORTS.join('/')}`)
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

/** 子代理 persona:职责 + 同题独立回答 + 第一人称 + 如实交代来源 + 没话说输出「无」。 */
function answerPersona(shadow) {
  return [
    `你是「外脑对话」的子代理「${shadow.label ?? shadow.id}」。`,
    `职责范围:${shadow.task}`,
    '你收到的用户消息,与主对话收到的完全相同。',
    '按你的职责独立判断这一轮有没有值得说的答案:',
    '有 → 直接给出你的答案:第一人称、口语化、简洁(20~200 字),把最关键的一两个信息说清楚;如实交代来源,用「我查了一下/我看了下」这类说法,不要用「我想起来了/我记得」;不知道就如实说不知道,不要编。',
    `没有 → 只输出「${NO_ANSWER}」,不要解释。`,
    '只输出答案本身,不要标题、不要解释、不要 Markdown、不要引用代码。',
  ].join('\n')
}

/** 日志:logger 服务 + console 双写(console 直达网页进程的日志文件,便于远程定位)。 */
function warn(ctx, message) {
  const logger = typeof ctx.get === 'function' ? ctx.get('logger') : undefined
  if (logger?.warn) logger.warn(message)
  console.warn(`[waibrain-orchestrator] ${message}`)
}

/** 答案文本规整:剥前缀、trim、按上限截断;空或「无」返回空串(丢弃)。 */
function normalizeAnswer(text) {
  let out = String(text ?? '').trim()
  out = out
    .replace(/^【闪念】/, '').replace(/^「闪念」/, '')
    .replace(/^【答案】/, '').replace(/^「答案」/, '')
    .trim()
  if (out === NO_ANSWER) return ''
  return out.slice(0, MAX_ANSWER_LENGTH)
}

function answerText(result) {
  return (result.output ?? [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/**
 * 第一人称答案回灌:唤醒主对话(永不阻塞首回复),它自然接一句把内容说出来。
 * 每条答案标注来源子代理,便于界面按子代理对齐展示;主对话人设要求它不向
 * 用户提及来源名称,只说内容本身。
 */
function deliverAnswers(agent, answers) {
  if (answers.length === 0) return
  agent.followup({
    id: crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: answers.map(answer => `【闪念】「${answer.label}」${answer.text}`).join('\n') }],
    source: { kind: 'plugin', plugin: 'waibrain-orchestrator', form: 'notice', summary: '后台子代理答案' },
  })
}

/** fork 一个子代理并读回答案;任何异常只记日志,该子代理视为「无产出」。 */
async function ask(ctx, agent, userText, signal, shadow) {
  try {
    const run = await ctx.subagents.start('fork', {
      label: shadow.label ?? shadow.id,
      prompt: [{ type: 'text', text: userText }],
      parent: agent,
      agentOptions: { provider: PROVIDER, model: shadow.model, reasoningEffort: shadow.reasoningEffort },
      persona: answerPersona(shadow),
      signal,
    })
    try {
      const result = await run.result
      const text = normalizeAnswer(answerText(result))
      return text === '' ? null : { label: shadow.label ?? shadow.id, text }
    } finally {
      await run.dispose()
    }
  } catch (error) {
    warn(ctx, `waibrain-orchestrator: ${shadow.id}: ${error?.message ?? error}`)
    return null
  }
}

/**
 * 一轮编排:并行 fork N 个子代理,收集所有非空答案合并回灌。
 * 全程 void,绝不阻塞主对话;主轮次中止信号传播到所有子代理。
 */
async function orchestrateRound(ctx, agent, userText, parentSignal, shadows) {
  warn(ctx, `round start: ${shadows.length} shadow(s), user="${userText.slice(0, 60)}"`)
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (parentSignal.aborted) controller.abort()
  else parentSignal.addEventListener('abort', onAbort, { once: true })
  try {
    const answers = (await Promise.all(
      shadows.map(shadow => ask(ctx, agent, userText, controller.signal, shadow)),
    )).filter(answer => answer !== null)
    deliverAnswers(agent, answers)
  } catch (error) {
    warn(ctx, `waibrain-orchestrator: ${error?.message ?? error}`)
  } finally {
    parentSignal.removeEventListener('abort', onAbort)
  }
}

export function apply(ctx, config) {
  validateConfig(config)
  const shadows = config.shadows
  // 主对话零工具:藏掉宿主全局的工具(子代理在子作用域同样不注册任何工具)。
  ctx.tools.restrict({ deny: DENIED_TOOLS })
  warn(ctx, 'applied: restrict + pre-step listener registered')

  ctx.on('agent/pre-step', async (payload, next) => {
    const { agent, messages, step, signal } = payload
    const decision = await next()

    // 只编排主对话(depth 0),忽略子代理自己的 turn,避免递归触发。
    if (delegationDepth(agent) > 0) return decision
    if (step !== 1 || decision.kind !== 'enter') return decision

    // 只对真实用户消息编排:回灌的【闪念】来源是插件,不会触发新一轮子代理。
    const userText = textOf(messages.filter(message => message.source?.kind === 'user'))
    if (userText.trim() === '') return decision

    void orchestrateRound(ctx, agent, userText, signal, shadows)
    return decision
  })
}
