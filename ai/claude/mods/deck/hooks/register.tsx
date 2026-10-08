import type { EngineInterface, PromptSubmitInput, RenderElement, PromptSubmitResult, Register, TurnCompleteInput, TurnCompleteResult } from 'claude-code'

import {
  armedText, AUTO_WARM_MS, BIG_TOKENS, card, deadlineKey, DEFAULT_WINDOW_MS, disarm, everyKey, freshState, guardText, KEY_ALWAYS, KEY_DEADLINE, KEY_EVERY, KEY_GUARD,
  MIN_PING_MS, parseDuration, PING_AFTER_MS, PING_PROMPT, pingUsd, resetForClear, seedFromResume, statusText, type State,
} from './cache'
import { fmtDuration, fmtTok, fmtUsd, isCold, priceOf, TTL_MS, viewOf } from './cacheview'
import { gridFor, isImagePath, isPagePath } from './images'
import { pickMode, type Mode } from './parse'
import { C } from './theme'
import { splitAll } from './blocks'
import { ago, cellWidth, fit, type Fit,ciFromGithub, ciFromGitlab, elapsed, modelName, parseGit, shortPath, tokensOf, untilText, type Ci, type Git } from './board'

// 입력창 위 두 줄 계기판 — statusline 이 하던 것(모델·경로·브랜치·컨텍스트·비용·사용량 한도)에
// git 변경·CI·지금 도는 작업을 더한다. 윗줄은 "어디서 무엇을", 아랫줄은 "얼마나 남았나".
// 모듈 변수는 리로드 때 비워지고 session.start 는 다시 오지 않는다 — 처음 그릴 때 시작한다.
const EDITS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])
const FILES = 'board-files'
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
  limits: { kind: string; percent: number; resetsAt: number }[]
  usd?: number
  startedAt: number
}
let usage: Usage | null = null

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
    const u = await $.session.usage()
    const c = u.context
    const tokens = c.tokens ?? 0
    usage = {
      tokens,
      window: c.window,
      percent: c.percent ?? Math.round((tokens / c.window) * 100),
      limits: u.rateLimits.map(l => ({ kind: l.kind, percent: l.percentUsed, resetsAt: Date.parse(l.resetsAt ?? '') || 0 })),
      usd: u.cost?.usd,
      startedAt: u.startedAt,
    }
    model = modelName(await $.session.model())
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

// ── 그림: 답 속 ```mermaid · ```chart · 이미지 줄, Read 로 읽은 이미지 ─────────────
// 그리기는 node(bin/*.mjs)·sh(bin/convert.sh)가 하고, 여기선 쌓아 두었다가 한 번에 넘긴다.
// session.start 에 기대지 않는다 — 쌓을 때마다 그리기를 깨우고, 끝나면 그 사이 쌓인 것을 한 번 더.
type Png = { png: string; columns: number; rows: number }
type Failed = { error: string }
type ImageFile = { file: string; width: number; height: number }
type MermaidJob = { key: string; source: string; kind: 'png' | 'text'; maxColumns: number }
type ChartJob = { key: string; spec: string; maxColumns: number; maxRows?: number }
type PageJob = { key: string; html?: string; path?: string; maxColumns: number; maxRows?: number; slices?: boolean }
type Shot = Png & { file: string; cut?: boolean; parts?: { path: string; columns: number; rows: number; png?: string }[] }

const pic = { cellAspect: 2.2, maxRows: 30, scale: 1, style: 'clean', theme: 'gruvbox', mode: 'auto' }
let picMode: Mode | undefined
const mermaidDrawn = new Map<string, Png | { text: string } | Failed>()
const mermaidQueue = new Map<string, MermaidJob>()
const chartDrawn = new Map<string, Png | Failed>()
const chartQueue = new Map<string, ChartJob>()
const pageDrawn = new Map<string, Shot | Failed>()
const pageQueue = new Map<string, PageJob>()
const converted = new Map<string, ImageFile | Failed>()
const convertQueue = new Set<string>()
const picBusy = { mermaid: false, chart: false, page: false, convert: false }

const PICTURE_PROMPT = [
  '# Pictures in this terminal',
  'This terminal draws pictures in your replies; use them when a picture is clearer than text.',
  '- Diagrams: a ```mermaid block at the top level of the reply (not inside a list) for a flow, sequence, state machine or entity model. Keep it small: about 12 nodes, short one-line labels (no <br/>). Node ids in ASCII; labels may be Korean.',
  '- Charts: a ```chart block holding a Vega-Lite JSON spec for numbers that read better as a chart (a comparison, a trend, a breakdown). Put the data inline under "data": {"values": [...]}; leave out width, height and colors (they are fitted to the terminal); add a short "title"; labels may be Korean. Keep a table of the key numbers in text too if the user needs exact values. Two charts side by side: {"hconcat": [spec1, spec2]}; a pie or donut: mark "arc" with a theta encoding.',
  '- Pages: a ```page block holding HTML (a fragment or a whole document) when a laid-out view says it best — cards, a styled table, a small dashboard, a timeline. It is rendered by Chrome and shown as a picture (not clickable here; the user can open it in Chrome). It already has a dark gruvbox base style; inline your own CSS/JS, no external fetches needed. Use ```html only to show HTML source as code.',
  '- A local HTML file you wrote (an explainer, a report): put `![title](/absolute/path.html)` on a line of its own to show its first screen here, with a button to open it in Chrome.',
  '- Images: `![short description](/absolute/path.png)` on a line of its own. Several on one line separated by spaces sit side by side. A video path (`.mp4` …) shows six frames spread over the video. Reading an image file with the Read tool also shows it under the tool call.',
].join('\n')

async function modeOf($: EngineInterface): Promise<Mode> {
  picMode ??= pickMode(pic.mode, {
    TERM: await $.env.get('TERM'),
    TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
    KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'),
    TMUX: await $.env.get('TMUX'),
    CLAUDE_CODE_FORCE_TERMINAL_IMAGES: await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'),
  })
  return picMode
}

// 쌓인 일을 렌더러 한 번에 넘기고 key 별 결과를 받는다.
async function runRenderer($: EngineInterface, script: string, payload: object): Promise<({ key: string } & Record<string, unknown>)[]> {
  const { exitCode, stdout, stderr } = await $.process.run(['node', `${$.plugin.root}/bin/${script}`], { stdin: JSON.stringify(payload), timeoutMs: 60_000 })
  if (exitCode !== 0) throw new Error(stderr.trim().split('\n').pop() ?? `exit ${exitCode}`)
  return JSON.parse(stdout).results
}

async function drainMermaid($: EngineInterface): Promise<void> {
  if (picBusy.mermaid || mermaidQueue.size === 0) return
  picBusy.mermaid = true
  const items = [...mermaidQueue.values()]
  mermaidQueue.clear()
  try {
    const results = await runRenderer($, 'mermaid.mjs', { items, theme: pic.theme, cellAspect: pic.cellAspect, scale: pic.scale, style: pic.style })
    for (const { key, ...d } of results) mermaidDrawn.set(key, d as Png | { text: string } | Failed)
    // 결과가 빠진 블록은 못 그린 것으로 — 안 그러면 그릴 때마다 다시 줄을 선다.
    for (const item of items) if (!mermaidDrawn.has(item.key)) mermaidDrawn.set(item.key, { error: '렌더러가 결과를 주지 않았다' })
  } catch (error) {
    for (const item of items) mermaidDrawn.set(item.key, { error: String(error) })
  } finally {
    picBusy.mermaid = false
  }
  $.ui.invalidate('ui.render')
  void drainMermaid($)
}

async function drainChart($: EngineInterface): Promise<void> {
  if (picBusy.chart || chartQueue.size === 0) return
  picBusy.chart = true
  const items = [...chartQueue.values()]
  chartQueue.clear()
  try {
    const results = await runRenderer($, 'chart.mjs', { items, cellAspect: pic.cellAspect, style: pic.style })
    for (const { key, ...d } of results) chartDrawn.set(key, d as Png | Failed)
    // 결과가 빠진 블록은 못 그린 것으로 — 안 그러면 그릴 때마다 다시 줄을 선다.
    for (const item of items) if (!chartDrawn.has(item.key)) chartDrawn.set(item.key, { error: '렌더러가 결과를 주지 않았다' })
  } catch (error) {
    for (const item of items) chartDrawn.set(item.key, { error: String(error) })
  } finally {
    picBusy.chart = false
  }
  $.ui.invalidate('ui.render')
  void drainChart($)
}

async function drainPage($: EngineInterface): Promise<void> {
  if (picBusy.page || pageQueue.size === 0) return
  picBusy.page = true
  const items = [...pageQueue.values()]
  pageQueue.clear()
  try {
    const results = await runRenderer($, 'html.mjs', { items, cellAspect: pic.cellAspect })
    for (const { key, ...d } of results) {
      // 펼친 장은 파일로 온다 — 터미널이 파일 그림을 못 받는 곳(herdr)도 있어 장마다 읽어 base64 로.
      for (const part of (d as Shot).parts ?? []) part.png = (await $.fs.read(part.path, { as: 'bytes' })).base64
      pageDrawn.set(key, d as Shot | Failed)
    }
    for (const item of items) if (!pageDrawn.has(item.key)) pageDrawn.set(item.key, { error: '렌더러가 결과를 주지 않았다' })
  } catch (error) {
    for (const item of items) pageDrawn.set(item.key, { error: String(error) })
  } finally {
    picBusy.page = false
  }
  $.ui.invalidate('ui.render')
  void drainPage($)
}

async function drainConvert($: EngineInterface): Promise<void> {
  if (picBusy.convert || convertQueue.size === 0) return
  picBusy.convert = true
  const paths = [...convertQueue]
  convertQueue.clear()
  try {
    const cacheDir = `${(await $.env.get('HOME')) ?? '/tmp'}/.cache/claude-img`
    const { stdout } = await $.process.run(['/bin/sh', `${$.plugin.root}/bin/convert.sh`, cacheDir, ...paths], { timeoutMs: 60_000 })
    for (const line of stdout.split('\n')) {
      if (!line.startsWith('{')) continue
      const { path, ...rest } = JSON.parse(line) as { path: string } & (ImageFile | Failed)
      converted.set(path, rest)
    }
    for (const p of paths) if (!converted.has(p)) converted.set(p, { error: '변환 결과가 없다' })
  } catch (error) {
    for (const p of paths) converted.set(p, { error: String(error) })
  } finally {
    picBusy.convert = false
  }
  $.ui.invalidate('ui.render')
  void drainConvert($)
}

function mermaidOf($: EngineInterface, source: string, kind: 'png' | 'text', maxColumns: number) {
  const key = `${kind}|${kind === 'png' ? maxColumns : ''}|${source}`
  const hit = mermaidDrawn.get(key)
  if (!hit && !mermaidQueue.has(key)) {
    mermaidQueue.set(key, { key, source, kind, maxColumns })
    void drainMermaid($)
  }
  return hit
}

// 같은 spec 은 같은 그림 — 크기만 다르면 다시 그린다.
function chartOf($: EngineInterface, spec: string, maxColumns: number, maxRows?: number) {
  const key = `${maxColumns}x${maxRows ?? ''}|${spec}`
  const hit = chartDrawn.get(key)
  if (!hit && !chartQueue.has(key)) {
    chartQueue.set(key, { key, spec, maxColumns, maxRows })
    void drainChart($)
  }
  return hit
}

// 같은 HTML 은 같은 그림 — 폭(과 크게 보기의 높이)이 다르면 다시 찍는다.
// src 는 답 속 HTML 조각이거나 HTML 파일 경로.
type PageSrc = { html: string } | { path: string }
// slices 면 끝까지 찍어 여러 장으로(펼치기).
function pageOf($: EngineInterface, src: PageSrc, maxColumns: number, maxRows?: number, slices = false) {
  const key = `${slices ? 'all|' : ''}${maxColumns}x${maxRows ?? ''}|${'path' in src ? `file:${src.path}` : src.html}`
  const hit = pageDrawn.get(key)
  if (!hit && !pageQueue.has(key)) {
    pageQueue.set(key, { key, ...src, maxColumns, maxRows, slices })
    void drainPage($)
  }
  return hit
}

// 펼친 페이지(파일 경로나 HTML 그대로를 열쇠로). 펼치면 그 자리에 페이지 끝까지.
const expanded = new Set<string>()
function toggleExpand($: EngineInterface, id: string): void {
  if (expanded.has(id)) expanded.delete(id)
  else expanded.add(id)
  $.ui.invalidate('ui.render')
}

// HTML 의 <title>·첫 제목을 이름으로.
const pageTitle = (html: string): string => {
  const m = /<title>([^<]+)<\/title>/i.exec(html) ?? /<h[1-3][^>]*>([^<]+)<\/h[1-3]>/i.exec(html)
  return (m?.[1] ?? 'page').trim().slice(0, 60)
}

async function openInChrome($: EngineInterface, file: string): Promise<void> {
  const { exitCode } = await $.process.run(['open', '-a', 'Google Chrome', file])
  if (exitCode !== 0) $.ui.toast('Chrome 을 열지 못했다')
}

function imageOf($: EngineInterface, path: string) {
  const hit = converted.get(path)
  if (!hit && !convertQueue.has(path)) {
    convertQueue.add(path)
    void drainConvert($)
  }
  return hit
}

const chartTitle = (spec: string): string => {
  try {
    const t = (JSON.parse(spec) as { title?: unknown }).title
    return typeof t === 'string' ? t : typeof (t as { text?: unknown })?.text === 'string' ? (t as { text: string }).text : 'chart'
  } catch {
    return 'chart'
  }
}

// 크게 보기 pane 하나 — 무엇을 띄웠느냐에 따라 그린다.
const VIEW = 'deck-view'
type Viewing = { kind: 'png'; title: string; png: Png } | { kind: 'chart'; title: string; spec: string } | { kind: 'page'; title: string; src: PageSrc } | { kind: 'file'; title: string; img: ImageFile }
let viewing: Viewing | null = null

async function openView($: EngineInterface, v: Viewing): Promise<void> {
  viewing = v
  // 입력창 위에 넓게 — 터미널 폭을 다 쓰고 높이는 엔진이 내줄 만큼.
  await $.ui.open({ id: VIEW, title: v.title.slice(0, 40) || 'deck', focus: true, closeOnEscape: true, rows: 40 })
  $.ui.invalidate('ui.render')
}

// ~/Downloads 에 PNG 로. 이름 뒤에 시각을 붙인다.
async function savePng($: EngineInterface, png: string, title: string): Promise<void> {
  const name = title.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60) || 'chart'
  const home = (await $.env.get('HOME')) ?? '/tmp'
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  const file = `${home}/Downloads/${name}-${stamp}.png`
  const { exitCode } = await $.process.run(['/bin/sh', '-c', 'base64 -D > "$1"', 'sh', file], { stdin: png })
  $.ui.toast(exitCode === 0 ? `저장했다: ${file}` : '저장하지 못했다')
}

const level = (percent: number) => (percent >= 80 ? C.red : percent >= 50 ? C.yellow : C.green)


export const register: Register = (on, options) => {
  // 설정(/plugin → deck → configure). 비우면 기본값.
  if (typeof options.cell_aspect === 'number') pic.cellAspect = options.cell_aspect
  if (typeof options.max_rows === 'number') pic.maxRows = options.max_rows
  if (typeof options.scale === 'number') pic.scale = options.scale
  if (options.style === 'sketch') pic.style = 'sketch'


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
    void refreshUsage($)
    return r
  }).catch(($, e, next) => next(e))

  // ── 그림 ───────────────────────────────────────────
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.surfaces.includes('terminal')) return composed
    return { sections: [...composed.sections, { id: 'deck:pictures', text: PICTURE_PROMPT, scope: 'session' as const }] }
  })

  // 답을 블록으로 나눠, 그림이 준비된 블록은 그림으로, 아직이거나 못 그린 블록은 원래 글로.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const blocks = splitAll(e.props.text)
    if (!blocks.some(b => b.kind !== 'text')) return next(e)
    const mode = await modeOf($)
    const { Box, Button, Image, Text } = $.ui.resolve(e)
    // 왼쪽 2칸 거터(⏺)와 마지막 빈 칸을 뺀 폭.
    const width = Math.max(20, (e.viewport?.columns ?? 80) - 3)
    const rows: RenderElement[] = []
    let isFirst = e.props.isFirstOfReply
    const asText = async (text: string) => {
      const drawn = await next({ ...e, props: { ...e.props, text, isFirstOfReply: isFirst } })
      // 엔진은 답의 첫 덩어리에만 거터를 붙인다 — 이어지는 조각은 여기서 맞춘다.
      rows.push(isFirst ? drawn : <Box flexDirection="row"><Box width={2} flexShrink={0} /><Box flexDirection="column" flexGrow={1} flexShrink={1}>{drawn}</Box></Box>)
    }
    const failed = (what: string, error: string) => rows.push(<Box paddingLeft={2}><Text dimColor>{what} 그리지 못했다: {error}</Text></Box>)
    const picture = (body: RenderElement) =>
      rows.push(
        <Box flexDirection="row" marginTop={1}>
          <Box width={2} flexShrink={0}><Text>{isFirst ? '⏺' : ' '}</Text></Box>
          {body}
        </Box>,
      )
    // 그림 밑 한 줄: 설명은 흐리게, 버튼은 그림에 포인터를 올렸을 때만.
    const under = (scope: string, caption: string, buttons: RenderElement[]) => (
      <Box flexDirection="row" columnGap={2} minHeight={1}>
        {caption ? <Text dimColor wrap="truncate-end">{caption}</Text> : null}
        <Box display="none" columnGap={2} hover={{ display: 'flex', scope }}>{buttons}</Box>
      </Box>
    )
    // 페이지(```page · HTML 파일) 한 칸: 미리보기, 잘렸으면 ▾ 펼치기 — 펼치면 끝까지 여러 장을 이어 붙인다.
    const pageView = (id: string, scopeId: string, title: string, src: PageSrc, d: Shot, cols: number, captioned = false) => {
      const scope = scopeId.slice(0, 64)
      const open = expanded.has(id)
      const all = open ? pageOf($, src, cols, undefined, true) : undefined
      const parts = all && !('error' in all) ? (all.parts ?? null) : null
      const caption = captioned ? (open ? title : d.cut ? `${title} · 아래 이어짐` : title) : open ? title : ''
      const buttons = [
        <Button key={`${scope}-big`} plain dimColor onPress={() => void openView($, { kind: 'page', title, src })}>⤢ 크게 보기</Button>,
        ...(d.cut || open ? [<Button key={`${scope}-fold`} plain dimColor onPress={() => toggleExpand($, id)}>{open ? '▴ 접기' : '▾ 펼치기'}</Button>] : []),
        <Button key={`${scope}-open`} plain dimColor onPress={() => void openInChrome($, d.file)}>↗ Chrome 에서 열기</Button>,
      ]
      return (
        <Box flexDirection="column" hover={{ scope }}>
          {parts
            ? parts.map((part, i) => <Image key={`${scope}-part-${i}`} source={{ png: part.png ?? '' }} columns={part.columns} rows={part.rows} alt={`[page: ${title} ${i + 1}/${parts.length}]`} />)
            : <Image source={{ png: d.png }} columns={d.columns} rows={d.rows} alt={`[page: ${title}]`} />}
          {open && !parts ? <Text dimColor>{all && 'error' in all ? `펼치지 못했다: ${all.error}` : '펼치는 중…'}</Text> : null}
          {under(scope, caption, buttons)}
        </Box>
      )
    }
    for (const [n, b] of blocks.entries()) {
      if (b.kind === 'text') await asText(b.text)
      else if (b.kind === 'mermaid') {
        const d = mode === 'off' ? undefined : mermaidOf($, b.source, mode === 'pictures' ? 'png' : 'text', width)
        if (!d || 'error' in d) {
          await asText(b.raw)
          if (d) failed('다이어그램을', d.error)
        } else if ('text' in d) picture(<Text wrap="truncate-end">{d.text}</Text>)
        else {
          const title = b.source.trim().split('\n')[0] ?? 'mermaid'
          const scope = `deck-m-${n}-${d.png.length}`.slice(0, 64)
          picture(
            <Box flexDirection="column" hover={{ scope }}>
              <Image source={{ png: d.png }} columns={d.columns} rows={d.rows} alt={`[mermaid: ${title}]`} />
              {under(scope, '', [<Button key={`${scope}-big`} plain dimColor onPress={() => void openView($, { kind: 'png', title, png: d })}>⤢ 크게 보기</Button>])}
            </Box>,
          )
        }
      } else if (b.kind === 'chart') {
        const d = chartOf($, b.spec, Math.min(110, width - 1))
        if (!d || 'error' in d) {
          await asText(b.raw)
          if (d) failed('차트를', d.error)
        } else {
          const title = chartTitle(b.spec)
          const spec = b.spec
          const scope = `deck-c-${n}-${spec.length}`.slice(0, 64)
          picture(
            <Box flexDirection="column" hover={{ scope }}>
              <Image source={{ png: d.png }} columns={d.columns} rows={d.rows} alt={`[chart: ${title}]`} />
              {under(scope, '', [
                <Button key={`${scope}-big`} plain dimColor onPress={() => void openView($, { kind: 'chart', title, spec })}>⤢ 크게 보기</Button>,
                <Button key={`${scope}-save`} plain dimColor onPress={() => void savePng($, d.png, title)}>↓ PNG 저장</Button>,
              ])}
            </Box>,
          )
        }
      } else if (b.kind === 'page') {
        const d = pageOf($, { html: b.html }, Math.min(110, width - 1))
        if (!d || 'error' in d) {
          await asText(b.raw)
          if (d) failed('페이지를', d.error)
        } else {
          const title = pageTitle(b.html)
          const html = b.html
          picture(pageView(`html:${html}`, `deck-p-${n}-${html.length}`, title, { html }, d, Math.min(110, width - 1)))
        }
      } else if (b.pictures.length === 1 && isPagePath(b.pictures[0]?.path)) {
        // HTML 파일 한 장 — 위쪽 첫 화면을 미리보기로(높이는 이미지 한도), 전체는 크게 보기·Chrome.
        const p = b.pictures[0] as { path: string; alt: string }
        const d = pageOf($, { path: p.path }, Math.min(110, width - 1), pic.maxRows)
        if (!d || 'error' in d) {
          await asText(b.raw)
          if (d) failed('페이지를', d.error)
        } else {
          const title = p.alt || (p.path.split('/').pop() ?? p.path)
          picture(pageView(`file:${p.path}`, `deck-f-${n}-${p.path.length}`, title, { path: p.path }, d, Math.min(110, width - 1), true))
        }
      } else {
        // 한 줄의 그림이 다 준비돼야 그린다 — 그 전엔 원래 글(이미지 문법)로 둔다.
        const imgs = b.pictures.map(p => imageOf($, p.path))
        if (!imgs.every(i => i && !('error' in i))) await asText(b.raw)
        else {
          // 여러 장이면 폭을 나눠 나란히. 각 그림 밑에 설명.
          const gap = 2
          const each = Math.floor((Math.min(100, width) - gap * (b.pictures.length - 1)) / b.pictures.length)
          picture(
            <Box flexDirection="row" columnGap={gap}>
              {b.pictures.map((p, i) => {
                const img = imgs[i] as ImageFile
                const grid = gridFor(img.width, img.height, each, pic.maxRows, pic.cellAspect)
                const title = p.alt || (p.path.split('/').pop() ?? p.path)
                // 같은 그림이 대화에 두 번 나와도 함께 밝아질 뿐이라 캐시 파일 이름으로 묶는다.
                const scope = `deck-i-${img.file.split('/').pop() ?? i}`.slice(0, 64)
                return (
                  <Box flexDirection="column" hover={{ scope }}>
                    <Image source={{ file: img.file, format: 'png' }} columns={grid.columns} rows={grid.rows} alt={`[이미지: ${title}]`} />
                    {under(scope, title, [<Button key={`${scope}-big`} plain dimColor onPress={() => void openView($, { kind: 'file', title, img })}>⤢ 크게 보기</Button>])}
                  </Box>
                )
              })}
            </Box>,
          )
        }
      }
      isFirst = false
    }
    return <Box flexDirection="column">{rows}</Box>
  })

  // Read 로 이미지를 읽은 줄 아래에 그 그림.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.tool !== 'Read' || e.props.isRunning || e.props.isErrored) return next(e)
    const path = (e.props.input as { file_path?: unknown } | null)?.file_path
    if (!isImagePath(path)) return next(e)
    const row = await next(e)
    const img = imageOf($, path)
    if (!img || 'error' in img) return row
    const { Box, Button, Image, Text } = $.ui.resolve(e)
    const grid = gridFor(img.width, img.height, Math.min(100, (e.viewport?.columns ?? 80) - 6), pic.maxRows, pic.cellAspect)
    const title = path.split('/').pop() ?? path
    const scope = `deck-r-${img.file.split('/').pop() ?? ''}`.slice(0, 64)
    return (
      <Box flexDirection="column">
        {row}
        <Box paddingLeft={5} flexDirection="column" hover={{ scope }}>
          <Image source={{ file: img.file, format: 'png' }} columns={grid.columns} rows={grid.rows} alt={`[이미지: ${path}]`} />
          <Box flexDirection="row" columnGap={2}>
            <Text dimColor wrap="truncate-end">{title}</Text>
            <Box display="none" hover={{ display: 'flex', scope }}>
              <Button key={`${scope}-big`} plain dimColor onPress={() => void openView($, { kind: 'file', title, img })}>⤢ 크게 보기</Button>
            </Box>
          </Box>
        </Box>
      </Box>
    )
  })

  // 크게 보기: 위에 제목 줄, 아래 그림을 pane 에 꽉 차게.
  on('ui.render', { component: 'Pane', requestId: VIEW }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box, Button, Image, Text } = $.ui.resolve(e)
    if (!viewing) return <Text dimColor>보여 줄 그림이 없다.</Text>
    const v = viewing
    const cols = Math.max(10, e.props.bodyColumns)
    const room = Math.max(4, e.props.scroll.bodyRows - 2)
    let body: RenderElement
    let meta = ''
    let save: string | null = null
    let open: string | null = null
    if (v.kind === 'file') {
      const grid = gridFor(v.img.width, v.img.height, cols, room, pic.cellAspect)
      body = <Image source={{ file: v.img.file, format: 'png' }} columns={grid.columns} rows={grid.rows} alt={v.title} />
      meta = `${v.img.width}×${v.img.height}`
    } else if (v.kind === 'png') {
      // 이미 그린 PNG 를 키워 보인다(1행 40px 로 그려 두어 세 배까지 선명하다).
      const grow = Math.min(3, cols / v.png.columns, room / v.png.rows)
      body = <Image source={{ png: v.png.png }} columns={Math.max(1, Math.floor(v.png.columns * grow))} rows={Math.max(1, Math.floor(v.png.rows * grow))} alt={v.title} />
    } else if (v.kind === 'page') {
      // 페이지는 pane 폭으로 다시 찍는다(레이아웃이 넓어진 폭에 맞게 다시 흐른다).
      const d = pageOf($, v.src, Math.max(20, cols - 1), Math.max(8, room - 1))
      body = !d ? <Text dimColor>찍는 중…</Text>
        : 'error' in d ? <Text dimColor>페이지를 그리지 못했다: {d.error}</Text>
        : <Image source={{ png: d.png }} columns={d.columns} rows={d.rows} alt={v.title} />
      if (d && !('error' in d)) open = d.file
    } else {
      // 차트는 pane 크기에 맞춰 다시 그린다.
      const d = chartOf($, v.spec, Math.max(20, cols - 1), Math.max(8, room - 1))
      body = !d ? <Text dimColor>그리는 중…</Text>
        : 'error' in d ? <Text dimColor>차트를 그리지 못했다: {d.error}</Text>
        : <Image source={{ png: d.png }} columns={d.columns} rows={d.rows} alt={v.title} />
      if (d && !('error' in d)) save = d.png
    }
    const png = save
    const page = open
    return (
      <Box flexDirection="column" rowGap={1}>
        <Box flexDirection="row" columnGap={2}>
          <Text bold color={C.yellow}>{v.title}</Text>
          {meta ? <Text dimColor>{meta}</Text> : null}
          <Box flexGrow={1} />
          {png ? <Button key="save" plain dimColor hotkey="s" onPress={() => void savePng($, png, v.title)}>↓ PNG 저장</Button> : null}
          {page ? <Button key="open" plain dimColor hotkey="o" onPress={() => void openInChrome($, page)}>↗ Chrome 에서 열기</Button> : null}
          <Text dimColor>Esc 닫기</Text>
        </Box>
        <Box flexDirection="row" justifyContent="center">{body}</Box>
      </Box>
    )
  })

  on('ui.close', { id: VIEW }, async ($, e, next) => {
    viewing = null
    return next(e)
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
    // ▰▱ 8칸 게이지 + 퍼센트. CTX 와 사용량 한도가 같은 모양이다.
    const gauge = (name: string, percent: number, p: number, fixed?: string): Item => {
      const tone = fixed ?? level(percent)
      const filled = Math.min(8, Math.round((percent / 100) * 8))
      const lit = ` ${'▰'.repeat(filled)}`
      const off = '▱'.repeat(8 - filled)
      const num = ` ${Math.round(percent)}% `
      return item(
        <Text>
          {label(tone, name)}
          <Text backgroundColor={C.surface} color={tone}>{lit}</Text>
          <Text backgroundColor={C.surface} color={C.overlay}>{off}</Text>
          <Text backgroundColor={C.surface} color={C.text} bold>{num}</Text>
        </Text>,
        ` ${name} ${lit}${off}${num}`, p,
      )
    }

    // ── 윗줄: 어디서 ────────────────────────────────────
    const top: Item[] = []
    if (cwd) top.push(pillItem(C.yellow, C.base, `📁 ${shortPath(cwd, home)}`, 1))
    if (git) {
      const ab = `${git.ahead ? ` ↑${git.ahead}` : ''}${git.behind ? ` ↓${git.behind}` : ''}`
      top.push(pillItem(C.teal, C.base, `⎇ ${git.branch || '(detached)'}${ab}`, 0))
    }
    // 모델은 브랜치 바로 옆.
    if (model) {
      top.push(pillItem(C.peach, C.base, `◆ ${model}`, 2))
      if (effort) top.push(pillItem(C.overlay, C.peach, effort, 6, { bold: false, glue: true }))
    }
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

    // ── 아랫줄: 얼마나 남았나 ───────────────────────────
    const bottom: Item[] = []
    if (usage) {
      const u = usage
      bottom.push(gauge(u.percent >= 80 ? 'CTX 압축 임박' : 'CTX', u.percent, 0, C.green))
      u.limits.forEach((l, i) => {
        const name = l.kind === 'five_hour' ? '5H' : l.kind === 'seven_day' ? '7D' : l.kind === 'spend_limit' ? '한도' : l.kind
        bottom.push(gauge(name, l.percent, i === 0 ? 1 : 4))
        if (l.resetsAt) {
          const t = `⟲ ${untilText(l.resetsAt, now)} `
          bottom.push(item(<Text backgroundColor={C.surface} color={C.sub}>{t}</Text>, t, 7, true))
        }
      })
      if (u.usd !== undefined) {
        bottom.push(item(label(C.teal, `$${u.usd.toFixed(2)}`), ` $${u.usd.toFixed(2)} `, 5))
        const hours = (now - u.startedAt) / 3_600_000
        if (hours > 0.1) {
          const t = ` 🔥 $${(u.usd / hours).toFixed(1)}/h `
          bottom.push(item(<Text backgroundColor={C.surface} color={C.peach}>{t}</Text>, t, 8, true))
        }
      }
    }
    const cachePill = viewOf(cache, now)
    if (turn) bottom.push(item(label(C.blue, '☕ 캐시 데우는 중'), ' ☕ 캐시 데우는 중 ', 3))
    else if (cachePill) {
      const bg = cachePill.tone === 'warm' ? C.blue : cachePill.tone === 'cold' ? C.red : C.overlay
      const head = ` ${cachePill.head} `
      const body = ` ${cachePill.body} `
      bottom.push(item(<Text backgroundColor={bg} color={cachePill.tone === 'warm' || cachePill.tone === 'cold' ? C.base : C.text} bold>{head}</Text>, head, 3))
      bottom.push(item(<Text backgroundColor={C.surface} color={C.text}>{body}</Text>, body, 6, true))
    }
    const bottomRight: Item[] = []
    if (turn) {
      const parts = [`${SPIN[Math.floor(now / 250) % SPIN.length]} ${elapsed(Math.round((now - turn.startedAt) / 1000))}`, turn.current, `도구 ${turn.tools}`]
      if (turn.edits.size) parts.push(`편집 ${turn.edits.size}`)
      if (turn.agents > 0) parts.push(`에이전트 ${turn.agents}`)
      bottomRight.push(pillItem(C.mauve, C.base, parts.join('  '), 2))
    } else if (last) {
      const t = `지난 턴 ${elapsed(last.seconds)} · 도구 ${last.tools}${last.edits ? ` · 편집 ${last.edits}` : ''}`
      bottomRight.push(item(<Text color={C.sub}>{t}</Text>, t, 9))
    }
    if (top.length + bottom.length + bottomRight.length === 0) return below

    // 한 줄: 들어가는 알약만, 붙은 것(glue)은 사이 칸 없이. right 는 오른쪽 끝으로 민다.
    const line = (left: Item[], right: Item[]) => {
      const all = [...left, ...right]
      const keep = fit(all, cols)
      const draw = (items: Item[], offset: number) => {
        const out: RenderElement[] = []
        items.forEach((it, i) => {
          if (!keep[offset + i]) return
          if (out.length && !it.glue) out.push(<Text> </Text>)
          out.push(it.el)
        })
        return out
      }
      return (
        <Box flexDirection="row">
          {draw(left, 0)}
          <Box flexGrow={1} />
          {draw(right, left.length)}
        </Box>
      )
    }

    // 변경 알약에 포인터를 올리면 그 위 줄에 파일 목록 — 띠는 아래가 붙박이라 위로 펼쳐야 알약이 안 움직인다.
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

    return (
      <Box flexDirection="column">
        {below}
        {files}
        {top.length ? line(top, []) : null}
        {bottom.length + bottomRight.length ? line(bottom, bottomRight) : null}
      </Box>
    )
  })
}
