import { expect, test } from 'claude-code/testing'
import { cellWidth } from './board'
import { SLIME_COLS, slimeRows } from './slime'

test('슬라임은 4줄, 줄마다 21칸 — 어느 상태·어느 때든', () => {
  for (const state of ['ARMED', 'HOVER', 'RTB', 'DAMAGED', 'LOW BAT'] as const)
    for (let now = 0; now < 12_000; now += 250) {
      const rows = slimeRows(state, now)
      expect(rows.length).toBe(4)
      for (const runs of rows) {
        expect(cellWidth(runs.map(r => r.text).join(''))).toBe(SLIME_COLS)
        for (const r of runs) if (r.text.trim() === '') expect(r.bg).toBeUndefined()
      }
    }
})

test('쉬는 동안 흘러가고(모양이 바뀌고), 사라졌다 돌아온다', () => {
  const shots = new Set<string>()
  let empty = false
  for (let now = 0; now < 12_000; now += 100) {
    const rows = slimeRows('HOVER', now)
    shots.add(JSON.stringify(rows))
    if (rows.every(runs => runs.every(r => !r.fg || r.fg === '#4a3a22' || r.fg === '#7c5a1c'))) empty = true
  }
  expect(shots.size).toBeGreaterThan(15)
  expect(empty).toBe(true)
})
