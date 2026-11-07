import { expect, test } from 'vitest'
import type { SpeechPreparationState } from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import {
  canCancelPreparation, canStartPreparation, PHASE_SUMMARY_KEYS, preparationTone, prepareLabelKey,
} from '../src/client/preparation.ts'
import { en, zh } from '../src/client/locales.ts'

const state = (phase: SpeechPreparationState['phase']): SpeechPreparationState => phase === 'downloading'
  ? { phase, resource: 'model.onnx', completedBytes: 10, totalBytes: 100 }
  : phase === 'failed' ? { phase, message: 'boom' }
    : phase === 'checking' || phase === 'loading' || phase === 'waking' || phase === 'cancelling'
      ? { phase, startedAt: 0 } : { phase }

test('tone settles only for ready, standby, failed, and the stopped phases', () => {
  expect(preparationTone(state('ready'))).toBe('done')
  expect(preparationTone(state('standby'))).toBe('done')
  expect(preparationTone(state('failed'))).toBe('error')
  expect(preparationTone(state('unprepared'))).toBe('idle')
  expect(preparationTone(state('cancelled'))).toBe('idle')
  for (const phase of ['checking', 'downloading', 'loading', 'waking', 'cancelling'] as const) {
    expect(preparationTone(state(phase))).toBe('ongoing')
  }
})

test('a start is offered only from stopped phases', () => {
  for (const phase of ['unprepared', 'cancelled', 'failed'] as const) expect(canStartPreparation(state(phase))).toBe(true)
  for (const phase of ['checking', 'downloading', 'loading', 'waking', 'ready', 'standby'] as const) {
    expect(canStartPreparation(state(phase))).toBe(false)
  }
  expect(prepareLabelKey(state('unprepared'))).toBe('prep.prepare')
  expect(prepareLabelKey(state('failed'))).toBe('prep.retry')
})

test('cancellation is offered while a Host task can still be stopped', () => {
  for (const phase of ['checking', 'downloading', 'loading'] as const) expect(canCancelPreparation(state(phase))).toBe(true)
  for (const phase of ['waking', 'cancelling', 'ready', 'standby', 'unprepared', 'failed', 'cancelled'] as const) {
    expect(canCancelPreparation(state(phase))).toBe(false)
  }
})

test('every phase summary key is translated in both dictionaries', () => {
  for (const key of Object.values(PHASE_SUMMARY_KEYS)) {
    expect(zh[key].length).toBeGreaterThan(0)
    expect(en[key].length).toBeGreaterThan(0)
  }
})
