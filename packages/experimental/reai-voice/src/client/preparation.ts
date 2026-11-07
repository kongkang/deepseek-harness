/** Derivation of Host-owned preparation states into the preparation card's visible states. */
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SpeechPreparationState } from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import type { ReaiVoiceKey } from './locales.ts'

/** Phases whose summary needs no interpolation; the rest carry a provider name, resource, or message. */
export const PHASE_SUMMARY_KEYS: Readonly<Record<'checking' | 'waking' | 'cancelling' | 'ready' | 'standby' | 'cancelled',
  ReaiVoiceKey>> = {
  checking: 'prep.checking',
  waking: 'prep.waking',
  cancelling: 'prep.cancelling',
  ready: 'prep.ready',
  standby: 'prep.standby',
  cancelled: 'prep.cancelled',
}

/**
 * Map a phase onto the status dot; only settled phases stop showing activity.
 * @param state - current Host-owned preparation state.
 * @returns the dot state for the card header.
 */
export function preparationTone(state: SpeechPreparationState): StateDotState {
  if (state.phase === 'ready' || state.phase === 'standby') return 'done'
  if (state.phase === 'failed') return 'error'
  if (state.phase === 'unprepared' || state.phase === 'cancelled') return 'idle'
  return 'ongoing'
}

/**
 * Whether the Host accepts a preparation start, including a retry.
 * @param state - current Host-owned preparation state.
 * @returns true when the card offers its start button.
 */
export function canStartPreparation(state: SpeechPreparationState): boolean {
  return state.phase === 'unprepared' || state.phase === 'cancelled' || state.phase === 'failed'
}

/**
 * Whether preparation is cancellable now; waking and cancelling are not.
 * @param state - current Host-owned preparation state.
 * @returns true when the card offers its cancel button.
 */
export function canCancelPreparation(state: SpeechPreparationState): boolean {
  return state.phase === 'checking' || state.phase === 'downloading' || state.phase === 'loading'
}

/**
 * Label the start button for the current phase.
 * @param state - current Host-owned preparation state.
 * @returns the first-attempt or retry key.
 */
export function prepareLabelKey(state: SpeechPreparationState): ReaiVoiceKey {
  return state.phase === 'unprepared' ? 'prep.prepare' : 'prep.retry'
}
