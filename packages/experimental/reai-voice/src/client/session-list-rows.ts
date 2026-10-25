/** Pure session-list row derivation and keyboard selection for the overlay. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'

/** One selectable row as the overlay renders it. */
export interface Row {
  id: SessionId
  title: string
  running: boolean
  current: boolean
}

/** Rows in Host list order; subagent rows stay with the workspace browser. */
export function overlayRows(list: SessionListState, currentSessionId: SessionId | undefined): Row[] {
  return list.ids.map(id => list.byId[id]).filter((row): row is NonNullable<typeof row> => row !== undefined && row.origin !== 'subagent')
    .map(row => ({ id: row.id, title: row.displayTitle, running: row.running, current: row.id === currentSessionId }))
}

/** Move one step with wrap-around; -1 keeps the selection when rows disappear. */
export function moveSelection(rows: readonly Row[], selected: number, delta: 1 | -1): number {
  if (rows.length === 0) return -1
  if (selected < 0) return delta === 1 ? 0 : rows.length - 1
  return (selected + delta + rows.length) % rows.length
}
