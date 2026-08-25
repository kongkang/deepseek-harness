/** Pure model-facing text owned by the WaiBrain Host package. */

import type { WaiBrainAgentConfig } from './types.ts'

/** Complete persona used when the preset is selected outside the WaiBrain product. */
export const NEUTRAL_WAIBRAIN_PERSONA = '你是一个自然、简洁、友善的对话伙伴。请直接回应用户，不调用工具。'

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
    '你只负责自然对话，不调用任何工具。后台外挂外脑的结果会以【闪念】出现；只在有帮助时自然吸收，不解释后台机制，也不要逐字复述。',
  ].filter(Boolean).join('\n\n')
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
