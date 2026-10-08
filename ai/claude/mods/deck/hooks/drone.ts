// 계기판 오른쪽 끝의 탑뷰 쿼드콥터 — 픽셀을 도형(로터 원판·팔·몸통)으로 찍고 반 칸 블록(▀▄)으로 그린다.
// 1칸 = 가로 1px · 세로 2px. 23칸 × 8줄(16px). $ 를 안 쓴다: 상태·프레임·등급을 받아 줄마다 글자 덩어리를 돌려준다.

export const DRONE_COLS = 23
const W = 23
const H = 16
const R = 3 // 로터 반지름

const P = {
  disc: '#32302f', ring: '#504945', blade: '#bdae93', hub: '#ebdbb2',
  arm: '#665c54', body: '#3c3836', edge: '#7c6f64',
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
  const px: Px = Array.from({ length: H }, () => Array<string | null>(W).fill(null))
  const set = (x: number, y: number, c: string) => {
    const X = Math.round(x), Y = Math.round(y)
    if (Y >= 0 && Y < H && X >= 0 && X < W) px[Y]![X] = c
  }
  const cx = (W - 1) / 2, cy = (H - 1) / 2
  const rotors: [number, number][] = [[R, R], [W - 1 - R, R], [R, H - 1 - R], [W - 1 - R, H - 1 - R]]
  // 팔: 2px 두께로 로터 축에서 몸통까지
  for (const [x0, y0] of rotors) {
    for (let i = 0; i <= 60; i++) {
      const x = x0 + ((cx - x0) * i) / 60, y = y0 + ((cy - y0) * i) / 60
      set(x, y, P.arm)
      set(x + 1, y, P.arm)
    }
  }
  // 날개: ARMED 는 프레임마다 45°, HOVER·DAMAGED·LOW BAT 은 두 프레임에 45°, RTB 는 멈춤. 대각 로터끼리 반대로 돈다.
  const step = state === 'ARMED' ? frame : state === 'RTB' ? 0 : Math.floor(frame / 2)
  rotors.forEach(([x0, y0], i) => {
    for (let y = -R; y <= R; y++)
      for (let x = -R; x <= R; x++) {
        const d = Math.hypot(x, y)
        if (d <= R + 0.3) set(x0 + x, y0 + y, d > R - 0.8 ? P.ring : P.disc)
      }
    const a = (step * Math.PI) / 4 * (i === 0 || i === 3 ? 1 : -1) + (i === 0 || i === 3 ? 0 : Math.PI / 2)
    for (let t = -R + 0.5; t <= R - 0.5; t += 0.25) set(x0 + Math.cos(a) * t, y0 + Math.sin(a) * t, state === 'RTB' ? P.edge : P.blade)
    set(x0, y0, P.hub)
  })
  // 몸통: 앞(위)이 좁은 육각, 등급 띠, 카메라(앞), 항법등(앞 양옆), 상태등(뒤)
  const bw = 3, bh = 4
  for (let y = -bh; y <= bh; y++) {
    const half = bw - (y < -bh + 2 ? -bh + 2 - y : 0)
    for (let x = -half; x <= half; x++) set(cx + x, cy + y, Math.abs(x) === half ? P.edge : P.body)
  }
  for (let x = -bw + 1; x <= bw - 1; x++) set(cx + x, cy + 1, grade.stripe)
  const blink = frame % 2 === 0
  set(cx, cy - bh + 1, state === 'ARMED' ? P.red : P.cam)
  set(cx, cy - bh + 2, P.lens)
  const nav = state === 'RTB' ? [P.dim, P.dim] : state === 'DAMAGED' ? [blink ? P.red : P.body, blink ? P.red : P.body] : [blink ? P.red : P.body, blink ? P.green : P.body]
  set(cx - bw - 1, cy - bh + 2, nav[0]!)
  set(cx + bw + 1, cy - bh + 2, nav[1]!)
  const tail = state === 'ARMED' ? P.amber : state === 'DAMAGED' ? (blink ? P.red : P.body) : state === 'LOW BAT' ? (blink ? P.amber : P.body) : P.edge
  set(cx, cy + bh - 1, tail)
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
