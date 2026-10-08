// 캐시 알약의 계산만 — 화면도 $ 도 모른다. cache.ts(keepwarm 모듈)와 register.tsx(계기판)가 같이 쓴다.
// 가격·시간 표기는 cache-tax 2.2.1(Karan Bansal, MIT — ../LICENSE-cache-tax)에서 왔다.

export const TTL_MS = 60 * 60 * 1000

// $ per million tokens, [cache read, 1h cache write, output], list prices September 2026.
// Longer family names first: a model id matches the first row it contains.
const PRICES: Array<[string, number, number, number]> = [
  ['fable-5-1', 0.25, 20, 50],
  ['fable-5', 1, 20, 50],
  ['opus-5', 0.5, 10, 25],
  ['opus-4', 0.5, 10, 25],
  ['sonnet-5', 0.2, 4, 10],
  ['sonnet', 0.3, 6, 15],
  ['haiku', 0.1, 2, 5],
]

export type PingRecord = { at: number; read: number; write: number; usd: number | null; warm: boolean }

/** keepwarm 모듈이 계기판에 넘기는 몫($.state board.cache). 시각에 따라 바뀌는 글자는 그릴 때 viewOf 가 만든다. */
export type CacheSnap = {
  deadline: number
  every: number
  lastRequestAt: number
  lastModel: string | null
  ctx: number
  compacted: boolean
  last: PingRecord | null
  stopped: string | null
}

export function priceOf(model: string | null): [number, number, number] | null {
  const m = (model ?? '').toLowerCase().replace(/[\s.]+/g, '-')
  for (const [family, read, write, output] of PRICES) if (m.includes(family)) return [read, write, output]
  return null
}

export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m` // 1h 45m — 남은 시간(⟲)과 같이 띄운다
}

export function fmtUsd(usd: number | null): string {
  return usd == null ? '알 수 없음' : '$' + (usd >= 100 ? usd.toFixed(0) : usd.toFixed(2))
}

export function fmtTok(n: number): string {
  return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n)
}

export function coldUsd(s: CacheSnap): number | null {
  const price = priceOf(s.lastModel)
  return price ? s.ctx * price[1] / 1e6 : null
}

export function isCold(s: CacheSnap, now: number): boolean {
  return s.lastRequestAt > 0 && !s.compacted && now - s.lastRequestAt >= TTL_MS
}

/** 계기판의 캐시 알약 한 칸: 색 이름과 글자. 보여 줄 게 없으면 null. */
export type CacheView = { tone: 'warm' | 'cold' | 'unknown' | 'stopped'; head: string; body: string }
export function viewOf(s: CacheSnap, now: number): CacheView | null {
  const keep = s.deadline && now < s.deadline ? ` · keepwarm ${fmtDuration(s.deadline - now)}` : ''
  if (s.stopped) return { tone: 'stopped', head: '⏸ keepwarm 멈춤', body: s.stopped }
  if (s.compacted) return { tone: 'unknown', head: '☕ 캐시', body: `압축 뒤 첫 턴 기다림${keep}` }
  if (!s.lastRequestAt) return keep ? { tone: 'unknown', head: '☕ 캐시', body: `첫 턴 기다림${keep}` } : null
  if (isCold(s, now)) return { tone: 'cold', head: '🧊 캐시 식음', body: `다음 요청이 ${fmtTok(s.ctx)} 다시 씀 ≈${fmtUsd(coldUsd(s))}${keep}` }
  const ping = keep ? ` · 핑 ${fmtDuration(s.lastRequestAt + s.every - now)} 뒤` : ''
  const last = keep && s.last ? ` · 지난 핑 ${fmtUsd(s.last.usd)}` : ''
  return { tone: 'warm', head: '☕ 캐시', body: `${fmtDuration(s.lastRequestAt + TTL_MS - now)} 남음${keep}${ping}${last}` }
}
