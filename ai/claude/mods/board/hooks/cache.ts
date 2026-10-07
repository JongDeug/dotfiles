// 프롬프트 캐시 keepwarm 과 식은 채 보내기 경고 — 문구와 계산(순수 함수). 타이머·핑·훅은 register.tsx 에 있다
// (한 플러그인은 훅 모듈이 하나이고, $ 는 import 한 함수로 넘길 수 없다).
// cache-tax 2.2.1(Karan Bansal, MIT — ../LICENSE-cache-tax)을 가져와 board 에 합쳤다. 동작은 원본 그대로이고,
// 바뀐 것은 셋: 입력창 위 줄을 직접 그리지 않고 board 의 캐시 알약이 viewOf 로 그린다, 문구가 한국어다,
// 상태 명령이 /cache-tax 가 아니라 /cache 다.
import { coldUsd, fmtDuration, fmtTok, fmtUsd, isCold, priceOf, TTL_MS, type CacheSnap, type PingRecord } from './cacheview'

export { fmtDuration }

export const PING_AFTER_MS = 50 * 60 * 1000
export const MIN_PING_MS = 60 * 1000
export const AUTO_WARM_MS = 3 * 60 * 60 * 1000
export const DEFAULT_WINDOW_MS = 6 * 60 * 60 * 1000
export const BIG_TOKENS = 50000
export const PING_PROMPT = 'Reply with the single word: warm'
export const KEY_DEADLINE = 'deadline'
export const KEY_EVERY = 'every'
export const KEY_GUARD = 'guard'
export const KEY_ALWAYS = 'always'

export type Miss = { at: number; tokens: number; usd: number | null }
export type GuardMode = 'refuse' | 'warn'

export type State = CacheSnap & {
  hasBand: boolean
  sid: string
  always: boolean
  guard: GuardMode
  ackedAt: number
  coldWritePending: boolean
  misses: Miss[]
  pending: { cancel: () => void } | null
}

export function parseDuration(text: string): number | null {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?$/.exec(text.trim())
  if (!m || (m[1] === undefined && m[2] === undefined)) return null
  return (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 * 1000
}

export function warmUsd(s: State): number | null {
  const price = priceOf(s.lastModel)
  return price ? s.ctx * price[0] / 1e6 : null
}

/** Everything a fork bills: the cache read, any cache write, uncached input at the base rate (half the 1h write rate), and the output. */
export function pingUsd(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }, price: [number, number, number]): number {
  return (u.cache_read_input_tokens * price[0] + u.cache_creation_input_tokens * price[1] + u.input_tokens * price[1] / 2 + u.output_tokens * price[2]) / 1e6
}

/** The read-only upper bound: pings at the cache-read rate that cost as much as one cold write of the same context. */
export function breakEvenPings(s: State): number | null {
  const price = priceOf(s.lastModel)
  if (!price || s.ctx <= 0) return null
  return Math.floor(price[1] / price[0])
}

export function guardText(s: State, now: number): string {
  const price = priceOf(s.lastModel)
  const rate = price ? `$${price[1]}/MTok` : '캐시 쓰기 단가'
  const warm = warmUsd(s)
  return `프롬프트 캐시가 ${fmtDuration(now - s.lastRequestAt - TTL_MS)} 전에 식었다. 이대로 보내면 ` +
    `최대 ${s.ctx.toLocaleString('en-US')}토큰을 ${rate}에 다시 쓴다 = ${fmtUsd(coldUsd(s))}` +
    (warm == null ? '' : ` (데워져 있었으면 ${fmtUsd(warm)})`) + '.'
}

export type ResumeFields = {
  source: string
  model?: string
  context_tokens?: number
  seconds_since_last_response?: number
  prompt_cache_likely_expired?: boolean
  estimated_cache_write_usd?: number
}

/** /clear starts a new conversation in the same process; nothing priced before it still exists. */
export function resetForClear(s: State) {
  s.ctx = 0
  s.lastRequestAt = 0
  s.compacted = false
  s.ackedAt = 0
  s.coldWritePending = false
  s.misses = []
  disarm(s)
}

/** Applies a resumed session's fields to the state; returns the line to log, if any. */
export function seedFromResume(s: State, e: ResumeFields, now: number): string | null {
  if (e.source !== 'resume' && e.source !== 'fork') return null
  if (typeof e.context_tokens === 'number' && e.context_tokens > 0) s.ctx = e.context_tokens
  if (typeof e.seconds_since_last_response === 'number') s.lastRequestAt = now - e.seconds_since_last_response * 1000
  if (typeof e.model === 'string') s.lastModel = e.model
  s.compacted = false
  if (e.prompt_cache_likely_expired !== true || s.ctx < BIG_TOKENS) return null
  const usd = typeof e.estimated_cache_write_usd === 'number' ? fmtUsd(e.estimated_cache_write_usd) : fmtUsd(coldUsd(s))
  return `식은 채로 이어 왔다. 첫 메시지가 ${s.ctx.toLocaleString('en-US')}토큰을 다시 쓴다, 약 ${usd}. 결론만 필요하면 /clear 하고 요약을 붙여 넣자.`
}

export function statusText(s: State, now: number): string | undefined {
  if (s.stopped) return `keepwarm 멈춤: ${s.stopped}`
  if (!s.deadline) return undefined
  const pingText = s.last ? ` · 지난 핑 ${fmtTok(s.last.read)} 읽음 ${fmtUsd(s.last.usd)}` : ''
  const nextText = !s.lastRequestAt ? ' · 첫 턴 기다림'
    : s.compacted ? ' · 압축 뒤 첫 턴 기다림'
    : isCold(s, now) ? ` · 지금 식음, 다음 턴 ${fmtDuration(s.every)} 뒤 첫 핑`
    : ` · 핑 ${fmtDuration(s.lastRequestAt + s.every - now)} 뒤`
  return `keepwarm ${fmtDuration(s.deadline - now)} 남음${nextText}${pingText}`
}

export function disarm(s: State) {
  if (s.pending) s.pending.cancel()
  s.pending = null
}

// The window and its ping period belong to the session that armed them, so a
// second session, or one resumed from another transcript, never inherits them
// and cannot turn them off. The always switch and the guard mode stay global.
export function deadlineKey(s: State): string {
  return `${KEY_DEADLINE}:${s.sid}`
}

export function everyKey(s: State): string {
  return `${KEY_EVERY}:${s.sid}`
}

/** The reply to an arming command; on a cold cache it says when the first ping can come. */
export function armedText(s: State, now: number, windowMs: number): string {
  if (isCold(s, now)) return `keepwarm ${fmtDuration(windowMs)} 켬. 지금은 캐시가 식어서 다음 턴 ${fmtDuration(s.every)} 뒤에 첫 핑이 간다`
  return `keepwarm ${fmtDuration(windowMs)} 켬. 쉴 때마다 ${fmtDuration(s.every)} 뒤 핑을 보내 캐시를 다시 쓰지 않고 읽게 한다`
}

export function card(s: State, now: number): string {
  const lines: string[] = []
  lines.push(`${s.lastModel ?? '아직 본 모델 없음'}`)
  if (s.compacted) lines.push('상태       압축으로 초기화됨, 첫 턴 기다림')
  else if (!s.lastRequestAt) lines.push('상태       이 세션엔 아직 요청 없음')
  else if (isCold(s, now)) lines.push(`상태       식음, 마지막 요청 ${fmtDuration(now - s.lastRequestAt)} 전`)
  else lines.push(`상태       데워짐, ${fmtDuration(s.lastRequestAt + TTL_MS - now)} 남음`)
  lines.push(`컨텍스트   ${s.ctx.toLocaleString('en-US')}토큰`)
  lines.push(`식은 비용  다시 쓰면 ${fmtUsd(coldUsd(s))} (데워진 턴 ${fmtUsd(warmUsd(s))})`)
  const always = s.always ? ' (항상)' : ''
  const idle = s.always ? '꺼짐, 다음 세션 시작 때 6h00m 켜짐 (항상)' : '꺼짐 (/keepwarm 하면 6h00m 켜짐)'
  lines.push(`keepwarm   ${s.deadline ? (statusText(s, now) ?? '').replace(/^keepwarm /, '켬, ') + always : s.stopped ? `멈춤, ${s.stopped}${always}` : idle}`)
  const pings = breakEvenPings(s)
  if (pings != null) lines.push(`손익분기   읽기 단가 핑 ${pings}번 = 식은 쓰기 1번, 핑 ${fmtDuration(s.every)} 간격이면 쉬는 시간 약 ${fmtDuration(pings * s.every)}`)
  lines.push(`가드       ${s.guard === 'refuse' ? '한 번 막기 (/cache guard warn 이면 가격만 보여 줌)' : '경고만 (/cache guard refuse 면 한 번 막음)'}`)
  const paid = s.misses.reduce((a, m) => a + (m.usd ?? 0), 0)
  lines.push(`이 세션    식은 쓰기 ${s.misses.length}번, ${fmtUsd(paid)}`)
  return lines.join('\n')
}

export function freshState(): State {
  return {
    hasBand: false, sid: '', deadline: 0, every: PING_AFTER_MS, always: false, lastRequestAt: 0, lastModel: null, ctx: 0, compacted: false,
    guard: 'refuse', ackedAt: 0, coldWritePending: false, misses: [], pending: null, last: null, stopped: null,
  }
}

