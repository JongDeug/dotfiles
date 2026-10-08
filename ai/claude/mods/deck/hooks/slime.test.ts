import { expect, test } from 'claude-code/testing'
import { cellWidth } from './board'
import { stateOf } from './pet'
import { SLIME_COLS, slimeRows } from './slime'
import { C, setTheme } from './theme'

test('슬라임은 4줄, 줄마다 21칸 — 어느 상태·어느 때든', () => {
  for (const state of ['work', 'idle', 'cold', 'hurt', 'tired'] as const)
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
    const rows = slimeRows('idle', now)
    shots.add(JSON.stringify(rows))
    if (rows.every(runs => runs.every(r => !r.fg || r.fg === '#4a3a22' || r.fg === '#7c5a1c'))) empty = true
  }
  expect(shots.size).toBeGreaterThan(15)
  expect(empty).toBe(true)
})

test('테마가 바뀌면 슬라임 색도 그 테마의 노랑으로', () => {
  setTheme('catppuccin')
  const fg = slimeRows('idle', 0).flat().map(r => r.fg)
  expect(fg).toContain(C.yellow)
  setTheme('gruvbox')
})

test('상태: 일하는 중 > 다침 > 지침 > 캐시 식음 > 쉬는 중', () => {
  const base = { working: false, hurtUntil: 0, now: 100, fiveHour: 10, cold: false }
  expect(stateOf({ ...base, working: true, hurtUntil: 200, cold: true })).toBe('work')
  expect(stateOf({ ...base, hurtUntil: 200, fiveHour: 90 })).toBe('hurt')
  expect(stateOf({ ...base, fiveHour: 85, cold: true })).toBe('tired')
  expect(stateOf({ ...base, cold: true })).toBe('cold')
  expect(stateOf(base)).toBe('idle')
})
