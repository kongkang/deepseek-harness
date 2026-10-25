/** Self-owned overlay root: one React tree outside the slot system. */
import type { Context } from '@deepseek-ai/cordis'
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import type { ObservableSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { SessionListOverlay } from './SessionListOverlay.tsx'
import { NS } from './locales.ts'

/** Everything the overlay needs from the mount; no Cordis Context crosses into React. */
export interface OverlayRootOptions {
  readonly open: SnapshotStore<boolean>
  readonly sessions: ObservableSnapshot<SessionListState>
  currentSessionId(): SessionId | undefined
  openSession(id: SessionId): void
  startSession(): void
}

/**
 * Mount the session-list overlay on its own body-level root and keep it in
 * sync with the open flag, the session list, the current Session, and locale.
 * @param ctx - client plugin context for the locale seat.
 * @param options - overlay inputs and navigation callbacks.
 * @returns disposer unmounting the tree and removing the host node.
 */
export function mountOverlayRoot(ctx: Context, options: OverlayRootOptions): () => void {
  const host = document.body
  const node = host.ownerDocument.createElement('div')
  node.id = 'reai-voice-overlay-root'
  host.append(node)
  const root: Root = createRoot(node)
  const t = ctx.locale.bind(NS)
  const render = (): void => {
    root.render(createElement(SessionListOverlay, {
      open: options.open.getSnapshot(),
      sessions: options.sessions,
      currentSessionId: options.currentSessionId(),
      actions: { openSession: options.openSession, startSession: options.startSession },
      labels: {
        title: t('overlay.title'), empty: t('overlay.empty'), hint: t('overlay.hint'),
        running: t('overlay.running'), open: t('overlay.open'), newSession: t('overlay.newSession'),
      },
      onClose: () => { options.open.set(false) },
    }))
  }
  render()
  const stopOpen = options.open.subscribe(render)
  const stopSessions = options.sessions.subscribe(render)
  const stopLocale = ctx.on('locale/change', render)
  return () => {
    stopOpen(); stopSessions(); stopLocale()
    void root.unmount()
    node.remove()
  }
}
