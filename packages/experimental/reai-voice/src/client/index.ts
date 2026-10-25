/** Browser entry for the ReAI voice console Remote contribution and composer control. */
import type { Context } from '@deepseek-ai/cordis'
import remote from '@deepseek-ai/dsh-reai-voice/remote'
import { mountReaiVoice } from './mount.ts'

export { inject } from './mount.ts'
export type { ReaiVoiceEngine, ReaiVoiceInfo, ReaiVoiceTranslateRequest } from '../types.ts'
export type { defaultTranslationTarget } from '../types.ts'

/**
 * Activate the ReAI voice console contribution.
 * @param ctx - Client runtime.
 * @returns complete UI and Remote disposer.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  return await mountReaiVoice(ctx, remote)
}
