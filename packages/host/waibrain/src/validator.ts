/** Persona validation shared by save admission and Agent composition. */

import { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import type { WaiBrainAgentConfig, WaiBrainInvalidPersonaTemplate } from './types.ts'

/**
 * Validate one user-authored prompt field with the real System Prompt renderer.
 * @param field - Browser field path reported on failure.
 * @param text - User-authored persona text.
 * @returns A typed template rejection, or undefined when rendering succeeds.
 */
export function validatePersonaText(field: string, text: string): WaiBrainInvalidPersonaTemplate | undefined {
  try {
    renderPrompt({
      sections: [{ name: field, text }],
      contexts: [],
      tools: [],
      variables: {},
    })
    return undefined
  } catch {
    return { code: 'invalid-persona-template', field, offset: text.indexOf('{{') }
  }
}

/**
 * Validate every prompt-bearing field in one Agent config.
 * @param config - Complete editable Agent configuration.
 * @returns The first typed field rejection, or undefined when every prompt field is valid.
 */
export function validateAgentPersona(config: WaiBrainAgentConfig): WaiBrainInvalidPersonaTemplate | undefined {
  const roleFields = [
    'name', 'tagline', 'personality', 'voice', 'scenario', 'greeting', 'examples', 'systemPrompt',
  ] as const
  for (const field of roleFields) {
    const failure = validatePersonaText(`role.${field}`, config.role[field])
    if (failure !== undefined) return failure
  }
  for (const [index, brain] of config.externalBrains.entries()) {
    for (const field of ['label', 'direction', 'persona'] as const) {
      const failure = validatePersonaText(`externalBrains[${index}].${field}`, brain[field])
      if (failure !== undefined) return failure
    }
  }
  return undefined
}
