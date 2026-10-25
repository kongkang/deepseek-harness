/** Console control in the composer toolbar: dictate or translate into the draft. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TokenSpan } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranscriptionRequest } from '@deepseek-ai/dsh-experimental-api-speech-to-text/types'
import type { SpeechSelection, Transcript } from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ReaiVoiceInfo, ReaiVoiceTranslateRequest } from '../types.ts'
import { audioBase64, RecordingError, type Recording as RecordingHandle } from './audio.ts'
import type { SpeechReadiness } from './readiness.ts'
import { Button, IconCloseOutlineRegular, IconGlobeOutlineRegular, IconMicrophoneOutlineRegular, IconStopFillRegular, StateDot, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './VoiceConsole.module.css'
import { NS, type ReaiVoiceKey } from './locales.ts'

/** One console capture mode; translate runs transcription then translation. */
export type VoiceConsoleMode = 'dictate' | 'translate'

/** Host calls injected without exposing a Cordis Context to React. */
export interface VoiceConsoleActions {
  openSettings: () => void
  /** @returns one microphone operation owned by the plugin lifecycle. */
  createRecording: () => RecordingHandle
  transcribe: (request: TranscriptionRequest, signal: AbortSignal) => Promise<RemoteResult<Transcript>>
  translate: (request: ReaiVoiceTranslateRequest, signal: AbortSignal) => Promise<RemoteResult<string>>
}

/** Entry-injected readiness, preferences, and the keyboard-bridge controller. */
export interface VoiceConsoleInjected extends VoiceConsoleActions {
  hooks: {
    speechReadiness: HostObservable<SpeechReadiness>
    engine: HostObservable<ReaiVoiceInfo>
    /** Keyboard bridge owned by the mount; the console registers itself as the current handler. */
    controller: HostObservable<VoiceConsoleBridge>
  }
}

/** Registration face the console offers to global shortcuts for this Session. */
export interface VoiceConsoleBridge {
  /** Bind the live console for a Session; returns its release. */
  register(sessionId: SessionId | undefined, handle: VoiceConsoleHandle): () => void
}

/** What a global shortcut can ask the mounted console to do. */
export interface VoiceConsoleHandle {
  /** Start or finish one capture; a second call finishes it. */
  toggle(mode: VoiceConsoleMode): void
}

/** Composer-owned expansion and draft actions; preferences stay in plugin settings. */
export type VoiceConsoleProps = Pick<PropsRuntime<'conversation.input.activity'>, 'sessionId' | 'inputActions' | 'locked' | 'onActiveChange'>
  & PropsLocale<typeof NS> & InjectFace<VoiceConsoleInjected>

type Phase = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'translating' | 'feedback'
interface ActiveCapture {
  readonly mode: VoiceConsoleMode
  readonly capture: RecordingHandle
  readonly abort: AbortController
  readonly span: TokenSpan
  readonly selection: SpeechSelection
  readonly maxDurationSeconds: number
  readonly maxAudioBytes: number
  phase: 'requesting' | 'recording' | 'transcribing' | 'translating'
  timer?: ReturnType<typeof setTimeout> | undefined
}

async function disposeCapture(capture: RecordingHandle): Promise<void> {
  try { await capture.dispose() } catch (_error) {
    // Tracks stop before AudioContext.close(); a close failure must not hide the capture result.
  }
}

function failureText(failure: unknown, t: (key: ReaiVoiceKey, params?: Record<string, unknown>) => string): string {
  if (failure instanceof RecordingError) {
    if (failure.kind === 'permission') return t('console.permission')
    if (failure.kind === 'empty') return t('console.empty')
    if (failure.kind === 'cancelled') return t('console.cancelled')
    if (failure.kind === 'interrupted') return t('console.interrupted')
    if (failure.kind === 'deviceMissing') return t('console.deviceMissing')
  }
  return t('console.failed', { message: failure instanceof Error ? failure.message : String(failure) })
}

/** Render compact dictation/translate buttons or the expanded capture row. */
export function VoiceConsole({ sessionId, inputActions, locked, onActiveChange, createRecording, transcribe, translate,
  useSpeechReadiness, useEngine, useController, t }: VoiceConsoleProps) {
  const readiness = useSpeechReadiness(value => value), catalog = readiness.catalog
  const engine = useEngine(value => value)
  const controller = useController(value => value)
  const provider = catalog?.providers.find(item => item.id === catalog.selection.providerId)
  const usable = readiness.connected && (provider?.preparation.phase === 'ready' || provider?.preparation.phase === 'standby'
    || provider?.preparation.phase === 'waking')
  const [phase, setPhase] = useState<Phase>('idle'), [message, setMessage] = useState(''), [pending, setPending] = useState('')
  const [pendingIsTranslation, setPendingIsTranslation] = useState(false)
  const [level, setLevel] = useState(0)
  const current = useRef<ActiveCapture>(), generation = useRef(0)
  const expanded = phase !== 'idle'
  useLayoutEffect(() => { onActiveChange(expanded); return () => { onActiveChange(false) } }, [expanded, onActiveChange])

  const cancel = (): void => {
    generation.current++
    const active = current.current
    current.current = undefined
    if (active) { clearTimeout(active.timer); active.abort.abort(); void disposeCapture(active.capture) }
    setPending(''); setMessage(''); setPhase('idle')
  }
  const feedback = (text: string): void => { setMessage(text); setPhase('feedback') }

  const finish = async (): Promise<void> => {
    const active = current.current
    if (!active || active.phase !== 'recording') return
    active.phase = 'transcribing'
    const run = generation.current
    clearTimeout(active.timer); setPhase('transcribing')
    try {
      const audio = await active.capture.stop(active.maxDurationSeconds)
      if (run !== generation.current) return
      if (audio.byteLength > active.maxAudioBytes) { feedback(t('console.tooLarge')); return }
      const result = await transcribe({ audioBase64: audioBase64(audio), ...active.selection }, active.abort.signal)
      if (run !== generation.current) return
      if (!result.ok) { feedback(t('console.failed', { message: result.error.message })); return }
      if (result.value.text === '') { feedback(t('console.empty')); return }
      if (active.mode === 'translate') {
        active.phase = 'translating'
        setPhase('translating')
        const translated = await translate({ text: result.value.text }, active.abort.signal)
        if (run !== generation.current) return
        if (!translated.ok) { setPending(result.value.text); setPendingIsTranslation(false); feedback(t('console.translateFailed')); return }
        insertOrHold(translated.value, active)
      } else insertOrHold(result.value.text, active)
    } catch (failure) {
      if (run === generation.current) feedback(failureText(failure, t))
    } finally { if (run === generation.current) current.current = undefined }
  }

  const insertOrHold = (text: string, active: ActiveCapture): void => {
    if (inputActions.insertText(text, active.span)) { setPhase('idle'); return }
    setPending(text); setPendingIsTranslation(active.mode === 'translate'); feedback(t('console.conflict'))
  }

  const start = async (mode: VoiceConsoleMode): Promise<void> => {
    if (!catalog || !usable || locked || current.current) return
    if (engine.engine === 'cloud') { feedback(t('console.cloudComingSoon')); return }
    const run = ++generation.current
    const active: ActiveCapture = { mode, capture: createRecording(), abort: new AbortController(),
      span: inputActions.captureInsertion(), selection: catalog.selection,
      maxDurationSeconds: catalog.maxDurationSeconds, maxAudioBytes: catalog.maxAudioBytes, phase: 'requesting' }
    current.current = active
    setMessage(''); setPending(''); setPhase('requesting')
    try {
      await active.capture.start((failure) => {
        if (run !== generation.current || current.current !== active || active.phase !== 'requesting' && active.phase !== 'recording') return
        current.current = undefined
        clearTimeout(active.timer); active.abort.abort()
        feedback(failureText(failure, t))
      })
      if (run !== generation.current || current.current !== active) return
      active.phase = 'recording'
      setPhase('recording')
      active.timer = setTimeout(() => { void finish() }, active.maxDurationSeconds * 1000)
    } catch (failure) {
      await disposeCapture(active.capture)
      if (run === generation.current) { current.current = undefined; feedback(failureText(failure, t)) }
    }
  }

  useEffect(() => {
    if (phase !== 'recording') { setLevel(0); return }
    const timer = setInterval(() => { setLevel(current.current?.capture.amplitude() ?? 0) }, 120)
    return () => { clearInterval(timer) }
  }, [phase])

  useEffect(() => {
    setPending(''); setMessage(''); setPhase('idle')
    const blur = (): void => { if (current.current?.phase === 'recording') cancel() }
    const visibility = (): void => {
      if (document.hidden && current.current && current.current.phase !== 'transcribing' && current.current.phase !== 'translating') cancel()
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && current.current) { event.preventDefault(); cancel() }
    }
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility)
    document.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('keydown', escape)
      generation.current++
      const active = current.current
      current.current = undefined
      if (active) { clearTimeout(active.timer); active.abort.abort(); void disposeCapture(active.capture) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset per session like the official console.
  }, [sessionId])

  useLayoutEffect(() => controller.register(sessionId, {
    toggle: (mode) => {
      const active = current.current
      if (active) {
        if (active.phase === 'recording') void finish()
        else if (active.phase === 'requesting') cancel()
        return
      }
      if (phase === 'feedback') { setPhase('idle'); void start(mode); return }
      void start(mode)
    },
  }), [controller, sessionId, phase, usable, locked, engine])

  if (!expanded) return <>
    <Tooltip label={t('console.dictate')} disabled={!usable} side="top" portal>
      <span className={css.triggerAnchor}><Button className={css.trigger} size="sm" disabled={locked}
        aria-label={t('console.dictate')}
        onMouseDown={(event) => { event.preventDefault() }}
        onClick={() => { if (usable) void start('dictate'); else feedback(t('console.unavailable')) }}>
        <IconMicrophoneOutlineRegular size={18} /></Button></span>
    </Tooltip>
    <Tooltip label={t('console.translate')} disabled={!usable} side="top" portal>
      <span className={css.triggerAnchor}><Button className={css.trigger} size="sm" disabled={locked}
        aria-label={t('console.translate')}
        onMouseDown={(event) => { event.preventDefault() }}
        onClick={() => { if (usable) void start('translate'); else feedback(t('console.unavailable')) }}>
        <IconGlobeOutlineRegular size={18} /></Button></span>
    </Tooltip>
  </>
  return <div className={css.captureRow} data-voice-activity={phase}>
    <Button type="button" className={css.roundButton} size="sm" aria-label={t('console.cancel')}
      onClick={cancel}><IconCloseOutlineRegular size={14} /></Button>
    {phase === 'recording'
      ? <span className={css.activityMessage} role="status">
        <span className={css.pulse} style={{ ['--reai-level' as string]: String(Math.min(1, level * 6)) }} aria-hidden />
        {t('console.recording')}
      </span>
      : <span className={css.activityMessage} role="status" title={pending || message}>
        {(phase === 'requesting' || phase === 'transcribing' || phase === 'translating') && <StateDot state="ongoing" />}
        {phase === 'feedback' ? message : t(phase === 'requesting' ? 'console.requesting'
          : phase === 'translating' ? 'console.translating' : 'console.transcribing')}</span>}
    {phase === 'recording' && <Button type="button" className={css.roundButton} size="sm" aria-label={t('console.stop')}
      onClick={() => { void finish() }}><IconStopFillRegular size={14} /></Button>}
    {phase === 'feedback' && (pending
      ? <Button className={css.inlineAction} size="sm" type="button" onClick={() => {
        if (inputActions.insertText(pending, inputActions.captureInsertion())) { setPending(''); setPhase('idle') }
      }}>{pendingIsTranslation ? t('console.insertOriginal') : t('console.insert')}</Button>
      : <Button className={css.roundButton} size="sm" type="button" aria-label={t('console.start')} disabled={!usable || locked}
        onClick={() => { void start('dictate') }}><IconMicrophoneOutlineRegular size={18} /></Button>)}
  </div>
}
