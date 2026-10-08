// 계기판 오른쪽 끝의 노란 슬라임 — 바닥에 앉은 반타원 젤리를 너비·높이·기울기·위치로 그때그때 계산해 21×8 픽셀에 찍는다.
// 21칸 × 4줄. $ 를 안 쓴다: 상태와 시각(ms)을 받아 줄마다 글자 덩어리를 돌려준다.
import { runsOf, type PetState, type Run } from './drone'

export const SLIME_COLS = 21
const W = 21
const H = 8
const GROUND = 7
const HOME = 14 // 서 있는 자리(바닥 가운데)

const C = { O: '#b57614', y: '#fabd2f', s: '#e0a526', h: '#fbf1c7', E: '#282828', c: '#fe8019', tear: '#83a598', z: '#a89984' }
const TRAIL = ['#d79921', '#b57614', '#7c5a1c', '#4a3a22'] // 막 지나간 자국 → 말라 가는 자국

type Eyes = 'open' | 'closed' | 'sad' | 'none'
// cx 바닥 가운데 · a 반폭 · b 높이 · lean 꼭대기가 밀린 칸 · lift 바닥에서 뜬 높이 · look 눈동자 좌우
type Body = { cx: number; a: number; b: number; lean?: number; lift?: number; look?: number; eyes?: Eyes }
type Px = (string | null)[][]

function draw(body: Body | null, trail: [number, number][] = [], dots: [number, number, string][] = []): Px {
  const px: Px = Array.from({ length: H }, () => Array<string | null>(W).fill(null))
  for (const [x, shade] of trail) if (x >= 0 && x < W) px[GROUND]![x] = TRAIL[shade]!
  if (body) {
    const { cx, a, b, lean = 0, lift = 0, look = 0, eyes = 'open' } = body
    const base = GROUND - lift
    const inside = (x: number, y: number) => y <= base && ((x - (cx + (lean * (base - y)) / b)) / a) ** 2 + ((base - y) / b) ** 2 <= 1
    const at = (x: number, y: number) => px[y]?.[x]
    const put = (x: number, y: number, c: string, over: (string | null)[] = [C.y, C.h, C.s]) => {
      if (y >= 0 && y < H && x >= 0 && x < W && over.includes(px[y]![x] ?? null)) px[y]![x] = c
    }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!inside(x + 0.5, y + 0.5)) continue
        const edge = y === base || !inside(x + 1.5, y + 0.5) || !inside(x - 0.5, y + 0.5) || !inside(x + 0.5, y - 0.5)
        px[y]![x] = edge ? C.O : C.y
      }
    // 그늘(아래 왼쪽 안) · 반짝(왼쪽 위)
    for (let x = 1; x < W; x++) if (at(x, base - 1) === C.y && at(x - 1, base - 1) === C.O) px[base - 1]![x] = C.s
    const top = Math.max(0, Math.ceil(base - b + 0.5))
    const hx = Math.round(cx + lean * 0.7 - a * 0.45)
    put(hx, top + 1, C.h, [C.y])
    put(hx, top + 2, C.h, [C.y])
    if (eyes !== 'none' && b >= 2.5) {
      const ey = Math.round(base - b * 0.5) + (eyes === 'sad' ? 1 : 0)
      const mid = cx + (lean * (base - ey)) / b
      for (const dx of [-a * 0.32, a * 0.32]) {
        const ex = Math.round(mid + dx + look)
        if (eyes === 'closed') {
          put(ex, ey, C.O)
          continue
        }
        put(ex, ey, C.E)
        if (b >= 5 && eyes === 'open') put(ex, ey - 1, C.E)
        put(ex - Math.sign(dx), ey + 1, C.c, [C.y])
        if (eyes === 'sad' && dx < 0) put(ex, ey + 1, C.tear)
      }
    }
  }
  for (const [x, y, c] of dots) if (y >= 0 && y < H && x >= 0 && x < W && !px[y]![x]) px[y]![x] = c
  return px
}

const STAND: Body = { cx: HOME, a: 6, b: 7 }
const ease = (t: number) => (1 - Math.cos(Math.PI * t)) / 2

// 쉴 때 한 바퀴: 서서 깜빡 → 왼쪽 힐끔 → 왼쪽으로 사르륵 녹아 흘러 사라짐 → 자국이 마름 → 오른쪽 위에서 뚝 → 철퍼덕 → 뿅.
type Step = { ms: number; px: Px }
const GLIDE: Step[] = (() => {
  const steps: Step[] = [
    { ms: 1200, px: draw(STAND) },
    { ms: 150, px: draw({ ...STAND, eyes: 'closed' }) },
    { ms: 700, px: draw(STAND) },
    { ms: 700, px: draw({ ...STAND, look: -1 }) },
  ]
  const N = 14
  for (let i = 1; i <= N; i++) {
    const t = ease(i / N)
    const cx = HOME - t * 22
    const trail: [number, number][] = []
    for (let x = Math.round(cx + 6); x <= HOME + 4; x++) trail.push([x, Math.min(3, Math.floor((x - (cx + 6)) / 6))])
    steps.push({ ms: 220, px: draw({ cx, a: 6 + t * 2.5, b: 7 - t * 4.5, lean: 1.5 + t * 2, look: -1 }, trail) })
  }
  steps.push(
    { ms: 700, px: draw(null, [[9, 3], [13, 3], [17, 3]]) },
    { ms: 900, px: draw(null) },
    { ms: 120, px: draw({ cx: HOME, a: 4.5, b: 8, lift: 5 }) },
    { ms: 120, px: draw({ cx: HOME, a: 4.5, b: 8, lift: 2 }) },
    { ms: 260, px: draw({ cx: HOME, a: 8, b: 4.5 }) },
    { ms: 200, px: draw({ cx: HOME, a: 5, b: 8 }) },
  )
  return steps
})()
const GLIDE_MS = GLIDE.reduce((n, s) => n + s.ms, 0)

function glideAt(now: number): Px {
  let t = now % GLIDE_MS
  for (const s of GLIDE) {
    if (t < s.ms) return s.px
    t -= s.ms
  }
  return GLIDE[0]!.px
}

// 일하는 중: 0.25초마다 눌림 → 서기 → 콩(뜀) → 서기, 이마에 땀.
const HOP = [
  draw({ cx: HOME, a: 7.5, b: 5 }, [], [[HOME + 5, 2, C.tear]]),
  draw(STAND, [], [[HOME + 6, 0, C.tear]]),
  draw({ cx: HOME, a: 5, b: 7, lift: 1 }, [[HOME - 3, 3], [HOME - 2, 3], [HOME - 1, 3], [HOME, 3], [HOME + 1, 3], [HOME + 2, 3]], [[HOME + 6, 1, C.tear]]),
  draw(STAND, [], [[HOME + 6, 2, C.tear]]),
]
const PUDDLE = (z: boolean) => draw({ cx: HOME, a: 7.5, b: 3, eyes: 'closed' }, [], z ? [[HOME + 6, 2, C.z], [HOME + 7, 1, C.z]] : [[HOME + 6, 3, C.z]])
const SAD = draw({ cx: HOME, a: 6.5, b: 6, eyes: 'sad' })
const TIRED = draw({ cx: HOME, a: 8, b: 4, eyes: 'closed' })

export function slimeRows(state: PetState, now: number): Run[][] {
  if (state === 'ARMED') return runsOf(HOP[Math.floor(now / 250) % HOP.length]!)
  if (state === 'RTB') return runsOf(PUDDLE(Math.floor(now / 1000) % 2 === 0))
  if (state === 'DAMAGED') return runsOf(SAD)
  if (state === 'LOW BAT') return runsOf(TIRED)
  return runsOf(glideAt(now))
}
