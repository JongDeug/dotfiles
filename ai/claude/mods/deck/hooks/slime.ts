// 계기판 오른쪽 끝의 노란 슬라임 — 바닥에 앉은 반타원 젤리를 너비·높이·기울기·위치로 그때그때 계산해 21×8 픽셀에 찍는다.
// 21칸 × 4줄. $ 를 안 쓴다: 상태와 시각(ms)을 받아 줄마다 글자 덩어리를 돌려준다.
import { runsOf, type PetState, type Run } from './drone'
import { C, mix } from './theme'

export const SLIME_COLS = 21
const W = 21
const H = 8
const GROUND = 7
const HOME = 14 // 서 있는 자리(바닥 가운데)

// 테마 색에서: 몸은 테마의 노랑, 테두리·그늘은 노랑을 어둡게, 반짝은 밝게. 눈은 밝은 테마에서도 보이게 어두운 쪽 글자색.
const colors = () => {
  const y = C.yellow
  return {
    O: mix(y, '#000000', 0.32), y, s: mix(y, '#000000', 0.1), h: mix(y, '#ffffff', 0.65),
    E: C.light ? C.text : C.base, c: C.peach, tear: C.blue, z: C.sub,
    // 막 지나간 자국 → 말라 가는 자국(바탕 쪽으로 바랜다)
    trail: [mix(y, '#000000', 0.15), mix(y, '#000000', 0.32), mix(y, C.base, 0.55), mix(y, C.base, 0.78)],
  }
}
let K = colors()

type Eyes = 'open' | 'closed' | 'sad' | 'none'
// cx 바닥 가운데 · a 반폭 · b 높이 · lean 꼭대기가 밀린 칸 · lift 바닥에서 뜬 높이 · look 눈동자 좌우
type Body = { cx: number; a: number; b: number; lean?: number; lift?: number; look?: number; eyes?: Eyes }
type Px = (string | null)[][]

function draw(body: Body | null, trail: [number, number][] = [], dots: [number, number, string][] = []): Px {
  const px: Px = Array.from({ length: H }, () => Array<string | null>(W).fill(null))
  for (const [x, shade] of trail) if (x >= 0 && x < W) px[GROUND]![x] = K.trail[shade]!
  if (body) {
    const { cx, a, b, lean = 0, lift = 0, look = 0, eyes = 'open' } = body
    const base = GROUND - lift
    const inside = (x: number, y: number) => y <= base && ((x - (cx + (lean * (base - y)) / b)) / a) ** 2 + ((base - y) / b) ** 2 <= 1
    const at = (x: number, y: number) => px[y]?.[x]
    const put = (x: number, y: number, c: string, over: (string | null)[] = [K.y, K.h, K.s]) => {
      if (y >= 0 && y < H && x >= 0 && x < W && over.includes(px[y]![x] ?? null)) px[y]![x] = c
    }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!inside(x + 0.5, y + 0.5)) continue
        const edge = y === base || !inside(x + 1.5, y + 0.5) || !inside(x - 0.5, y + 0.5) || !inside(x + 0.5, y - 0.5)
        px[y]![x] = edge ? K.O : K.y
      }
    // 그늘(아래 왼쪽 안) · 반짝(왼쪽 위)
    for (let x = 1; x < W; x++) if (at(x, base - 1) === K.y && at(x - 1, base - 1) === K.O) px[base - 1]![x] = K.s
    const top = Math.max(0, Math.ceil(base - b + 0.5))
    const hx = Math.round(cx + lean * 0.7 - a * 0.45)
    put(hx, top + 1, K.h, [K.y])
    put(hx, top + 2, K.h, [K.y])
    if (eyes !== 'none' && b >= 2.5) {
      const ey = Math.round(base - b * 0.5) + (eyes === 'sad' ? 1 : 0)
      const mid = cx + (lean * (base - ey)) / b
      for (const dx of [-a * 0.32, a * 0.32]) {
        const ex = Math.round(mid + dx + look)
        if (eyes === 'closed') {
          put(ex, ey, K.O)
          continue
        }
        put(ex, ey, K.E)
        if (b >= 5 && eyes === 'open') put(ex, ey - 1, K.E)
        put(ex + Math.sign(dx), ey + 1, K.c, [K.y]) // 볼: 눈 아래 바깥쪽(안쪽이면 코처럼 보인다)
        if (eyes === 'sad' && dx < 0) put(ex, ey + 1, K.tear)
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
function build() {
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


  // 일하는 중: 0.25초마다 눌림 → 서기 → 콩(뜀) → 서기, 이마에 땀.
  const HOP = [
    draw({ cx: HOME, a: 7.5, b: 5 }, [], [[HOME + 5, 2, K.tear]]),
    draw(STAND, [], [[HOME + 6, 0, K.tear]]),
    draw({ cx: HOME, a: 5, b: 7, lift: 1 }, [[HOME - 3, 3], [HOME - 2, 3], [HOME - 1, 3], [HOME, 3], [HOME + 1, 3], [HOME + 2, 3]], [[HOME + 6, 1, K.tear]]),
    draw(STAND, [], [[HOME + 6, 2, K.tear]]),
  ]
  const PUDDLE = (z: boolean) => draw({ cx: HOME, a: 7.5, b: 3, eyes: 'closed' }, [], z ? [[HOME + 6, 2, K.z], [HOME + 7, 1, K.z]] : [[HOME + 6, 3, K.z]])
  const SAD = draw({ cx: HOME, a: 6.5, b: 6, eyes: 'sad' })
  const TIRED = draw({ cx: HOME, a: 8, b: 4, eyes: 'closed' })
  return { GLIDE, GLIDE_MS, HOP, PUDDLE: [PUDDLE(false), PUDDLE(true)], SAD, TIRED }
}

// 테마가 바뀌면 색을 다시 받아 프레임을 새로 만든다.
let built: { name: string; f: ReturnType<typeof build> } | null = null
function frames() {
  if (built?.name !== C.name) {
    K = colors()
    built = { name: C.name, f: build() }
  }
  return built.f
}

export function slimeRows(state: PetState, now: number): Run[][] {
  const f = frames()
  if (state === 'ARMED') return runsOf(f.HOP[Math.floor(now / 250) % f.HOP.length]!)
  if (state === 'RTB') return runsOf(f.PUDDLE[Math.floor(now / 1000) % 2]!)
  if (state === 'DAMAGED') return runsOf(f.SAD)
  if (state === 'LOW BAT') return runsOf(f.TIRED)
  let t = now % f.GLIDE_MS
  for (const step of f.GLIDE) {
    if (t < step.ms) return runsOf(step.px)
    t -= step.ms
  }
  return runsOf(f.GLIDE[0]!.px)
}
