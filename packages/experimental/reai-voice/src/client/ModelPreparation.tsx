/**
 * Local recognizer preparation card: Host-owned phase, download progress, and the controls
 * that start, retry, or cancel it. A rewrite of the official voice-input preparation card
 * inside this bundle; plugins cannot import another plugin's client components.
 */
import { useState } from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  SpeechPreparationOptions, SpeechProviderId, SpeechProviderView,
} from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import {
  canCancelPreparation, canStartPreparation, PHASE_SUMMARY_KEYS, preparationTone, prepareLabelKey,
} from './preparation.ts'
import { NS } from './locales.ts'
import css from './ModelPreparation.module.css'

/** Host calls that own the preparation task; the card never records or transcribes. */
export interface ModelPreparationActions {
  /** @param providerId - selected recognizer. @param options - task-local download source. */
  prepare: (providerId: SpeechProviderId, options?: SpeechPreparationOptions) => Promise<void>
  /** @param providerId - selected recognizer. */
  cancelPreparation: (providerId: SpeechProviderId) => Promise<void>
}

/** Selected recognizer plus the actions that change its prepared resources. */
export type ModelPreparationProps = PropsLocale<typeof NS> & ModelPreparationActions & {
  /** Selected recognizer; undefined while the Host roster is unknown. */
  readonly provider: SpeechProviderView | undefined
  /** Whether the readiness stream is connected; every control requires it. */
  readonly connected: boolean
  /** Readiness transport failure, shown beside an action failure. */
  readonly error?: string | undefined
}

const megabytes = (bytes: number): string => (bytes / 1_000_000).toFixed(1)
const gigabytes = (bytes: number): string => (bytes / 1_000_000_000).toFixed(1)

/**
 * Render one recognizer's preparation state and its explicit controls.
 * @param props - provider view, readiness connection, Host actions, and copy.
 * @returns the preparation card, or a status line while the roster is unknown.
 */
export function ModelPreparation({ provider, connected, error: transportError, prepare, cancelPreparation, t }: ModelPreparationProps) {
  const [source, setSource] = useState('')
  const [failure, setFailure] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const run = async (action: () => Promise<void>): Promise<void> => {
    setFailure('')
    setSubmitting(true)
    try { await action() } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause))
    } finally { setSubmitting(false) }
  }
  if (provider === undefined) {
    return <section className={css.preparation} data-preparation-phase="unknown">
      <p className={css.status} role="status">{t(connected ? 'prep.loadingRoster' : 'prep.reconnecting')}</p>
    </section>
  }
  const state = provider.preparation
  const sources = provider.downloadSources ?? []
  const selectedSource = sources.includes(source) ? source : ''
  const estimate = provider.setupEstimate
  const canStart = canStartPreparation(state)
  const canCancel = canCancelPreparation(state)
  const failureOf = state.phase === 'failed' ? state.download : undefined
  /** A zero total is a provider placeholder, not a measurable download. */
  const total = state.phase === 'downloading' && (state.totalBytes ?? 0) > 0 ? state.totalBytes : undefined
  const summary = state.phase === 'downloading' ? t('prep.downloading', { resource: state.resource })
    : state.phase === 'loading' ? t('prep.loading', { name: provider.name })
      : state.phase === 'failed' ? t('prep.failed', { message: state.message })
        : state.phase === 'unprepared' ? t('prep.unprepared', { name: provider.name })
          : t(PHASE_SUMMARY_KEYS[state.phase])
  const metric = state.phase === 'downloading'
    ? total === undefined ? t('prep.bytesUnknown', { completed: megabytes(state.completedBytes) })
      : t('prep.bytesKnown', {
        completed: megabytes(state.completedBytes), total: megabytes(total),
        percent: String(Math.floor(state.completedBytes / total * 100)),
      })
    : ''
  return <section className={css.preparation} data-preparation-phase={state.phase}>
    <div className={css.header}>
      <StateDot state={preparationTone(state)} size={16} appearance="step" />
      <strong className={css.name}>{provider.name}</strong>
    </div>
    <p className={css.status} role="status">{summary}</p>
    {metric !== '' && <span className={css.metric}>{metric}</span>}
    {state.phase === 'downloading' && total !== undefined && <progress className={css.progress}
      aria-label={t('prep.downloadProgress')} value={state.completedBytes} max={total} />}
    {failureOf !== undefined && <div className={css.failure} role="alert">
      <p>{t(`prep.reason.${failureOf.reason}`)}</p>
      <small className={css.metric}>{t('prep.downloadDetail', { source: failureOf.source })}</small>
    </div>}
    {state.phase === 'unprepared' && estimate !== undefined && <div className={css.estimate}>
      <p>{t('prep.estimateIntro')}</p>
      <dl>
        <div><dt>{t('prep.disk')}</dt><dd>{t('prep.diskValue', { gb: gigabytes(estimate.recommendedDiskBytes) })}</dd></div>
        <div><dt>{t('prep.memory')}</dt><dd>{t('prep.memoryValue', { gb: gigabytes(estimate.expectedMemoryBytes) })}</dd></div>
        <div><dt>{t('prep.time')}</dt><dd>{t('prep.timeValue', {
          min: String(estimate.minimumMinutes), max: String(estimate.maximumMinutes),
        })}</dd></div>
      </dl>
    </div>}
    {canStart && sources.length > 0 && <label className={css.source}>
      <span>{t('prep.source')}</span>
      <select value={selectedSource} disabled={!connected || submitting}
        onChange={(event) => { setSource(event.target.value) }}>
        {sources.length > 1 && <option value="">{t('prep.sourceAuto')}</option>}
        {sources.map(origin => <option key={origin} value={origin}>
          {origin === 'https://huggingface.co' ? t('prep.sourceHuggingFace')
            : origin === 'https://hf-mirror.com' ? t('prep.sourceMirror') : origin}
        </option>)}
      </select></label>}
    <div className={css.actions}>
      {canStart && <Button variant="primary" size="sm" disabled={!connected || submitting}
        onClick={() => {
          void run(() => selectedSource === '' ? prepare(provider.id) : prepare(provider.id, { downloadSource: selectedSource }))
        }}>{t(prepareLabelKey(state))}</Button>}
      {canCancel && <Button variant="ghost" size="sm" disabled={!connected || submitting}
        onClick={() => { void run(() => cancelPreparation(provider.id)) }}>{t('prep.cancel')}</Button>}
    </div>
    {transportError !== undefined && transportError !== '' && <p className={css.error} role="alert">
      {t('prep.disconnected')}</p>}
    {failure !== '' && <p className={css.error} role="alert">{t('prep.actionFailed', { message: failure })}</p>}
  </section>
}
