import { expect, test } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { moveSelection, overlayRows, type Row } from '../src/client/session-list-rows.ts'

interface FixtureSession {
  id: string
  displayTitle: string
  running?: boolean
  origin?: string
}

function list(sessions: readonly FixtureSession[]) {
  const ids = sessions.map(session => session.id as SessionId)
  const byId = Object.fromEntries(sessions.map(session => [session.id, {
    id: session.id as SessionId, displayTitle: session.displayTitle, running: session.running ?? false,
    blank: false, updatedAt: 0, retainedBy: {}, origin: session.origin,
  }]))
  return { ids, byId, phase: 'ready' as const, projectionsBySession: {} } as unknown as SessionListState
}

test('rows follow Host order and skip subagent rows', () => {
  const rows = overlayRows(list([
    { id: 'a', displayTitle: '规划' },
    { id: 'b', displayTitle: '子任务', origin: 'subagent' },
    { id: 'c', displayTitle: 'Debug', running: true },
  ]), 'a' as SessionId)
  expect(rows.map(row => row.id)).toEqual(['a', 'c'])
  expect(rows[0]?.current).toBe(true)
  expect(rows[1]?.running).toBe(true)
})

test('selection moves with wrap-around in both directions', () => {
  const rows: Row[] = [{ id: 'a' as SessionId, title: 'A', running: false, current: false },
    { id: 'b' as SessionId, title: 'B', running: false, current: false },
    { id: 'c' as SessionId, title: 'C', running: false, current: false }]
  expect(moveSelection(rows, -1, 1)).toBe(0)
  expect(moveSelection(rows, 0, 1)).toBe(1)
  expect(moveSelection(rows, 2, 1)).toBe(0)
  expect(moveSelection(rows, 0, -1)).toBe(2)
  expect(moveSelection(rows, 1, -1)).toBe(0)
})

test('an empty list keeps the selection absent', () => {
  expect(moveSelection([], 0, 1)).toBe(-1)
  expect(moveSelection([], -1, -1)).toBe(-1)
})
