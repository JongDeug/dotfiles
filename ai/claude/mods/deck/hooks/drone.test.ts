import { expect, test } from 'claude-code/testing'
import { cellWidth } from './board'
import { DRONE_COLS, droneRows, stateOf } from './drone'

test('드론은 5줄, 줄마다 17칸 — 덩어리를 이어도 폭이 같다', () => {
  for (const state of ['ARMED', 'HOVER', 'RTB', 'DAMAGED', 'LOW BAT'] as const) {
    const rows = droneRows(state, 3)
    expect(rows.length).toBe(5)
    for (const runs of rows) expect(cellWidth(runs.map(r => r.text).join(''))).toBe(DRONE_COLS)
  }
})

test('빈 칸은 바탕색을 물려받지 않는다', () => {
  for (const runs of droneRows('HOVER', 0)) for (const r of runs) if (r.text.trim() === '') expect(r.bg).toBeUndefined()
})

test('날개: ARMED 는 프레임마다, RTB 는 멈춘다', () => {
  expect(JSON.stringify(droneRows('ARMED', 0))).not.toBe(JSON.stringify(droneRows('ARMED', 1)))
  expect(JSON.stringify(droneRows('RTB', 0))).toBe(JSON.stringify(droneRows('RTB', 1)))
})

test('상태: 일하는 중 > 다침 > 배터리 > 캐시 식음 > 호버', () => {
  const base = { working: false, hurtUntil: 0, now: 100, fiveHour: 10, cold: false }
  expect(stateOf({ ...base, working: true, hurtUntil: 200, cold: true })).toBe('ARMED')
  expect(stateOf({ ...base, hurtUntil: 200, fiveHour: 90 })).toBe('DAMAGED')
  expect(stateOf({ ...base, fiveHour: 85, cold: true })).toBe('LOW BAT')
  expect(stateOf({ ...base, cold: true })).toBe('RTB')
  expect(stateOf(base)).toBe('HOVER')
})

