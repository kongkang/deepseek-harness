/** Pure model-facing text owned by the WaiBrain Host package. */

import type { WaiBrainAgentConfig, WaiBrainExternalBrain } from './types.ts'

/** Complete persona used when the preset is selected outside the WaiBrain product. */
export const NEUTRAL_WAIBRAIN_PERSONA = '你是一个自然、简洁、友善的对话伙伴。请直接回应用户，不调用工具。'

/**
 * The exact text a main conversation replies with to mean "nothing worth saying".
 *
 * The voice layer reads it as silence, and the browser projection drops it, so a
 * brain feed never forces the dialogue to speak.
 */
export const NO_TALKING_MARKER = '<noTalking>'

/**
 * The tools an external brain may use.
 *
 * A brain is where looking things up happens: the main conversation is the
 * expression layer and stays zero-tool, so a question about current facts is
 * only answerable if a brain can go and check.
 */
export const BRAIN_TOOLS = ['web_search', 'web_fetch']

/**
 * The default operating rules for a main conversation, as user-visible text.
 *
 * These are shown in the editor and may be replaced by the user: they are the
 * dialogue's default prompt, not hidden machinery. The text is concrete about
 * the three things a main conversation gets wrong on its own — treating an
 * injected thought as the user's words, finishing the whole answer before its
 * background brains have said anything, and letting consecutive utterances read
 * as separate speakers.
 */
export const DEFAULT_EXCHANGE_RULES = [
  '你只负责自然对话，不调用任何工具。',
  '',
  '你是这段对话的表达层。真正的思考由外挂外脑并行完成，你负责把它们的想法组织成一段自然、连贯的话。',
  '你不解决实际问题，你让表达顺畅。',
  '',
  '外挂外脑的结论会陆续以【闪念】送进这段对话，先后顺序不固定。',
  '关于【闪念】：',
  '- 它来自你自己的外挂外脑，不是用户说的话。用户从来没有发过【闪念】里的内容。',
  '- 不要把【闪念】当成用户的提问、要求或反驳去回应，也不要问用户为什么发这些。',
  '- 不要向用户提起【闪念】、外挂外脑或这套机制。用户看不到它们。',
  '',
  '怎么说话：',
  '- 先接住话。第一句给一个起手式，让用户知道你在回应，同时为后面的补充留出空间——不要一次把话说完。',
  '- 每一句都要接住上一句。说完一个意思，如果后台还在查，就明说你在等它：',
  '  「稍等，我帮你查一下」「我看看明天什么天」「我去核一下再说」。',
  '  不要说完一句就停住，让下一句凭空跳出来。',
  '- 【闪念】到达时，从你上一句的落点接着说，用「查了一下」「我问了下」这类话把两段缝上，',
  '  让整段表达像一个人连续说下来的。',
  '- 后台没查到时，也接一句「没查着」或「查不到准的」，不要假装没问过就换话题。',
  '- 不要用反问句，也不要为了衔接而向用户提问。用户听不出那是衔接，只会觉得你在追问。',
  '- 不要解释你在做什么机制，也不要逐字复述【闪念】。',
  '',
  '什么时候不说话：',
  `- 这一轮没有值得让用户听到的新内容时，只回复 ${NO_TALKING_MARKER}，不要带任何其他文字。`,
].join('\n')

/**
 * Whether one external-brain answer is tool-call syntax rather than prose.
 *
 * A brain that reaches for a tool it does not have writes the call into its
 * answer instead. Such an answer is unusable as a late thought and must not
 * reach the main conversation, where it reads as gibberish the user supposedly
 * sent and derails the reply.
 *
 * The tag markers vary by model and arrive mangled, so the attribute form is
 * matched independently of whatever tag prefix it came with.
 * @param text - The extracted external-brain answer text.
 * @returns True when the text contains a tool-call marker.
 */
export function looksLikeToolCall(text: string): boolean {
  return /<\/?(?:tool_calls|tool_call|function_calls|invoke|parameter)\b/i.test(text)
    || /\b(?:invoke|parameter)\s+name\s*=/i.test(text)
}

/**
 * The current round's external-brain roster, as the main conversation sees it.
 *
 * Stating the roster in the prompt is what lets the dialogue open with a lead-in
 * instead of finishing everything: it knows how many thoughts are still coming
 * and what each one is about, without a tool call that would delay first audio.
 * @param brains - Enabled external brains frozen for this round.
 * @returns One roster paragraph, or the no-brain variant.
 */
export function buildBrainRoster(brains: readonly WaiBrainExternalBrain[]): string {
  if (brains.length === 0) return '本轮没有启用外挂外脑，你独立完成这次回应。'
  return [
    `本轮有 ${String(brains.length)} 个外挂外脑在并行思考，它们各自的关注点：`,
    ...brains.map(brain => `- ${brain.label}：${brain.direction.length > 0 ? brain.direction : '（未填写职责）'}`),
  ].join('\n')
}

/**
 * Render the complete main persona from one immutable Agent revision.
 * @param config - Frozen Agent configuration admitted for the current round.
 * @returns Complete zero-tool main persona text.
 */
export function buildWaiBrainPersona(config: WaiBrainAgentConfig): string {
  const { role } = config
  return [
    `你是「${role.name}」。`,
    role.tagline.length > 0 ? `定位：${role.tagline}` : '',
    role.personality.length > 0 ? `性格：${role.personality}` : '',
    role.voice.length > 0 ? `表达方式：${role.voice}` : '',
    role.scenario.length > 0 ? `相处情境：${role.scenario}` : '',
    role.greeting.length > 0 ? `初次招呼：${role.greeting}` : '',
    role.examples.length > 0 ? `对话示例：\n${role.examples}` : '',
    role.systemPrompt,
    // A record written before this field existed carries no value.
    role.exchangeRules !== undefined && role.exchangeRules.length > 0
      ? role.exchangeRules
      : DEFAULT_EXCHANGE_RULES,
    buildBrainRoster(config.externalBrains.filter(brain => brain.enabled)),
  ].filter(Boolean).join('\n\n')
}

/**
 * The persona of one external brain.
 *
 * A brain is a sub-conversation, not a second main: it thinks from its own
 * stance and returns a conclusion. Without this it inherits the main
 * conversation's framing and answers as though it were the one speaking to the
 * user, which is what made its output read as advice about how to phrase things.
 * @param brain - The external brain this persona belongs to.
 * @returns Complete brain persona text.
 */
export function buildBrainPersona(brain: WaiBrainExternalBrain): string {
  return [
    brain.persona,
    `你是「${brain.label}」，主对话的一个外挂外脑。你不是主对话本身，用户看不到你。`,
    `你的立场：${brain.direction.length > 0 ? brain.direction : '按你自己的判断给出结论'}`,
    '',
    '你只看得到下面给出的这一小段上下文。你看不到完整对话历史，也不需要——',
    '你只需要针对当前这一段，给出你的判断。',
    '',
    '怎么输出：',
    '- 先自己把问题想透，想多少都行；但只说结果，不要把推演过程写出来。',
    '- 不要列检查清单、不要分点罗列推理步骤、不要告诉主对话该怎么说话。',
    '- 把想法压成几句话的结论（想 1000 字也可以，输出控制在 100 字上下）。',
    '- 直接说你的判断和理由要点，不要复述上下文，不要客套。',
    '',
    '你有联网查询工具：需要当前事实（天气、价格、赛程、新闻、任何你不确定的事）时，',
    '先用它查，再基于查到的东西给结论。不要凭印象说，也不要对用户说你去查一下。',
    '你没有其他工具：不能执行命令、读写文件或调用任何函数。',
    '绝不要输出工具调用语法（例如 <tool_calls>、<invoke>、<parameter> 这类标签）。',
  ].filter(part => part !== '').join('\n')
}

/**
 * Render the context one external brain reasons over.
 *
 * The brain is given the main conversation's most recently completed exchange
 * plus the user's new message, and nothing else. A brain that kept its own prior
 * answers would build on its own earlier framing even after the main declined
 * that framing, so drift compounds round over round; re-deriving from the main
 * conversation each time keeps every brain converging on it instead.
 * @param mainName - The main conversation's display name.
 * @param previousExchange - The main conversation's last completed exchange, or empty on the first round.
 * @param userText - The user message that opened this round.
 * @returns The brain's prompt text.
 */
export function buildBrainContext(
  mainName: string,
  previousExchange: string,
  userText: string,
): string {
  const parts: string[] = []
  if (previousExchange.length > 0) {
    parts.push('【主对话上一轮的往来】', previousExchange)
  } else {
    parts.push('【这是第一轮】主对话还没有历史往来。')
  }
  parts.push('', '【用户刚说的】', userText)
  parts.push('', `以上是「${mainName}」正在处理的对话。从你的立场给出你的结论。`)
  return parts.join('\n')
}

/**
 * Render one external-brain result as a model-visible late thought.
 * @param label - User-authored external-brain label.
 * @param text - Bounded external-brain result text.
 * @returns One late-thought message for the main Agent.
 */
export function buildWaiBrainWake(label: string, text: string): string {
  return `【闪念】「${label}」${text}`
}
