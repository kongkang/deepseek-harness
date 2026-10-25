/** Keyboard-first conversation picker rendered in its own overlay root. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { Button, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './SessionListOverlay.module.css'
import { moveSelection, overlayRows } from './session-list-rows.ts'

/** How the overlay reaches navigation without a Cordis Context. */
export interface SessionListOverlayActions {
  openSession(id: SessionId): void
  startSession(): void
}

export interface SessionListOverlayProps {
  open: boolean
  sessions: ObservableSnapshot<SessionListState>
  currentSessionId: SessionId | undefined
  actions: SessionListOverlayActions
  labels: Readonly<{ title: string; empty: string; hint: string; running: string; open: string; newSession: string }>
  onClose(): void
}

/** Full overlay list: ↑ ↓ move, Enter opens, Escape closes, click opens. */
export function SessionListOverlay({ open, sessions, currentSessionId, actions, labels, onClose }: SessionListOverlayProps) {
  const snapshot = useObservable(sessions)
  const rows = useMemo(() => overlayRows(snapshot, currentSessionId), [snapshot, currentSessionId])
  const [selected, setSelected] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    setSelected(rows.findIndex(row => row.current))
  }, [open, rows])
  useEffect(() => {
    if (!open) return
    const node = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]')
    node?.scrollIntoView({ block: 'nearest' })
  }, [open, selected])
  const openSelected = useCallback((id: SessionId) => {
    onClose()
    actions.openSession(id)
  }, [actions, onClose])
  if (!open) return null
  return createPortal(
    <div className={css.backdrop} data-reai-session-overlay="" onClick={onClose}>
      <div className={css.panel} role="dialog" aria-modal="true" aria-label={labels.title}
        ref={(node) => { node?.focus() }}
        onClick={(event) => { event.stopPropagation() }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setSelected(value => moveSelection(rows, value, 1)) }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(value => moveSelection(rows, value, -1)) }
          else if (event.key === 'Enter') {
            const target = selected >= 0 ? rows[selected] : rows.find(row => row.current) ?? rows[0]
            if (target) { event.preventDefault(); openSelected(target.id) }
          } else if (event.key === 'Escape') { event.preventDefault(); onClose() }
        }}>
        <div className={css.header}>
          <span className={css.title}>{labels.title}</span>
          <Button size="sm" onClick={() => { onClose(); actions.startSession() }}>
            <IconPlusOutlineRegular size={14} />{labels.newSession}
          </Button>
        </div>
        <div className={css.list} ref={listRef} role="listbox">
          {rows.length === 0 ? <div className={css.empty}>{labels.empty}</div> : rows.map((row, index) =>
            <button type="button" key={row.id} role="option" aria-selected={index === selected}
              data-selected={index === selected} data-current={row.current || undefined}
              className={css.row} title={labels.open}
              onMouseEnter={() => { setSelected(index) }}
              onClick={() => { openSelected(row.id) }}>
              <span className={css.rowTitle}>{row.title}</span>
              {row.running && <span className={css.running}>{labels.running}</span>}
            </button>)}
        </div>
        <div className={css.hint}>{labels.hint}</div>
      </div>
    </div>, document.body)
}

function useObservable<T>(observable: ObservableSnapshot<T>): T {
  const [value, setValue] = useState(observable.getSnapshot)
  useEffect(() => observable.subscribe(() => { setValue(observable.getSnapshot()) }), [observable])
  return value
}
