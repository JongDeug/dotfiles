import type { EngineInterface, PromptSubmitInput, RenderElement, PromptSubmitResult, Register, TurnCompleteInput, TurnCompleteResult } from 'claude-code'

import {
  armedText, AUTO_WARM_MS, BIG_TOKENS, card, deadlineKey, DEFAULT_WINDOW_MS, disarm, everyKey, freshState, guardText, KEY_ALWAYS, KEY_DEADLINE, KEY_EVERY, KEY_GUARD,
  MIN_PING_MS, parseDuration, PING_AFTER_MS, PING_PROMPT, pingUsd, resetForClear, seedFromResume, statusText, type State,
} from './cache'
import { fmtDuration, fmtTok, fmtUsd, isCold, priceOf, TTL_MS, viewOf } from './cacheview'
import { ago, barCells, cellWidth, fit, type Fit, ciFromGithub, ciFromGitlab, elapsed, modelName, parseGit, shortPath, sparkline, tokensOf, untilText, type Ci, type Git, type Slice } from './board'

// 입력창 위 두 줄 계기판 — statusline 이 하던 것(모델·경로·브랜치·컨텍스트·비용·사용량 한도)에
// git 변경·CI·지금 도는 작업을 더한다. 윗줄은 "어디서 무엇을", 아랫줄은 "얼마나 남았나".
// 모듈 변수는 리로드 때 비워지고 session.start 는 다시 오지 않는다 — 처음 그릴 때 시작한다.
const C = { base: '#24273a', surface: '#363a4f', overlay: '#494d64', text: '#cad3f5', sub: '#a5adcb', blue: '#8aadf4', green: '#a6da95', red: '#ed8796', yellow: '#eed49f', mauve: '#c6a0f6', peach: '#f5a97f', teal: '#8bd5ca' }
const EDITS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])
const FILES = 'board-files'
const CTX = 'board-context'
const BAR = 24
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

let started = false
let cwd = ''
let home = ''
let effort = ''
let model = ''
let git: Git | null = null
let ci: Ci | null = null
let host: 'github' | 'gitlab' | null = null
const busy = { git: false, ci: false, usage: false }

type Turn = { startedAt: number; tools: number; current: string; agents: number; edits: Set<string> }
let turn: Turn | null = null
let last: { seconds: number; tools: number; edits: number } | null = null

type Usage = {
  tokens: number
  window: number
  percent: number
  slices: Slice[]
  compactAt?: number
  limits: { kind: string; percent: number; resetsAt: number }[]
  usd?: number
  startedAt: number
}
let usage: Usage | null = null
// 턴이 끝날 때마다 컨텍스트 % 를 쌓아 추이(▁▂▃▅)로 보인다.
const history: number[] = []

async function sh($: EngineInterface, argv: string[]): Promise<string> {
  const { exitCode, stdout } = await $.process.run(argv, { cwd, timeoutMs: 15_000 })
  return exitCode === 0 ? stdout.trim() : ''
}

async function guarded($: EngineInterface, key: keyof typeof busy, work: () => Promise<void>): Promise<void> {
  if (busy[key]) return
  busy[key] = true
  try {
    await work()
  } catch {
    // 못 읽은 칸은 그리지 않을 뿐이다.
  } finally {
    busy[key] = false
  }
  $.ui.invalidate('ui.render')
}

const refreshGit = ($: EngineInterface) =>
  guarded($, 'git', async () => {
    const status = await sh($, ['git', 'status', '--porcelain=v2', '--branch'])
    git = status ? parseGit(status, await sh($, ['git', 'diff', '--numstat', 'HEAD'])) : null
  })

const refreshCi = ($: EngineInterface) =>
  guarded($, 'ci', async () => {
    if (!git?.branch) return
    if (host === null) {
      const url = await sh($, ['git', 'remote', 'get-url', 'origin'])
      host = url.includes('github.com') ? 'github' : url.includes('gitlab') ? 'gitlab' : null
    }
    if (host === 'github') ci = ciFromGithub(await sh($, ['gh', 'run', 'list', '-b', git.branch, '-L', '1', '--json', 'status,conclusion,updatedAt,workflowName,url']))
    else if (host === 'gitlab') ci = ciFromGitlab(await sh($, ['glab', 'ci', 'list', '-b', git.branch, '-P', '1', '-F', 'json']))
  })

const refreshUsage = ($: EngineInterface) =>
  guarded($, 'usage', async () => {
    const u = await $.session.usage({ breakdown: 'summary' })
    const c = u.context
    const rows = c.breakdown?.categories ?? []
    const slices = rows.filter(r => r.kind === 'used' && !r.isDeferred).map(r => ({ name: r.name, tokens: r.tokens, color: r.color }))
    const tokens = c.tokens ?? slices.reduce((n, r) => n + r.tokens, 0)
    usage = {
      tokens,
      window: c.window,
      percent: c.percent ?? Math.round((tokens / c.window) * 100),
      slices,
      compactAt: c.breakdown?.autoCompactThreshold,
      limits: u.rateLimits.map(l => ({ kind: l.kind, percent: l.percentUsed, resetsAt: Date.parse(l.resetsAt ?? '') || 0 })),
      usd: u.cost?.usd,
      startedAt: u.startedAt,
    }
    model = modelName(await $.session.model())
    if (history.length === 0) history.push(usage.percent)
  })

async function start($: EngineInterface): Promise<void> {
  if (started) return
  started = true
  await initCache($, 'terminal')
  cwd = await $.session.cwd()
  home = (await $.env.get('HOME')) ?? ''
  // effort 는 훅 모듈에 바로 오지 않는다 — 설정 파일에서 읽는다.
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${home}/.claude`
  effort = (await $.env.get('CLAUDE_EFFORT')) || (await sh($, ['node', '-e', `try{console.log(require(${JSON.stringify(`${dir}/settings.json`)}).effortLevel||'')}catch{}`]))
  await Promise.all([refreshGit($), refreshUsage($)])
  void refreshCi($)
  $.clock.every(10_000, () => void refreshGit($))
  $.clock.every(5_000, () => void refreshUsage($))
  $.clock.every(60_000, () => void refreshCi($))
  // 도는 동안만 스피너를 돌린다.
  $.clock.every(250, () => {
    if (turn) $.ui.invalidate('ui.render')
  })
}

// ── 프롬프트 캐시 keepwarm · 식은 채 보내기 경고 ─────────────────────────────
// cache-tax 2.2.1(Karan Bansal, MIT — ../LICENSE-cache-tax)의 타이머·핑·저장. 동작은 원본 그대로다.
const cache: State = freshState()

function updateStatus($: EngineInterface, s: State, now: number) {
  if (s.hasBand) $.ui.invalidate('ui.render')
  else $.ui.status(statusText(s, now))
}

/** Clears this session's own dead window and the bare keys a store written before 2.1.1 still holds. Other sessions' keys are never touched: a read followed by a delete cannot be made atomic against their renewal. */
async function prune($: EngineInterface, s: State, now: number) {
  for (const key of [KEY_DEADLINE, deadlineKey(s)]) {
    const deadline = await $.store.get(key)
    if (deadline === undefined) continue
    if (typeof deadline === 'number' && deadline > now) continue
    await $.store.delete(key)
    await $.store.delete(KEY_EVERY + key.slice(KEY_DEADLINE.length))
  }
}

async function stop($: EngineInterface, s: State, why: string | null, forgetAlways = false) {
  s.deadline = 0
  s.every = PING_AFTER_MS
  s.stopped = why
  disarm(s)
  await $.store.delete(deadlineKey(s))
  await $.store.delete(everyKey(s))
  if (forgetAlways) {
    s.always = false
    await $.store.delete(KEY_ALWAYS)
  }
  updateStatus($, s, await $.clock.now())
}

async function arm($: EngineInterface, s: State) {
  disarm(s)
  if (!s.deadline) return
  const now = await $.clock.now()
  if (now >= s.deadline) return stop($, s, null)
  // A cold window still needs expiry cleanup, but must not send a model request.
  if (s.lastRequestAt && !s.compacted && !isCold(cache, now)) {
    const untilCold = s.lastRequestAt + TTL_MS - now
    const delay = Math.min(s.deadline - now, untilCold, Math.max(1000, s.lastRequestAt + s.every - now))
    s.pending = $.clock.after(delay, () => { void ping($, s) })
  } else {
    s.pending = $.clock.after(s.deadline - now, () => { void arm($, s) })
  }
  updateStatus($, s, now)
}

async function ping($: EngineInterface, s: State) {
  s.pending = null
  if (!s.deadline) return
  const now = await $.clock.now()
  if (now >= s.deadline) return arm($, s)
  // A turn in the meantime re-armed the timer; this callback is stale.
  if (isCold(cache, now)) return arm($, s)
  if (now - s.lastRequestAt < s.every - 1000) return
  let reply
  try {
    reply = await $.model.fork({ prompt: PING_PROMPT })
  } catch (err) {
    return stop($, s, `핑 실패, ${err instanceof Error ? err.message : String(err)}`)
  }
  if (reply === null) return stop($, s, '엔진이 핑을 보내지 않았다 — 스냅숏이 식었거나 API 호출이 실패했다')
  if (reply.isAnswered === false) {
    const reason = reply.reason === 'nothing-to-fork' ? '아직 데울 대화가 없다'
      : reply.reason === 'api-error' ? `API 호출 실패${reply.status === null ? '' : ` (${reply.status})`}`
      : reply.reason === 'aborted' ? '핑이 중단됐다'
      : '핑 답이 비었다'
    return stop($, s, reason)
  }
  const u = reply.usage
  const price = priceOf(s.lastModel)
  // A warm ping reads the prefix and writes only its own message; a write of a tenth of the read or more means the prefix broke.
  const warm = u.cache_read_input_tokens > 0 && u.cache_creation_input_tokens < 0.1 * u.cache_read_input_tokens
  const usd = price ? pingUsd(u, price) : null
  s.last = { at: now, read: u.cache_read_input_tokens, write: u.cache_creation_input_tokens, usd, warm }
  if (!warm) return stop($, s, `핑이 ${fmtTok(u.cache_read_input_tokens)}을 읽고 ${fmtTok(u.cache_creation_input_tokens)}토큰을 썼다(${fmtUsd(usd)}) — 캐시가 이미 사라졌다`)
  s.lastRequestAt = now
  await arm($, s)
}

async function startWindow($: EngineInterface, s: State, windowMs: number, every: number) {
  const now = await $.clock.now()
  s.every = every
  if (every === PING_AFTER_MS) await $.store.delete(everyKey(s))
  else await $.store.set(everyKey(s), every)
  s.deadline = now + windowMs
  s.stopped = null
  await $.store.set(deadlineKey(s), s.deadline)
  await arm($, s)
}

// 세션 시작 때 하는 일(저장된 keepwarm 복원, 명령 등록). /reload-plugins 뒤엔 session.start 가 다시 오지 않으니
// 계기판이 처음 그려질 때도 부른다 — 한 번만.
let cacheReady = false
async function initCache($: EngineInterface, surface: string | null, fresh = false): Promise<void> {
  // 진짜 session.start 는 매번 새로 읽는다(always 창 다시 켜기 등). 그리기 쪽은 아직 안 했을 때만.
  if (cacheReady && !fresh) return
  cacheReady = true
  cache.hasBand = surface === 'terminal' || surface === 'desktop'
  if (cache.hasBand) $.ui.status(undefined)
  cache.sid = await $.session.id()
  const now = await $.clock.now()
  await prune($, cache, now)
  const saved = await $.store.get(deadlineKey(cache))
  const savedEvery = await $.store.get(everyKey(cache))
  const savedGuard = await $.store.get(KEY_GUARD)
  cache.deadline = typeof saved === 'number' && saved > now ? saved : 0
  cache.every = typeof savedEvery === 'number' && savedEvery >= MIN_PING_MS ? savedEvery : PING_AFTER_MS
  cache.guard = savedGuard === 'warn' ? 'warn' : 'refuse'
  cache.always = (await $.store.get(KEY_ALWAYS)) === true
  // Always means a fresh default window every session, whatever the last one left behind.
  if (cache.always) await startWindow($, cache, DEFAULT_WINDOW_MS, PING_AFTER_MS)
  const usage = await $.session.usage()
  if (usage.context.tokens) cache.ctx = usage.context.tokens
  await $.command.register({
    name: 'keepwarm',
    description: '쉬는 동안 프롬프트 캐시를 데워 둔다: 그냥 치면 6h, 90m 같은 시간, always, off, status',
    argumentHint: '[6h | always | off | status]',
    immediate: true,
  })
  await $.command.register({
    name: 'cache',
    description: '프롬프트 캐시 상태 카드: 식은 비용·keepwarm·이 세션에 낸 식은 쓰기. guard warn|refuse',
    argumentHint: '[status | guard warn | guard refuse]',
    immediate: true,
  })
  // The hook form of cache-tax ships a /cache-tax:status skill; both installed means two guards.
  const commands = await $.command.list()
  if (commands.some(c => c.name === 'cache-tax:status')) {
    $.ui.log('cache-tax 훅 버전(cache-tax@claude-code-hooks)도 깔려 있어서 식은 채 보내기를 두 번 경고하거나 막는다. 그쪽을 지우거나 여기서 /cache guard warn.')
  }
  updateStatus($, cache, now)
}

// The message that pays. Only its first character is read.
async function guardColdSend($: EngineInterface, e: PromptSubmitInput, next: (e: PromptSubmitInput) => Promise<PromptSubmitResult>): Promise<PromptSubmitResult> {
  if (e.origin.kind === 'plugin') return next(e)
  if (typeof e.text !== 'string' || e.text.trimStart().startsWith('/')) return next(e)
  const now = await $.clock.now()
  if (!isCold(cache, now) || cache.ctx < BIG_TOKENS) return next(e)
  if (cache.guard === 'warn') {
    $.ui.log(`${guardText(cache, now)} 그대로 보낸다 — 들어가면 keepwarm 이 ${fmtDuration(AUTO_WARM_MS)} 동안 캐시를 데워 둔다.`)
    cache.coldWritePending = true
    return next(e)
  }
  if (cache.ackedAt === cache.lastRequestAt) {
    cache.ackedAt = 0
    cache.coldWritePending = true
    return next(e)
  }
  cache.ackedAt = cache.lastRequestAt
  return { drop: `cache: ${guardText(cache, now)} 다시 보내면 그 값을 내고 들어가고, 그 뒤 keepwarm 이 ${fmtDuration(AUTO_WARM_MS)} 동안 데워 둔다. 아니면 /clear 하고 메모에서 시작하자.` }
}

async function scoreTurn($: EngineInterface, e: TurnCompleteInput, next: (e: TurnCompleteInput) => Promise<TurnCompleteResult>): Promise<TurnCompleteResult> {
  const r = await next(e)
  if (e.agentId) return r
  const now = await $.clock.now()
  // A sleeping host may deliver this turn before the expired window's timer.
  if (cache.deadline && now >= cache.deadline) await stop($, cache, null)
  // turn.step stamps the exact request time; when no step of this turn did, the turn's end is the floor.
  if (now - cache.lastRequestAt > e.durationMs) cache.lastRequestAt = now
  cache.compacted = false
  cache.ackedAt = 0
  const u = e.usage
  if (u) {
    if (u.model) cache.lastModel = u.model
    const prev = cache.ctx
    // A turn's usage is its responses summed, so a ten-step turn reports ten
    // reads of the context. The live window is the engine's figure; the sum
    // is only the fallback for a host that reports no tokens.
    const write = u.cache_creation_input_tokens
    const live = (await $.session.usage()).context.tokens
    cache.ctx = live && live > 0 ? live : u.input_tokens + u.cache_read_input_tokens + write
    const full = prev > 20000 && write >= 0.5 * prev
    if (full || cache.coldWritePending) {
      const price = priceOf(cache.lastModel)
      const usd = price ? write * price[1] / 1e6 : null
      cache.misses.push({ at: now, tokens: write, usd })
      if (cache.deadline < now + AUTO_WARM_MS) {
        await startWindow($, cache, AUTO_WARM_MS, cache.every)
        $.ui.log(`식은 쓰기 ${fmtTok(write)}토큰 냈다(${fmtUsd(usd)}). 오늘 또 내지 않게 ${fmtDuration(AUTO_WARM_MS)} 동안 캐시를 데워 둔다 — 그만하려면 /keepwarm off.`)
      }
    }
  }
  cache.coldWritePending = false
  await arm($, cache)
  return r
}

const level = (percent: number) => (percent >= 80 ? C.red : percent >= 50 ? C.yellow : C.green)


export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await initCache($, e.surface, true)
    return r
  })

  // Resume fields seed the guard before any turn of the resumed session has run.
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    if (e.source === 'clear') {
      await stop($, cache, null)
      cache.stopped = null
      resetForClear(cache)
      cache.sid = await $.session.id()
      updateStatus($, cache, await $.clock.now())
      return r
    }
    const line = seedFromResume(cache, e, await $.clock.now())
    // The resume payload may omit the model; without it the guard cannot price the cold write.
    if (!cache.lastModel) cache.lastModel = await $.session.model()
    if (line) $.ui.log(line)
    // The seeded clock decides whether a restored or always window pings before the first turn: never when it is cold.
    await arm($, cache)
    return r
  })

  on('command.run', { command: 'keepwarm' }, async ($, e) => {
    const words = String(e.args ?? '').trim().split(/\s+/).filter(Boolean)
    const now = await $.clock.now()
    if (words[0] === 'off') {
      const wasAlways = cache.always
      await stop($, cache, null, true)
      return { text: wasAlways ? 'keepwarm 꺼짐. 세션 시작 때 저절로 켜지지도 않는다' : 'keepwarm 꺼짐' }
    }
    if (words[0] === 'always') {
      cache.always = true
      await $.store.set(KEY_ALWAYS, true)
      await startWindow($, cache, DEFAULT_WINDOW_MS, PING_AFTER_MS)
      const cold = isCold(cache, now) ? `. 지금은 캐시가 식어서 다음 턴 ${fmtDuration(cache.every)} 뒤에 첫 핑이 간다` : ''
      return { text: `keepwarm 항상 켬: 세션마다 ${fmtDuration(DEFAULT_WINDOW_MS)} 창으로 시작한다. /keepwarm off 하면 아주 꺼진다${cold}` }
    }
    if (!words.length) {
      await startWindow($, cache, DEFAULT_WINDOW_MS, PING_AFTER_MS)
      return { text: armedText(cache, now, DEFAULT_WINDOW_MS) }
    }
    if (words[0] !== 'status') {
      const window = parseDuration(words[0] ?? '')
      if (window == null) return { text: 'keepwarm 은 6h · 90m 같은 시간, 또는 always · off · status 를 받는다' }
      // "every 2m" is a testing knob and lasts only for the window it was given with.
      let every = PING_AFTER_MS
      if (words[1] === 'every') {
        const period = parseDuration(words[2] ?? '')
        if (period == null || period < MIN_PING_MS) return { text: 'every 는 1m 이상' }
        every = period
      }
      await startWindow($, cache, window, every)
      return { text: armedText(cache, now, window) }
    }
    return { text: statusText(cache, now) ?? 'keepwarm 꺼짐' }
  })

  on('command.run', { command: 'cache' }, async ($, e) => {
    const words = String(e.args ?? '').trim().split(/\s+/).filter(Boolean)
    const now = await $.clock.now()
    if (words[0] === 'guard') {
      if (words[1] !== 'warn' && words[1] !== 'refuse') return { text: '/cache guard 는 warn 또는 refuse' }
      cache.guard = words[1]
      await $.store.set(KEY_GUARD, cache.guard)
      return { text: cache.guard === 'refuse' ? '가드: 식은 채 보내면 가격을 보여 주고 한 번 막는다. 다시 보내면 간다' : '가드: 식은 채 보내도 가격만 보여 주고 보낸다' }
    }
    return { text: card(cache, now) }
  })


  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) cache.lastRequestAt = await $.clock.now()
    yield* next(e)
  })


  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) {
      cache.compacted = true
      cache.ctx = 0
      cache.ackedAt = 0
      disarm(cache)
      await arm($, cache)
    }
    return r
  })

  on('prompt.submit', async ($, e, next) => {
    const startedAt = await $.clock.now()
    const r = await guardColdSend($, e, next)
    // 식은 캐시 경고가 메시지를 막았으면 턴이 시작되지 않는다 — 스피너를 돌리지 않는다.
    if (r.drop === undefined) {
      turn = { startedAt, tools: 0, current: '생각 중', agents: 0, edits: new Set() }
      $.ui.invalidate('ui.render')
    }
    return r
  }).catch(($, e, next) => next(e)) // 계기판이 깨져도 프롬프트는 막지 않는다

  on('tool.call', async ($, e, next) => {
    const t = turn
    if (t) {
      t.tools += 1
      t.current = e.tool
      if (e.tool === 'Agent') t.agents += 1
      const path = (e as { file_path?: unknown }).file_path ?? (e as { notebook_path?: unknown }).notebook_path
      if (EDITS.has(e.tool) && typeof path === 'string') t.edits.add(path)
      $.ui.invalidate('ui.render')
    }
    try {
      return await next(e)
    } finally {
      if (t && e.tool === 'Agent') t.agents -= 1
      if (e.tool === 'Bash' || EDITS.has(e.tool)) void refreshGit($)
    }
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const r = await scoreTurn($, e, next)
    // 서브에이전트의 턴이 끝난 건 이 대화의 턴이 끝난 게 아니다.
    if (e.agentId) return r
    if (turn) last = { seconds: Math.round(((await $.clock.now()) - turn.startedAt) / 1000), tools: turn.tools, edits: turn.edits.size }
    turn = null
    void refreshGit($)
    void refreshUsage($).then(() => {
      if (usage) history.push(usage.percent)
      if (history.length > 16) history.shift()
    })
    return r
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.surface !== 'terminal' || e.props.hasSurvey) return below
    void start($)
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const pill = (bg: string, fg: string, text: string, bold = true) => <Text backgroundColor={bg} color={fg} bold={bold}>{` ${text} `}</Text>
    const label = (bg: string, text: string) => <Text backgroundColor={bg} color={C.base} bold>{` ${text} `}</Text>

    const cols = Math.max(20, e.props.bodyColumns)
    // 알약 하나 = 그림 + 칸 수 + 중요도(작을수록 끝까지 남는다). 좁으면 fit 이 큰 p 부터 뺀다.
    type Item = Fit & { el: RenderElement }
    const item = (el: RenderElement, text: string, p: number, glue = false): Item => ({ el, w: cellWidth(text), p, glue })
    const pillItem = (bg: string, fg: string, text: string, p: number, opts: { bold?: boolean; glue?: boolean } = {}) =>
      item(pill(bg, fg, text, opts.bold ?? true), ` ${text} `, p, opts.glue)

    // ── 윗줄: 어디서 무엇을 ─────────────────────────────
    const top: Item[] = []
    if (model) {
      top.push(pillItem(C.peach, C.base, `◆ ${model}`, 1))
      if (effort) top.push(pillItem(C.overlay, C.peach, effort, 6, { bold: false, glue: true }))
    }
    if (git) {
      const ab = `${git.ahead ? ` ↑${git.ahead}` : ''}${git.behind ? ` ↓${git.behind}` : ''}`
      top.push(pillItem(C.blue, C.base, `⎇ ${git.branch || '(detached)'}${ab}`, 0))
    }
    if (cwd) top.splice(git ? top.length - 1 : top.length, 0, pillItem(C.surface, C.text, shortPath(cwd, home), 7, { bold: false }))
    if (git) {
      if (git.files.length > 0) {
        const t = [` ● ${git.files.length} `, `+${git.added} `, `−${git.deleted} `]
        top.push(item(
          <Box hover={{ scope: FILES }}>
            <Text backgroundColor={C.surface} color={C.yellow} bold>{t[0]}</Text>
            <Text backgroundColor={C.surface} color={C.green}>{t[1]}</Text>
            <Text backgroundColor={C.surface} color={C.red}>{t[2]}</Text>
          </Box>,
          t.join(''), 3,
        ))
      } else top.push(pillItem(C.surface, C.green, '✓ 깨끗', 8, { bold: false }))
    }
    if (ci) {
      const [bg, mark] = ci.state === 'ok' ? [C.green, '✓'] : ci.state === 'fail' ? [C.red, '✗'] : ci.state === 'run' ? [C.yellow, '⟳'] : [C.surface, '·']
      top.push(pillItem(bg, ci.state === 'other' ? C.sub : C.base, `CI ${mark} ${ci.name}${ci.at ? ` · ${ago(ci.at, now)}` : ''}`, 5))
    }
    let work: Item | null = null
    if (turn) {
      const parts = [`${SPIN[Math.floor(now / 250) % SPIN.length]} ${elapsed(Math.round((now - turn.startedAt) / 1000))}`, turn.current, `도구 ${turn.tools}`]
      if (turn.edits.size) parts.push(`편집 ${turn.edits.size}`)
      if (turn.agents > 0) parts.push(`에이전트 ${turn.agents}`)
      work = pillItem(C.mauve, C.base, parts.join('  '), 2)
    } else if (last) {
      const t = `지난 턴 ${elapsed(last.seconds)} · 도구 ${last.tools}${last.edits ? ` · 편집 ${last.edits}` : ''}`
      work = item(<Text color={C.sub}>{t}</Text>, t, 9)
    }

    // ── 아랫줄: 얼마나 남았나 ───────────────────────────
    const bottom: Item[] = []
    if (usage) {
      const u = usage
      // 좁으면 막대도 줄인다.
      const bar = cols >= 150 ? BAR : cols >= 110 ? 16 : 10
      const cells = barCells(u.slices, u.window, bar)
      const used = cells.reduce((n, c) => n + c.cells, 0)
      // 자동 압축이 시작되는 자리에 눈금.
      const mark = u.compactAt ? Math.min(bar - 1, Math.round((u.compactAt / u.window) * bar)) : -1
      const free = Array.from({ length: Math.max(0, bar - used) }, (_, i) => (used + i === mark ? '┃' : '░')).join('')
      const head = u.percent >= 80 ? 'CTX 압축 임박' : 'CTX'
      const pct = ` ${u.percent}% `
      const tok = ` ${tokensOf(u.tokens)}/${tokensOf(u.window)} `
      const spark = history.length > 1 ? `${sparkline(history)} ` : ''
      bottom.push(item(
        <Box hover={{ scope: CTX }}>
          {label(level(u.percent), head)}
          <Text backgroundColor={C.surface} color={level(u.percent)} bold>{pct}</Text>
          <Text backgroundColor={C.surface}>
            {cells.map(c => <Text color={c.color}>{'█'.repeat(c.cells)}</Text>)}
            <Text color={C.overlay}>{free}</Text>
          </Text>
        </Box>,
        ` ${head} ${pct}${'x'.repeat(bar)}`, 0,
      ))
      bottom.push(item(<Text backgroundColor={C.surface} color={C.sub}>{tok}</Text>, tok, 6, true))
      if (spark) bottom.push(item(<Text backgroundColor={C.surface} color={C.teal}>{spark}</Text>, spark, 9, true))
      u.limits.forEach((l, i) => {
        const name = l.kind === 'five_hour' ? '5H' : l.kind === 'seven_day' ? '7D' : l.kind === 'spend_limit' ? '한도' : l.kind
        const filled = Math.min(8, Math.round((l.percent / 100) * 8))
        const gauge = ` ${'▰'.repeat(filled)}`
        const rest = '▱'.repeat(8 - filled)
        const num = ` ${Math.round(l.percent)}% `
        bottom.push(item(
          <Text>
            {label(level(l.percent), name)}
            <Text backgroundColor={C.surface} color={level(l.percent)}>{gauge}</Text>
            <Text backgroundColor={C.surface} color={C.overlay}>{rest}</Text>
            <Text backgroundColor={C.surface} color={C.text} bold>{num}</Text>
          </Text>,
          ` ${name} ${gauge}${rest}${num}`, i === 0 ? 2 : 4,
        ))
        if (l.resetsAt) {
          const t = `⟲${untilText(l.resetsAt, now)} `
          bottom.push(item(<Text backgroundColor={C.surface} color={C.sub}>{t}</Text>, t, 7, true))
        }
      })
      if (u.usd !== undefined) {
        bottom.push(item(label(C.green, `$${u.usd.toFixed(2)}`), ` $${u.usd.toFixed(2)} `, 5))
        const hours = (now - u.startedAt) / 3_600_000
        if (hours > 0.1) {
          const t = ` 🔥 $${(u.usd / hours).toFixed(1)}/h `
          bottom.push(item(<Text backgroundColor={C.surface} color={C.peach}>{t}</Text>, t, 8, true))
        }
      }
    }
    const cachePill = viewOf(cache, now)
    if (turn) bottom.push(item(label(C.teal, '☕ 캐시 데우는 중'), ' ☕ 캐시 데우는 중 ', 3))
    else if (cachePill) {
      const bg = cachePill.tone === 'warm' ? C.teal : cachePill.tone === 'cold' ? C.red : C.overlay
      const head = ` ${cachePill.head} `
      const body = ` ${cachePill.body} `
      bottom.push(item(<Text backgroundColor={bg} color={cachePill.tone === 'warm' || cachePill.tone === 'cold' ? C.base : C.text} bold>{head}</Text>, head, 3))
      bottom.push(item(<Text backgroundColor={C.surface} color={C.text}>{body}</Text>, body, 6, true))
    }
    if (top.length === 0 && bottom.length === 0) return below

    // 한 줄: 들어가는 알약만, 붙은 것(glue)은 사이 칸 없이. 지금 도는 작업은 오른쪽 끝으로.
    const line = (items: Item[], right: Item | null) => {
      const keep = fit(items, cols)
      const left: RenderElement[] = []
      items.forEach((it, i) => {
        if (!keep[i] || it === right) return
        if (left.length && !it.glue) left.push(<Text> </Text>)
        left.push(it.el)
      })
      return (
        <Box flexDirection="row">
          {left}
          <Box flexGrow={1} />
          {right && keep[items.indexOf(right)] ? right.el : null}
        </Box>
      )
    }

    // ── 포인터를 올리면 위로 펼쳐지는 줄 (띠는 아래가 붙박이라 위로 펼쳐야 알약이 안 움직인다) ──
    const shown = git?.files.slice(0, 8) ?? []
    const files = shown.length ? (
      <Box display="none" hover={{ display: 'flex', scope: FILES }} flexDirection="row" columnGap={2} flexWrap="wrap">
        {shown.map(f => (
          <Text>
            <Text color={f.code === '?' ? C.sub : f.code === 'D' ? C.red : f.code === 'A' ? C.green : C.yellow}>{f.code}</Text>
            <Text color={C.text}> {f.path}</Text>
          </Text>
        ))}
        {git && git.files.length > shown.length ? <Text color={C.sub}>외 {git.files.length - shown.length}개</Text> : null}
      </Box>
    ) : null
    const legend = usage?.slices.length ? (
      <Box display="none" hover={{ display: 'flex', scope: CTX }} flexDirection="row" columnGap={2} flexWrap="wrap">
        {[...usage.slices].sort((a, b) => b.tokens - a.tokens).map(sl => (
          <Text>
            <Text color={sl.color}>■</Text>
            <Text color={C.text}> {sl.name} </Text>
            <Text color={C.sub}>{tokensOf(sl.tokens)}</Text>
          </Text>
        ))}
        {usage.compactAt ? <Text color={C.sub}>┃ 자동 압축 {tokensOf(usage.compactAt)}</Text> : null}
      </Box>
    ) : null

    return (
      <Box flexDirection="column">
        {below}
        {legend}
        {files}
        {line(work ? [...top, work] : top, work)}
        {bottom.length ? line(bottom, null) : null}
      </Box>
    )
  })
}
