// 계기판 오른쪽 끝의 탑뷰 쿼드콥터 — 손으로 찍은 17×10 픽셀 판을 반 칸 블록(▀▄)으로 그린다.
// 1칸 = 가로 1px · 세로 2px → 17칸 × 5줄. $ 를 안 쓴다: 상태·프레임·등급을 받아 줄마다 글자 덩어리를 돌려준다.

export const DRONE_COLS = 17

// r 가드 링 · h 모터 · a 팔 · e 몸통 테 · B 몸통 · C 카메라 · l 렌즈 · N/M 왼·오 항법등 · O 등급 띠 · T 뒤 상태등
const PLATE = [
  '.rrr.........rrr.',
  'r...r.......r...r',
  'r.h.ra.....ar.h.r',
  '.rrr..aeCea..rrr.',
  '......NBlBM......',
  '......eOOOe......',
  '.rrr..aeTea..rrr.',
  'r.h.ra.....ar.h.r',
  'r...r.......r...r',
  '.rrr.........rrr.',
]
const W = 17
const H = 10
// 로터마다 왼쪽 위 모서리, 링 위 점(시계 방향) — 날개 끝 둘이 이 점들을 따라 돈다.
const ROTORS: [number, number][] = [[0, 0], [12, 0], [0, 6], [12, 6]]
const RING: [number, number][] = [[1, 0], [2, 0], [3, 0], [4, 1], [4, 2], [3, 3], [2, 3], [1, 3], [0, 2], [0, 1]]

const P = {
  ring: '#504945', blade: '#d5c4a1', hub: '#a89984', arm: '#665c54', body: '#3c3836', edge: '#7c6f64',
  cam: '#83a598', lens: '#076678', red: '#fb4934', green: '#b8bb26', amber: '#fabd2f', dim: '#504945',
}

export type DroneState = 'ARMED' | 'HOVER' | 'RTB' | 'DAMAGED' | 'LOW BAT'
export type Grade = { name: string; stripe: string }

// 끝낸 턴 수로 등급 — 등급마다 몸통 띠 색이 바뀐다.
export function gradeOf(turns: number): Grade & { next?: number } {
  if (turns >= 300) return { name: 'MK-III', stripe: '#8ec07c' }
  if (turns >= 50) return { name: 'MK-II', stripe: '#fabd2f', next: 300 }
  return { name: 'MK-I', stripe: '#fe8019', next: 50 }
}

// 지금 상태: 도는 중 > 다쳤음(최근 거절·도구 오류) > 배터리(5H 한도) > 캐시 식음 > 호버.
export function stateOf(s: { working: boolean; hurtUntil: number; now: number; fiveHour?: number; cold: boolean }): DroneState {
  if (s.working) return 'ARMED'
  if (s.hurtUntil > s.now) return 'DAMAGED'
  if ((s.fiveHour ?? 0) >= 80) return 'LOW BAT'
  if (s.cold) return 'RTB'
  return 'HOVER'
}

type Px = (string | null)[][]

function pixels(state: DroneState, frame: number, grade: Grade): Px {
  const blink = frame % 2 === 0
  const nav = state === 'RTB' ? [P.dim, P.dim] : state === 'DAMAGED' ? [blink ? P.red : P.body, blink ? P.red : P.body] : [blink ? P.red : P.body, blink ? P.green : P.body]
  const tail = state === 'ARMED' ? P.amber : state === 'DAMAGED' ? (blink ? P.red : P.body) : state === 'LOW BAT' ? (blink ? P.amber : P.body) : P.edge
  const color: Record<string, string> = {
    r: P.ring, h: P.hub, a: P.arm, e: P.edge, B: P.body, l: P.lens, O: grade.stripe,
    C: state === 'ARMED' ? P.red : P.cam, N: nav[0]!, M: nav[1]!, T: tail,
  }
  const px: Px = PLATE.map(row => [...row].map(c => color[c] ?? null))
  // 날개: ARMED 는 프레임마다 한 칸, 쉬는 중은 두 프레임에 한 칸, RTB 는 멈춤. 대각 로터끼리 반대로 돈다.
  const step = state === 'ARMED' ? frame : state === 'RTB' ? 0 : Math.floor(frame / 2)
  ROTORS.forEach(([x0, y0], i) => {
    const at = (((i === 0 || i === 3 ? step : -step) % 5) + 5) % 5
    for (const k of [at, at + 5]) {
      const [x, y] = RING[k]!
      px[y0 + y]![x0 + x] = state === 'RTB' ? P.edge : P.blade
    }
  })
  return px
}

// 줄마다 [글자, 글자색, 바탕색] 덩어리 — 같은 모양이 이어지면 한 덩어리로 묶는다.
export type Run = { text: string; fg?: string; bg?: string }
export function droneRows(state: DroneState, frame: number, grade: Grade): Run[][] {
  const px = pixels(state, frame, grade)
  const rows: Run[][] = []
  for (let y = 0; y < H; y += 2) {
    const runs: Run[] = []
    for (let x = 0; x < W; x++) {
      const t = px[y]![x] ?? null, b = px[y + 1]![x] ?? null
      const cell: Run = t && b ? { text: '▀', fg: t, bg: b } : t ? { text: '▀', fg: t } : b ? { text: '▄', fg: b } : { text: ' ' }
      const last = runs.at(-1)
      if (last && last.fg === cell.fg && last.bg === cell.bg && last.text.at(-1) === cell.text) last.text += cell.text
      else runs.push(cell)
    }
    rows.push(runs)
  }
  return rows
}
