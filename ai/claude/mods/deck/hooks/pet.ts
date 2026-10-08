// 펫 공용: 지금 상태를 고르고, 픽셀 판을 반 칸 블록 글자로 바꾼다. $ 를 안 쓴다.

// work 일하는 중 · hurt 커밋 검문·도구 오류 뒤 · tired 5H 한도 80% 넘음 · cold 캐시 식음 · idle 쉬는 중
export type PetState = 'work' | 'idle' | 'cold' | 'hurt' | 'tired'

// 앞에 있는 것이 이긴다: 일하는 중 > 다침 > 지침 > 캐시 식음 > 쉬는 중.
export function stateOf(s: { working: boolean; hurtUntil: number; now: number; fiveHour?: number; cold: boolean }): PetState {
  if (s.working) return 'work'
  if (s.hurtUntil > s.now) return 'hurt'
  if ((s.fiveHour ?? 0) >= 80) return 'tired'
  if (s.cold) return 'cold'
  return 'idle'
}

// 줄마다 [글자, 글자색, 바탕색] 덩어리 — 위·아래 픽셀 둘을 반 칸 블록 하나로, 같은 모양이 이어지면 한 덩어리로 묶는다.
export type Run = { text: string; fg?: string; bg?: string }
export function runsOf(px: (string | null)[][]): Run[][] {
  const rows: Run[][] = []
  for (let y = 0; y < px.length; y += 2) {
    const runs: Run[] = []
    for (let x = 0; x < px[y]!.length; x++) {
      const t = px[y]![x] ?? null, b = px[y + 1]?.[x] ?? null
      const cell: Run = t && b ? { text: '▀', fg: t, bg: b } : t ? { text: '▀', fg: t } : b ? { text: '▄', fg: b } : { text: ' ' }
      const last = runs.at(-1)
      if (last && last.fg === cell.fg && last.bg === cell.bg && last.text.at(-1) === cell.text) last.text += cell.text
      else runs.push(cell)
    }
    rows.push(runs)
  }
  return rows
}
