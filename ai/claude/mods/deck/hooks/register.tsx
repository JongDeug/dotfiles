import type { EngineInterface, RenderElement, Register } from 'claude-code'

import { helpText } from './help'
import { commitProblems, readCommit, type Repo } from './commit'
import { stateOf, type PetState } from './pet'
import { SLIME_COLS, slimeRows } from './slime'
import { gridFor, isImagePath } from './images'
import { pickMode, type Mode } from './parse'
import { C, herdrTheme, setTheme, soft } from './theme'
import { splitAll } from './blocks'
import { ago, cellWidth, fit, type Fit, ciFromGithub, ciFromGitlab, elapsed, modelName, parseGit, freeSlot, queueOf, shortPath, tokensOf, untilText, type Ci, type Git, type Queued } from './board'

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
let queue: Queued[] | null = null
let queueCap = 3
let pane = ''
const busy = { git: false, ci: false, usage: false, queue: false }

type Turn = { startedAt: number; tools: number; current: string; agents: number; edits: Set<string> }
let turn: Turn | null = null
// 펫(슬라임): 설정에서 껐나(pet: off), 이 세션에서 /pet off 로 숨겼나, 다친 때(거절·도구 오류)까지.
const pet = { kind: 'slime' as 'slime' | 'off', hidden: false, hurtUntil: 0 }
// 말풍선: 사건 때 3초. 같은 말(key)은 gap 안에 다시 안 한다(기본 10분). 계속되는 상태(캐시 식음·5H)는 바뀌는 순간에만.
let bubble: { text: string; color: string; until: number } | null = null
const said = new Map<string, number>()
const seen = { tired: false }
function say(now: number, key: string, text: string, color: string, gap = 600_000) {
  if (now - (said.get(key) ?? -Infinity) < gap) return
  said.set(key, now)
  bubble = { text, color, until: now + 3000 }
}
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
  // 처음 그리기 전(cwd 모름)에 온 명령도 돌게 — 빈 cwd 는 엔진이 거부한다.
  const { exitCode, stdout } = await $.process.run(argv, cwd ? { cwd, timeoutMs: 15_000 } : { timeoutMs: 15_000 })
  return exitCode === 0 ? stdout.trim() : ''
}


function petState(now: number): PetState {
  return stateOf({
    working: turn !== null,
    hurtUntil: pet.hurtUntil,
    now,
    fiveHour: usage?.limits.find(l => l.kind === 'five_hour')?.percent,
  })
}

async function commitCheck($: EngineInterface, command: string): Promise<string | null> {
  const plan = readCommit(command, cwd)
  if (!plan) return null
  let repo: Repo | undefined
  if (plan.commit && plan.dir) {
    try {
      const git = async (...args: string[]) => {
        const r = await $.process.run(['git', '-C', plan.dir!, ...args], { timeoutMs: 5_000 })
        return r.exitCode === 0 ? r.stdout.trim() : ''
      }
      const branch = await git('symbolic-ref', '--short', 'HEAD') // 커밋 없는 새 브랜치도 읽힌다(detached 면 빈 값)
      const root = await git('rev-parse', '--show-toplevel')
      // 팀 레포 = CLAUDE.md 가 백엔드팀 공통 블록(backend-llm-wiki/REPO-CLAUDE.md)을 import 하는 저장소.
      const md = root ? await $.fs.read(`${root}/CLAUDE.md`).catch(() => '') : ''
      if (branch) repo = { branch, team: /backend-llm-wiki\/REPO-CLAUDE\.md/.test(String(md)) }
    } catch {
      // 저장소를 못 읽으면 브랜치 규칙만 건너뛴다.
    }
  }
  const problems = commitProblems(plan, repo)
  if (!problems.length) return null
  return `deck: 커밋을 막았다 — git-commit 스킬 규칙에 걸린다. 아래를 고쳐 다시 한다.\n${problems.map(p => `- ${p}`).join('\n')}`
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
    const was = ci?.state
    if (host === 'github') ci = ciFromGithub(await sh($, ['gh', 'run', 'list', '-b', git.branch, '-L', '1', '--json', 'status,conclusion,updatedAt,workflowName,url']))
    else if (host === 'gitlab') ci = ciFromGitlab(await sh($, ['glab', 'ci', 'list', '-b', git.branch, '-P', '1', '-F', 'json']))
    if (ci?.state === 'fail' && was && was !== 'fail') say(await $.clock.now(), 'ci', 'CI 깨졌어!', C.red, 0)
  })

// herdr 안에서만 — 모든 space 에서 /queue 로 올린 에이전트를 읽는다.
const herdr = async ($: EngineInterface, args: string[]) => sh($, [(await $.env.get('HERDR_BIN_PATH')) || 'herdr', ...args])
const readQueue = async ($: EngineInterface) => {
  if ((await $.env.get('HERDR_ENV')) !== '1') return null
  pane = (await $.env.get('HERDR_PANE_ID')) ?? ''
  return queueOf(await herdr($, ['agent', 'list']))
}
const refreshQueue = ($: EngineInterface) =>
  guarded($, 'queue', async () => {
    queue = await readQueue($)
  })

// /queue: 이 세션을 넣고 뺀다(토글). 꽉 찼으면 넣지 않는다. list 는 지금 큐.
async function queueCommand($: EngineInterface, args: string): Promise<string> {
  const q = await readQueue($)
  if (!q || !pane) return 'herdr 안의 세션에서만 쓴다'
  const names = (items: Queued[]) => items.map(i => `- ctrl+${i.slot} ${i.title} (${i.status})`).join('\n')
  if (args === 'list') return q.length ? `판단 큐 ${q.length}/${queueCap}\n${names(q)}` : `판단 큐 비었다 (0/${queueCap})`
  const mine = q.some(i => i.pane === pane)
  const slot = mine ? 0 : freeSlot(q, queueCap)
  if (!mine && !slot) return `판단 큐가 꽉 찼다 (${q.length}/${queueCap}) — 하나 끝내고 넣는다\n${names(q)}`
  await herdr($, ['pane', 'report-metadata', pane, '--source', 'deck.queue', ...(mine ? ['--clear-token', 'q'] : ['--token', `q=◆${slot}`])])
  await refreshQueue($)
  return mine ? `큐에서 뺐다 (${q.length - 1}/${queueCap})` : `큐 ${slot}번에 넣었다 (${q.length + 1}/${queueCap}) — ctrl+${slot} 로 온다`
}

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

// herdr 테마를 따른다 — 설정의 [theme] name, auto_switch 면 맥 라이트·다크로 짝을 고른다. 바뀌면 다시 그린다.
async function refreshTheme($: EngineInterface): Promise<void> {
  try {
    const xdg = (await $.env.get('XDG_CONFIG_HOME')) || `${home}/.config`
    const toml = String(await $.fs.read(`${xdg}/herdr/config.toml`))
    const dark = /auto_switch\s*=\s*true/.test(toml) ? (await sh($, ['defaults', 'read', '-g', 'AppleInterfaceStyle'])) === 'Dark' : true
    if (setTheme(herdrTheme(toml, dark))) $.ui.invalidate('ui.render')
  } catch {
    // herdr 설정이 없으면 지금 색(기본 gruvbox) 그대로
  }
}

async function start($: EngineInterface): Promise<void> {
  if (started) return
  started = true
  await registerCommands($)
  cwd = await $.session.cwd()
  home = (await $.env.get('HOME')) ?? ''
  // 첫 요청 전까지 보일 effort — 설정 파일에서 읽는다. 요청이 가면 turn.step 이 실제 값으로 바꾼다.
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${home}/.claude`
  effort = (await $.env.get('CLAUDE_EFFORT')) || (await sh($, ['node', '-e', `try{console.log(require(${JSON.stringify(`${dir}/settings.json`)}).effortLevel||'')}catch{}`]))
  await Promise.all([refreshGit($), refreshUsage($), refreshQueue($)])
  void refreshCi($)
  await refreshTheme($)
  say(await $.clock.now(), 'hi', '안녕!', C.teal)
  $.clock.every(10_000, () => {
    void refreshGit($)
    void refreshTheme($)
  })
  $.clock.every(5_000, () => {
    void refreshUsage($)
    void refreshQueue($)
  })
  $.clock.every(60_000, () => void refreshCi($))
  // 도는 동안만 스피너를 돌린다.
  $.clock.every(250, () => {
    if (turn) $.ui.invalidate('ui.render')
  })
  // 쉬는 동안엔 펫만 0.25초마다 — 도는 동안은 위 스피너가 다시 그린다.
  $.clock.every(250, () => {
    if (!turn && pet.kind !== 'off' && !pet.hidden) $.ui.invalidate('ui.render')
  })
}

// 명령 등록. /reload-plugins 뒤엔 session.start 가 다시 오지 않으니 계기판이 처음 그려질 때도 부른다 — 한 번만.
let commandsReady = false
async function registerCommands($: EngineInterface): Promise<void> {
  if (commandsReady) return
  commandsReady = true
  await $.command.register({
    name: 'deck',
    description: 'deck 이 하는 일과 명령 한 장. sync: push 한 deck 을 두 설정 폴더에 깔고 쉬는 세션을 리로드',
    argumentHint: '[sync]',
    immediate: true,
  })
  await $.command.register({
    name: 'pet',
    description: '계기판 오른쪽 펫을 이 세션에서 띄운다. off 면 숨긴다',
    argumentHint: '[off]',
    immediate: true,
  })
  await $.command.register({
    name: 'queue',
    description: '판단 큐: 이 세션을 넣고 뺀다(토글). 꽉 차면 안 넣는다. list 는 지금 큐',
    argumentHint: '[list]',
    immediate: true,
  })
}

// ── 그림: 답 속 ```mermaid · ```chart · 이미지 줄, Read 로 읽은 이미지 ─────────────
// 그리기는 node(bin/*.mjs)·sh(bin/convert.sh)가 하고, 여기선 쌓아 두었다가 한 번에 넘긴다.
// session.start 에 기대지 않는다 — 쌓을 때마다 그리기를 깨우고, 끝나면 그 사이 쌓인 것을 한 번 더.
type Png = { png: string; columns: number; rows: number }
type Failed = { error: string }
type ImageFile = { file: string; width: number; height: number }
type MermaidJob = { key: string; source: string; kind: 'png' | 'text'; maxColumns: number }
type ChartJob = { key: string; spec: string; maxColumns: number; maxRows?: number }

const pic = { cellAspect: 2.2, maxRows: 30, scale: 1, style: 'clean', mode: 'auto' }
let picMode: Mode | undefined
const mermaidDrawn = new Map<string, Png | { text: string } | Failed>()
const mermaidQueue = new Map<string, MermaidJob>()
const chartDrawn = new Map<string, Png | Failed>()
const chartQueue = new Map<string, ChartJob>()
const converted = new Map<string, ImageFile | Failed>()
const convertQueue = new Set<string>()
const picBusy = { mermaid: false, chart: false, convert: false }

const PICTURE_PROMPT = [
  '# Pictures in this terminal',
  'This terminal draws pictures in your replies; use them when a picture is clearer than text.',
  '- Diagrams: a ```mermaid block at the top level of the reply (not inside a list) for a flow, sequence, state machine or entity model. Keep it small: about 12 nodes, short one-line labels (no <br/>). Node ids in ASCII; labels may be Korean.',
  '- Charts: a ```chart block holding a Vega-Lite JSON spec for numbers that read better as a chart (a comparison, a trend, a breakdown). Put the data inline under "data": {"values": [...]}; leave out width, height and colors (they are fitted to the terminal); add a short "title"; labels may be Korean. Keep a table of the key numbers in text too if the user needs exact values. Two charts side by side: {"hconcat": [spec1, spec2]}; a pie or donut: mark "arc" with a theta encoding.',
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
  const { exitCode, stdout, stderr, isStdoutTruncated } = await $.process.run(['node', `${$.plugin.root}/bin/${script}`], { stdin: JSON.stringify(payload), timeoutMs: 60_000 })
  const why = stderr.trim().split('\n').pop()   // 빈 stderr 는 '' — ?? 로는 exit 코드가 안 나온다
  if (exitCode !== 0) throw new Error(why || `exit ${exitCode}`)
  // 빈·잘린 출력을 그대로 JSON.parse 하면 "Unexpected EOF" 만 남아 원인이 안 보인다(2026-10-08).
  if (isStdoutTruncated) throw new Error('렌더러 출력이 4MiB 를 넘어 잘렸다')
  if (!stdout.trim()) throw new Error(`렌더러가 아무것도 내지 않았다${why ? ` — ${why}` : ''}`)
  return JSON.parse(stdout).results
}

// 프로세스 쪽 실패(빈·잘린 출력, 비정상 종료)는 대개 한 번뿐이다 — 묶음 전부를 '못 그림'으로 박으면
// 그 그림들은 세션 내내 안 그려진다. 한 번 더 줄을 세우고, 또 실패하면 그때 못 그린 것으로.
// 렌더러가 답했는데 결과를 빠뜨린 블록(그 블록 자체의 문제)은 다시 부르지 않는다.
const retried = new Set<string>()
function failOrRetry<T>(items: T[], keyOf: (it: T) => string, queue: Map<string, T>, drawn: Map<string, unknown>, error: unknown) {
  for (const item of items) {
    const key = keyOf(item)
    if (retried.has(key)) drawn.set(key, { error: String(error) })
    else { retried.add(key); queue.set(key, item) }
  }
}

async function drainMermaid($: EngineInterface): Promise<void> {
  if (picBusy.mermaid || mermaidQueue.size === 0) return
  picBusy.mermaid = true
  const items = [...mermaidQueue.values()]
  mermaidQueue.clear()
  try {
    const colors = { bg: C.base, fg: C.text, line: C.overlay, accent: C.yellow, muted: C.sub }
    const results = await runRenderer($, 'mermaid.mjs', { items, colors, cellAspect: pic.cellAspect, scale: pic.scale, style: pic.style, maxRows: pic.maxRows })
    for (const { key, ...d } of results) mermaidDrawn.set(key, d as Png | { text: string } | Failed)
    // 결과가 빠진 블록은 못 그린 것으로 — 안 그러면 그릴 때마다 다시 줄을 선다.
    for (const item of items) if (!mermaidDrawn.has(item.key)) mermaidDrawn.set(item.key, { error: '렌더러가 결과를 주지 않았다' })
  } catch (error) {
    failOrRetry(items, (it) => it.key, mermaidQueue, mermaidDrawn, error)
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
    const colors = { text: C.text, grid: C.overlay, category: [C.blue, C.green, C.peach, C.mauve, C.yellow, C.teal, C.red, C.sub] }
    const results = await runRenderer($, 'chart.mjs', { items, colors, cellAspect: pic.cellAspect, style: pic.style })
    for (const { key, ...d } of results) chartDrawn.set(key, d as Png | Failed)
    // 결과가 빠진 블록은 못 그린 것으로 — 안 그러면 그릴 때마다 다시 줄을 선다.
    for (const item of items) if (!chartDrawn.has(item.key)) chartDrawn.set(item.key, { error: '렌더러가 결과를 주지 않았다' })
  } catch (error) {
    failOrRetry(items, (it) => it.key, chartQueue, chartDrawn, error)
  } finally {
    picBusy.chart = false
  }
  $.ui.invalidate('ui.render')
  void drainChart($)
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
  const key = `${kind}|${kind === 'png' ? `${maxColumns}|${C.name}` : ''}|${source}` // 테마가 바뀌면 다른 그림
  const hit = mermaidDrawn.get(key)
  if (!hit && !mermaidQueue.has(key)) {
    mermaidQueue.set(key, { key, source, kind, maxColumns })
    void drainMermaid($)
  }
  return hit
}

// 같은 spec 은 같은 그림 — 크기만 다르면 다시 그린다.
function chartOf($: EngineInterface, spec: string, maxColumns: number, maxRows?: number) {
  const key = `${maxColumns}x${maxRows ?? ''}|${C.name}|${spec}`
  const hit = chartDrawn.get(key)
  if (!hit && !chartQueue.has(key)) {
    chartQueue.set(key, { key, spec, maxColumns, maxRows })
    void drainChart($)
  }
  return hit
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
type Viewing = { kind: 'png'; title: string; png: Png } | { kind: 'chart'; title: string; spec: string } | { kind: 'file'; title: string; img: ImageFile }
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

// 접은 그림 — 그림 밑 ▴ 접기로 한 줄이 되고 ▾ 펼치기로 돌아온다. 키는 답(메시지 id)·블록 순서, Read 그림은 tool_use_id 라
// 같은 그림이 다른 답에 또 나와도 따로 접힌다. 모듈 변수라 리로드하면 다 펼쳐진다.
const folded = new Set<string>()
function toggleFold($: EngineInterface, key: string): void {
  if (!folded.delete(key)) folded.add(key)
  $.ui.invalidate('ui.render')
}

const level = (percent: number) => (percent >= 80 ? C.red : percent >= 50 ? C.yellow : C.green)


export const register: Register = (on, options) => {
  // 설정(/plugin → deck → configure). 비우면 기본값.
  if (typeof options.cell_aspect === 'number') pic.cellAspect = options.cell_aspect
  if (typeof options.max_rows === 'number') pic.maxRows = options.max_rows
  if (typeof options.scale === 'number') pic.scale = options.scale
  if (options.style === 'sketch') pic.style = 'sketch'
  if (options.pet === 'off') pet.kind = 'off'
  if (typeof options.queue_cap === 'number') queueCap = options.queue_cap


  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await registerCommands($)
    return r
  })

  on('command.run', { command: 'deck' }, async ($, e) => {
    if (String(e.args ?? '').trim() !== 'sync') return { text: helpText() }
    // 설치·리로드는 30초 넘게 걸려 기다리지 않는다 — 끝나면 알림으로 요약을 띄운다.
    void $.process
      .run(['node', `${$.plugin.root}/bin/sync.mjs`], { timeoutMs: 300_000 })
      .then(r => $.ui.toast(`deck sync: ${r.stdout.trim().split('\n').pop() || r.stderr.trim().split('\n').pop() || `exit ${r.exitCode}`}`))
      .catch(error => $.ui.toast(`deck sync 실패: ${String(error)}`))
    return { text: 'deck sync: 두 설정 폴더에 깔고 쉬는 세션을 리로드하는 중 — 끝나면 알림으로 알린다' }
  })

  on('command.run', { command: 'queue' }, async ($, e) => ({ text: await queueCommand($, String(e.args ?? '').trim()) }))

  // /pet: 이 세션에서 숨기기·띄우기만. 아예 끄기는 설정 pet: off.
  on('command.run', { command: 'pet' }, async ($, e) => {
    const off = String(e.args ?? '').trim() === 'off'
    pet.hidden = off
    $.ui.invalidate('ui.render')
    return { text: off ? '펫을 이 세션에서 숨겼다 (/pet 으로 다시)' : '펫을 띄웠다 (/pet off 로 숨김 · 아예 끄기는 /plugin → deck → configure 의 pet)' }
  })

  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      // 엔진이 이 요청에 실은 effort — /effort 로 세션에서만 바꾼 값(max)은 설정 파일에 없다.
      const level = String(e.effort ?? '')
      if (level !== effort) {
        effort = level
        $.ui.invalidate('ui.render')
      }
    }
    yield* next(e)
  })


  on('prompt.submit', async ($, e, next) => {
    const startedAt = await $.clock.now()
    const r = await next(e)
    // 다른 mod 가 메시지를 막았으면 턴이 시작되지 않는다 — 스피너를 돌리지 않는다.
    if (r.drop === undefined) {
      turn = { startedAt, tools: 0, current: '생각 중', agents: 0, edits: new Set() }
      $.ui.invalidate('ui.render')
    }
    return r
  }).catch(($, e, next) => next(e)) // 계기판이 깨져도 프롬프트는 막지 않는다

  on('tool.call', async ($, e, next) => {
    // 커밋 검문: git-commit 스킬 규칙에 걸리면 실행 전에 돌려보낸다 — 고칠 곳을 짚어 주면 모델이 고쳐 다시 한다.
    const why = e.tool === 'Bash' ? await commitCheck($, e.command) : null
    if (why) {
      say(await $.clock.now().catch(() => 0), 'deny', '검문에 걸렸어... 고쳐서 다시!', C.red, 60_000)
      pet.hurtUntil = (await $.clock.now().catch(() => 0)) + 20_000 // 시계를 못 읽어도 검문·결과는 그대로
      return { deny: why }
    }
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
      const r = await next(e)
      const at = await $.clock.now().catch(() => 0) // 시계를 못 읽어도 검문·결과는 그대로
      if (r.isError) {
        pet.hurtUntil = at + 20_000
        say(at, 'error', '앗, 에러...', C.red)
      } else if (e.tool === 'Bash' && readCommit(e.command, cwd)?.commit) say(at, 'commit', '냠! 커밋 깔끔 ✓', C.green, 0)
      return r
    } finally {
      if (t && e.tool === 'Agent') t.agents -= 1
      if (e.tool === 'Bash' || EDITS.has(e.tool)) void refreshGit($)
    }
  }).catch(($, e, next) => next(e))

  // 커밋·PR 에 Claude 서명을 붙이라는 엔진의 지시를 비운다 — 모델이 처음부터 안 쓰게.
  on('attribution.text', ($, e, next) => (e.kind === 'commit' || e.kind === 'pr' ? { text: '' } : next(e)))

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    // 서브에이전트의 턴이 끝난 건 이 대화의 턴이 끝난 게 아니다.
    if (e.agentId) return r
    if (turn) last = { seconds: Math.round(((await $.clock.now()) - turn.startedAt) / 1000), tools: turn.tools, edits: turn.edits.size }
    if (turn && last && last.seconds >= 60) say(await $.clock.now(), 'done', `다 했다! ${elapsed(last.seconds)}`, C.yellow, 0)
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
    // 그림 밑 한 줄: 설명은 흐리게, 버튼은 그림에 포인터를 올렸을 때만. 끝은 늘 ▴ 접기(fk = 이 블록).
    const under = (scope: string, caption: string, fk: string, buttons: RenderElement[]) => (
      <Box flexDirection="row" columnGap={2} minHeight={1}>
        {caption ? <Text dimColor wrap="truncate-end">{caption}</Text> : null}
        <Box display="none" columnGap={2} hover={{ display: 'flex', scope }}>
          {[...buttons, <Button key={`${scope}-fold`} plain dimColor onPress={() => toggleFold($, fk)}>▴ 접기</Button>]}
        </Box>
      </Box>
    )
    // 접은 그림은 그 자리에 한 줄 — 무엇이었는지 흐리게, 옆에 ▾ 펼치기.
    const foldedRow = (fk: string, label: string) =>
      picture(
        <Box flexDirection="row" columnGap={2}>
          <Text dimColor wrap="truncate-end">▸ {label}</Text>
          <Button key={`fold-${fk}`} plain dimColor onPress={() => toggleFold($, fk)}>▾ 펼치기</Button>
        </Box>,
      )
    for (const [n, b] of blocks.entries()) {
      const fk = `${e.requestId}:${n}`
      if (b.kind === 'text') await asText(b.text)
      else if (folded.has(fk)) {
        foldedRow(fk, b.kind === 'mermaid' ? '다이어그램' : b.kind === 'chart' ? `차트 · ${chartTitle(b.spec)}` : b.pictures.map(p => p.alt || (p.path.split('/').pop() ?? p.path)).join(' · '))
      } else if (b.kind === 'mermaid') {
        const d = mode === 'off' ? undefined : mermaidOf($, b.source, mode === 'pictures' ? 'png' : 'text', Math.min(110, width)) // 폭 상한을 키에 — 창 폭이 바뀌어도 다시 안 그린다
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
              {under(scope, '', fk, [<Button key={`${scope}-big`} plain dimColor onPress={() => void openView($, { kind: 'png', title, png: d })}>⤢ 크게 보기</Button>])}
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
              {under(scope, '', fk, [
                <Button key={`${scope}-big`} plain dimColor onPress={() => void openView($, { kind: 'chart', title, spec })}>⤢ 크게 보기</Button>,
                <Button key={`${scope}-save`} plain dimColor onPress={() => void savePng($, d.png, title)}>↓ PNG 저장</Button>,
              ])}
            </Box>,
          )
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
                    {under(scope, title, fk, [<Button key={`${scope}-big`} plain dimColor onPress={() => void openView($, { kind: 'file', title, img })}>⤢ 크게 보기</Button>])}
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
    const fk = e.requestId // tool_use_id — 같은 파일을 두 번 읽어도 따로 접힌다
    if (folded.has(fk)) {
      return (
        <Box flexDirection="column">
          {row}
          <Box paddingLeft={5} flexDirection="row" columnGap={2}>
            <Text dimColor wrap="truncate-end">▸ {title}</Text>
            <Button key={`fold-${fk}`} plain dimColor onPress={() => toggleFold($, fk)}>▾ 펼치기</Button>
          </Box>
        </Box>
      )
    }
    const scope = `deck-r-${img.file.split('/').pop() ?? ''}`.slice(0, 64)
    return (
      <Box flexDirection="column">
        {row}
        <Box paddingLeft={5} flexDirection="column" hover={{ scope }}>
          <Image source={{ file: img.file, format: 'png' }} columns={grid.columns} rows={grid.rows} alt={`[이미지: ${path}]`} />
          <Box flexDirection="row" columnGap={2}>
            <Text dimColor wrap="truncate-end">{title}</Text>
            <Box display="none" columnGap={2} hover={{ display: 'flex', scope }}>
              <Button key={`${scope}-big`} plain dimColor onPress={() => void openView($, { kind: 'file', title, img })}>⤢ 크게 보기</Button>
              <Button key={`${scope}-fold`} plain dimColor onPress={() => toggleFold($, fk)}>▴ 접기</Button>
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
    if (v.kind === 'file') {
      const grid = gridFor(v.img.width, v.img.height, cols, room, pic.cellAspect)
      body = <Image source={{ file: v.img.file, format: 'png' }} columns={grid.columns} rows={grid.rows} alt={v.title} />
      meta = `${v.img.width}×${v.img.height}`
    } else if (v.kind === 'png') {
      // 이미 그린 PNG 를 키워 보인다(1행 40px 로 그려 두어 세 배까지 선명하다).
      const grow = Math.min(3, cols / v.png.columns, room / v.png.rows)
      body = <Image source={{ png: v.png.png }} columns={Math.max(1, Math.floor(v.png.columns * grow))} rows={Math.max(1, Math.floor(v.png.rows * grow))} alt={v.title} />
    } else {
      // 차트는 pane 크기에 맞춰 다시 그린다.
      const d = chartOf($, v.spec, Math.max(20, cols - 1), Math.max(8, room - 1))
      body = !d ? <Text dimColor>그리는 중…</Text>
        : 'error' in d ? <Text dimColor>차트를 그리지 못했다: {d.error}</Text>
        : <Image source={{ png: d.png }} columns={d.columns} rows={d.rows} alt={v.title} />
      if (d && !('error' in d)) save = d.png
    }
    const png = save
    return (
      <Box flexDirection="column" rowGap={1}>
        <Box flexDirection="row" columnGap={2}>
          <Text bold color={C.yellow}>{v.title}</Text>
          {meta ? <Text dimColor>{meta}</Text> : null}
          <Box flexGrow={1} />
          {png ? <Button key="save" plain dimColor hotkey="s" onPress={() => void savePng($, png, v.title)}>↓ PNG 저장</Button> : null}
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
    // 바탕색은 테마 바탕 쪽으로 누그러뜨려(soft) 칠한다.
    const pill = (bg: string, fg: string, text: string, bold = true) => <Text backgroundColor={soft(bg)} color={fg} bold={bold}>{` ${text} `}</Text>
    const label = (bg: string, text: string) => pill(bg, C.ink, text)

    const full = Math.max(20, e.props.bodyColumns)
    // 펫: 100칸 넘을 때만. 그 폭만큼 계기판 알약이 줄어든다.
    const showPet = pet.kind !== 'off' && !pet.hidden && full >= 100
    const petCols = SLIME_COLS
    const cols = showPet ? full - petCols - 2 : full
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
          <Text backgroundColor={C.surface} color={soft(tone)}>{lit}</Text>
          <Text backgroundColor={C.surface} color={C.overlay}>{off}</Text>
          <Text backgroundColor={C.surface} color={C.text} bold>{num}</Text>
        </Text>,
        ` ${name} ${lit}${off}${num}`, p,
      )
    }

    // ── 윗줄: 어디서 ────────────────────────────────────
    const top: Item[] = []
    if (cwd) top.push(pillItem(C.yellow, C.ink, `📁 ${shortPath(cwd, home)}`, 1))
    if (git) {
      const ab = `${git.ahead ? ` ↑${git.ahead}` : ''}${git.behind ? ` ↓${git.behind}` : ''}`
      top.push(pillItem(C.teal, C.ink, `⎇ ${git.branch || '(detached)'}${ab}`, 0))
    }
    // 모델은 브랜치 바로 옆.
    if (model) {
      top.push(pillItem(C.peach, C.ink, `◆ ${model}`, 2))
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
      top.push(pillItem(bg, ci.state === 'other' ? C.sub : C.ink, `CI ${mark} ${ci.name}${ci.at ? ` · ${ago(ci.at, now)}` : ''}`, 5))
    }

    // ── 아랫줄: 얼마나 남았나 ───────────────────────────
    const bottom: Item[] = []
    // 판단 큐: 칸 하나 = /queue 로 올린 에이전트 하나(막힘 빨강 · 결과 나옴 노랑 · 도는 중 파랑 · 쉼 회색).
    // 이 세션이 들었으면 뒤에 ◆ 이 세션, 아니면 ○ 큐 밖(꽉 찼으면 빨강).
    if (queue) {
      const tones = queue.map(i => (i.status === 'blocked' ? C.red : i.status === 'done' ? C.yellow : i.status === 'working' ? C.blue : C.sub))
      const n = Math.max(queueCap, tones.length)
      const tone = tones.length >= queueCap ? C.yellow : C.green
      const num = ` ${tones.length}/${queueCap} `
      bottom.push(item(
        <Text>
          {label(tone, '판단')}
          <Text backgroundColor={C.surface}> </Text>
          {Array.from({ length: n }, (_, i) => <Text backgroundColor={C.surface} color={tones[i] ? soft(tones[i]) : C.overlay}>{tones[i] ? '▰' : '▱'}</Text>)}
          <Text backgroundColor={C.surface} color={C.text} bold>{num}</Text>
        </Text>,
        ` 판단  ${'▰'.repeat(n)}${num}`, 1,
      ))
      const me = queue.find(i => i.pane === pane)
      if (me) bottom.push(pillItem(C.mauve, C.ink, `◆${me.slot} 이 세션`, 1, { glue: true }))
      else if (tones.length >= queueCap) bottom.push(pillItem(C.red, C.ink, '○ 큐 밖', 1, { glue: true }))
      else bottom.push(pillItem(C.surface, C.sub, '○ 큐 밖', 1, { bold: false, glue: true }))
    }
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
    }
    const bottomRight: Item[] = []
    // 펫은 그림만. 5H 80% 를 넘는 순간엔 말풍선.
    const dstate = petState(now)
    const tiredNow = (usage?.limits.find(l => l.kind === 'five_hour')?.percent ?? 0) >= 80
    if (tiredNow && !seen.tired) say(now, '5h', '5H 거의 다 썼어', C.yellow, 3_600_000)
    seen.tired = tiredNow
    if (turn) {
      const parts = [`${SPIN[Math.floor(now / 250) % SPIN.length]} ${elapsed(Math.round((now - turn.startedAt) / 1000))}`, turn.current, `도구 ${turn.tools}`]
      if (turn.edits.size) parts.push(`편집 ${turn.edits.size}`)
      if (turn.agents > 0) parts.push(`에이전트 ${turn.agents}`)
      bottomRight.push(pillItem(C.mauve, C.ink, parts.join('  '), 2))
    } else if (last) {
      const t = `지난 턴 ${elapsed(last.seconds)} · 도구 ${last.tools}${last.edits ? ` · 편집 ${last.edits}` : ''}`
      bottomRight.push(item(<Text color={C.sub}>{t}</Text>, t, 9))
    }
    if (top.length + bottom.length + bottomRight.length === 0) return below

    // 한 줄: 들어가는 알약만, 붙은 것(glue)은 사이 칸 없이. right 는 오른쪽 끝으로 민다.
    const line = (left: Item[], right: Item[], width = cols) => {
      const all = [...left, ...right]
      const keep = fit(all, width)
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
        <Box flexDirection="row" flexGrow={1}>
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

    // 말풍선: 슬라임 바로 왼쪽 위에 둥근 상자(엔진이 테두리를 그린다)를 띄워(absolute) 띠 높이는 그대로 둔다.
    // 상자가 계기판 윗줄 오른쪽 끝에 걸치므로 그동안 윗줄 알약 폭을 그만큼 줄인다.
    const bub = showPet && bubble && now < bubble.until ? bubble : null
    const boxW = bub ? cellWidth(bub.text) + 5 : 0 // 테두리 2 · 안쪽 여백 2 · 꼬리 1
    const dash = (
      <Box flexDirection="column" flexGrow={1} justifyContent="flex-end">
        {files}
        {top.length ? line(top, [], cols - boxW) : null}
        {bottom.length + bottomRight.length ? line(bottom, bottomRight) : null}
      </Box>
    )
    const bubbleEl = bub ? (
      <Box position="absolute" top={0} right={petCols + 2} flexDirection="row" alignItems="center">
        <Box borderStyle="round" borderColor={C.overlay} paddingX={1}>
          <Text color={bub.color} bold>{bub.text}</Text>
        </Box>
        <Text color={C.overlay}>╴</Text>
      </Box>
    ) : null
    if (!showPet) return <Box flexDirection="column">{below}{dash}</Box>
    return (
      <Box flexDirection="column">
        {below}
        <Box flexDirection="row" columnGap={2}>
          {dash}
          {bubbleEl}
          <Box flexDirection="column" width={petCols} flexShrink={0}>
            {slimeRows(dstate, now).map((runs, y) => (
              <Text key={`d${y}`}>{runs.map((r, i) => <Text key={`r${i}`} color={r.fg} backgroundColor={r.bg}>{r.text}</Text>)}</Text>
            ))}
          </Box>
        </Box>
      </Box>
    )
  })
}
