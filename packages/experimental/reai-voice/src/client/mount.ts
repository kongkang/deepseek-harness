/** Source-safe lifecycle for the ReAI voice console Remote and browser UI. */
import type { Context } from '@deepseek-ai/cordis'
import speechRemote from '@deepseek-ai/dsh-experimental-api-speech-to-text/remote'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-experimental-api-speech-to-text/remote'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TranscriptionRequest } from '@deepseek-ai/dsh-experimental-api-speech-to-text/types'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { VoiceConsole, type VoiceConsoleBridge, type VoiceConsoleHandle, type VoiceConsoleMode } from './VoiceConsole.tsx'
import { Recording } from './audio.ts'
import { observeReadiness } from './readiness.ts'
import { SettingsCard } from './SettingsCard.tsx'
import { mountOverlayRoot } from './overlay-root.tsx'
import { installReaiVoiceShortcuts } from './shortcuts.ts'
import { en, NS, zh } from './locales.ts'
import type { ReaiVoiceEngine, ReaiVoiceInfo, ReaiVoiceTranslateRequest } from '../types.ts'

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    /** ReAI voice console focus handoff; released immediately after focus(). */
    reaiVoice: unknown
  }
}

export const inject = ['remote', 'slots', 'locale']

/** The Session currently shown in the main view, if any. */
function currentMainViewSession(ctx: Context): SessionId | undefined {
  return Object.values(ctx.sessions.list.getSnapshot().byId)
    .find(row => (row.retainedBy.mainView ?? 0) > 0)?.id
}

function registerUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }))
  const recordings = new Set<Recording>()
  const readiness = observeReadiness(ctx)
  ctx.effect(() => readiness.dispose)
  ctx.effect(() => async () => { await Promise.all([...recordings].map(recording => recording.dispose())) })

  /** Mirror of the Host engine preference; the settings card is the only writer. */
  const engine = createSnapshotStore<ReaiVoiceInfo>({ engine: 'local', cloudAvailable: false })
  const refreshEngine = (): void => {
    void ctx.remote.reaiVoice.info().then((result) => { if (result.ok) engine.set(result.value) }).catch(() => undefined)
  }
  refreshEngine()

  /** Live console handles so global shortcuts reach the visible Session's control. */
  const handles = new Map<SessionId | undefined, VoiceConsoleHandle>()
  let pendingAction: VoiceConsoleMode | null = null
  const bridgeStore = createSnapshotStore<VoiceConsoleBridge>({
    register: (sessionId, handle) => {
      handles.set(sessionId, handle)
      const pending = pendingAction
      if (pending !== null && sessionId === currentMainViewSession(ctx)) {
        pendingAction = null
        handle.toggle(pending)
      }
      return () => { if (handles.get(sessionId) === handle) handles.delete(sessionId) }
    },
  })

  const overlayOpen = createSnapshotStore(false)
  const focusInput = (): void => {
    if (ctx.layout.panelInfo.getSnapshot().activePanelId !== null) ctx.layout.selectPanel(null)
    const current = currentMainViewSession(ctx)
    if (current === undefined) { ctx.get('uiWorkspace')?.startSession(); return }
    const reference = ctx.sessions.retain(current, { source: 'reaiVoice' })
    try { ctx.conversation.input.for(reference.binding.ctx).focus() } finally { reference.release() }
  }
  const toggleCapture = (mode: VoiceConsoleMode): void => {
    const current = currentMainViewSession(ctx)
    const handle = current === undefined ? undefined : handles.get(current)
    if (handle !== undefined) { handle.toggle(mode); return }
    pendingAction = mode
    focusInput()
  }

  ctx.inject(['shortcuts', 'sessions', 'layout', 'conversation', 'uiWorkspace'], (scope) => {
    installReaiVoiceShortcuts(scope, {
      focusInput,
      toggleDictation: () => { toggleCapture('dictate') },
      voiceTranslate: () => { toggleCapture('translate') },
      toggleList: () => { overlayOpen.set(!overlayOpen.getSnapshot()) },
    })
    scope.effect(() => mountOverlayRoot(scope, {
      open: overlayOpen,
      sessions: scope.sessions.list,
      currentSessionId: () => currentMainViewSession(scope),
      openSession: (id) => { scope.get('uiWorkspace')?.openSession(id) },
      startSession: () => { scope.get('uiWorkspace')?.startSession() },
    }))
  })

  ctx.inject(['configForms'], (scope) => {
    const form = scope.configForms.get<{ engine?: ReaiVoiceEngine }>('reai-voice')
    scope.effect(() => form.subscribe(refreshEngine))
    scope.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
      name: 'plugins.bundle.config', key: '@deepseek-ai/dsh-reai-voice', locale: NS,
      inject: () => ({ hooks: { info: engine }, form }),
    }, SettingsCard)))
  })

  const pluginNavigation = createSnapshotStore(false)
  ctx.inject(['pluginNavigation'], (scope: Context) => {
    scope.effect(() => {
      pluginNavigation.set(true)
      return () => { pluginNavigation.set(false) }
    }, 'reai-voice: plugin navigation presence')
  })

  const actions = {
    openSettings: () => { ctx.get('pluginNavigation')?.openBundle('@deepseek-ai/dsh-reai-voice') },
    createRecording: () => {
      const recording = new Recording(() => { recordings.delete(recording) })
      recordings.add(recording)
      return recording
    },
    transcribe: async (request: TranscriptionRequest, signal: AbortSignal) => await ctx.remote.speech.transcribe(request, signal),
    translate: async (request: ReaiVoiceTranslateRequest, signal: AbortSignal) => await ctx.remote.reaiVoice.translate(request, signal),
  }
  ctx.slots.inject('conversation.input.activity', () => ctx.slots.register({
    name: 'conversation.input.activity', locale: NS,
    inject: () => ({ ...actions, hooks: { speechReadiness: readiness.state, engine, controller: bridgeStore } }),
  }, VoiceConsole))
}

/**
 * Mount the ReAI voice console without adding it to stable API Remotes.
 * @param ctx - Client runtime owning the Remote, dictionaries and slots.
 * @param contribution - generated reaiVoice Remote definitions.
 * @returns disposer joining UI and both Remote withdrawals.
 */
export async function mountReaiVoice(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
  const disposeSpeech = await ctx.remote.$mount(speechRemote)
  let disposeOwn: (() => Promise<void>) | undefined
  try {
    disposeOwn = await ctx.remote.$mount(contribution)
  } catch (error) {
    await disposeSpeech()
    throw error
  }
  const ui = ctx.inject(['remote.reaiVoice', 'remote.speech', 'slots', 'locale'], registerUi)
  try { await ui } catch (error) {
    await ui.dispose().catch(() => undefined)
    await disposeOwn()
    await disposeSpeech()
    throw error
  }
  return async () => { await ui.dispose(); await disposeOwn(); await disposeSpeech() }
}
