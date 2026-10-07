import type { EngineInterface, Register } from 'claude-code'

import { ago, barCells, ciFromGithub, ciFromGitlab, elapsed, modelName, parseGit, shortPath, sparkline, tokensOf, untilText, type Ci, type Git, type Slice } from './board'

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
// 프롬프트 캐시는 마지막 요청 뒤 1시간(구독 기본) 지나면 식는다. 이 세션에서 본 마지막 요청 시각.
// 리로드 직후엔 모른다 — 다음 턴까지 알약을 숨긴다.
const CACHE_TTL = 60 * 60_000
let lastRequestAt = 0

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

const level = (percent: number) => (percent >= 80 ? C.red : percent >= 50 ? C.yellow : C.green)

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    turn = { startedAt: await $.clock.now(), tools: 0, current: '생각 중', agents: 0, edits: new Set() }
    $.ui.invalidate('ui.render')
    return next(e)
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
      // 도구 결과는 곧 다음 요청으로 이어진다.
      lastRequestAt = await $.clock.now()
      if (t && e.tool === 'Agent') t.agents -= 1
      if (e.tool === 'Bash' || EDITS.has(e.tool)) void refreshGit($)
    }
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    lastRequestAt = await $.clock.now()
    if (turn) last = { seconds: Math.round(((await $.clock.now()) - turn.startedAt) / 1000), tools: turn.tools, edits: turn.edits.size }
    turn = null
    void refreshGit($)
    void refreshUsage($).then(() => {
      if (usage) history.push(usage.percent)
      if (history.length > 16) history.shift()
    })
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

    // ── 윗줄: 어디서 무엇을 ─────────────────────────────
    const top = []
    if (model) {
      top.push(
        <Text>
          {pill(C.peach, C.base, `◆ ${model}`)}
          {effort ? pill(C.overlay, C.peach, effort, false) : null}
        </Text>,
      )
    }
    if (cwd) top.push(pill(C.surface, C.text, shortPath(cwd, home), false))
    if (git) {
      const ab = `${git.ahead ? ` ↑${git.ahead}` : ''}${git.behind ? ` ↓${git.behind}` : ''}`
      top.push(pill(C.blue, C.base, `⎇ ${git.branch || '(detached)'}${ab}`))
      top.push(
        git.files.length > 0 ? (
          <Box hover={{ scope: FILES }}>
            <Text backgroundColor={C.surface} color={C.yellow} bold>{` ● ${git.files.length} `}</Text>
            <Text backgroundColor={C.surface} color={C.green}>{`+${git.added} `}</Text>
            <Text backgroundColor={C.surface} color={C.red}>{`−${git.deleted} `}</Text>
          </Box>
        ) : (
          pill(C.surface, C.green, '✓ 깨끗', false)
        ),
      )
    }
    if (ci) {
      const [bg, mark] = ci.state === 'ok' ? [C.green, '✓'] : ci.state === 'fail' ? [C.red, '✗'] : ci.state === 'run' ? [C.yellow, '⟳'] : [C.surface, '·']
      top.push(pill(bg, ci.state === 'other' ? C.sub : C.base, `CI ${mark} ${ci.name}${ci.at ? ` · ${ago(ci.at, now)}` : ''}`))
    }
    let work = null
    if (turn) {
      const parts = [`${SPIN[Math.floor(now / 250) % SPIN.length]} ${elapsed(Math.round((now - turn.startedAt) / 1000))}`, turn.current, `도구 ${turn.tools}`]
      if (turn.edits.size) parts.push(`편집 ${turn.edits.size}`)
      if (turn.agents > 0) parts.push(`에이전트 ${turn.agents}`)
      work = pill(C.mauve, C.base, parts.join('  '))
    } else if (last) {
      work = <Text color={C.sub}>{`지난 턴 ${elapsed(last.seconds)} · 도구 ${last.tools}${last.edits ? ` · 편집 ${last.edits}` : ''}`}</Text>
    }

    // ── 아랫줄: 얼마나 남았나 ───────────────────────────
    const bottom = []
    if (usage) {
      const u = usage
      const cells = barCells(u.slices, u.window, BAR)
      const used = cells.reduce((n, c) => n + c.cells, 0)
      // 자동 압축이 시작되는 자리에 눈금.
      const mark = u.compactAt ? Math.min(BAR - 1, Math.round((u.compactAt / u.window) * BAR)) : -1
      const free = Array.from({ length: Math.max(0, BAR - used) }, (_, i) => (used + i === mark ? '┃' : '░')).join('')
      bottom.push(
        <Box hover={{ scope: CTX }}>
          {label(level(u.percent), u.percent >= 80 ? 'CTX 압축 임박' : 'CTX')}
          <Text backgroundColor={C.surface} color={level(u.percent)} bold>{` ${u.percent}% `}</Text>
          <Text backgroundColor={C.surface}>
            {cells.map(c => <Text color={c.color}>{'█'.repeat(c.cells)}</Text>)}
            <Text color={C.overlay}>{free}</Text>
          </Text>
          <Text backgroundColor={C.surface} color={C.sub}>{` ${tokensOf(u.tokens)}/${tokensOf(u.window)} `}</Text>
          {history.length > 1 ? <Text backgroundColor={C.surface} color={C.teal}>{`${sparkline(history)} `}</Text> : null}
        </Box>,
      )
      for (const l of u.limits) {
        const name = l.kind === 'five_hour' ? '5H' : l.kind === 'seven_day' ? '7D' : l.kind === 'spend_limit' ? '한도' : l.kind
        const filled = Math.min(8, Math.round((l.percent / 100) * 8))
        bottom.push(
          <Text>
            {label(level(l.percent), name)}
            <Text backgroundColor={C.surface} color={level(l.percent)}>{` ${'▰'.repeat(filled)}`}</Text>
            <Text backgroundColor={C.surface} color={C.overlay}>{'▱'.repeat(8 - filled)}</Text>
            <Text backgroundColor={C.surface} color={C.text} bold>{` ${Math.round(l.percent)}% `}</Text>
            {l.resetsAt ? <Text backgroundColor={C.surface} color={C.sub}>{`⟲${untilText(l.resetsAt, now)} `}</Text> : null}
          </Text>,
        )
      }
      if (u.usd !== undefined) {
        const hours = (now - u.startedAt) / 3_600_000
        bottom.push(
          <Text>
            {label(C.green, `$${u.usd.toFixed(2)}`)}
            {hours > 0.1 ? <Text backgroundColor={C.surface} color={C.peach}>{` 🔥 $${(u.usd / hours).toFixed(1)}/h `}</Text> : null}
          </Text>,
        )
      }
    }
    if (turn) bottom.push(label(C.teal, '☕ 캐시 데우는 중'))
    else if (lastRequestAt) {
      const left = lastRequestAt + CACHE_TTL - now
      bottom.push(
        left > 0
          ? <Text>{label(left < 10 * 60_000 ? C.yellow : C.teal, '☕ 캐시')}<Text backgroundColor={C.surface} color={C.text}>{` ${untilText(lastRequestAt + CACHE_TTL, now)} 남음 `}</Text></Text>
          : <Text>{label(C.red, '🧊 캐시 식음')}<Text backgroundColor={C.surface} color={C.sub}>{usage ? ` 다음 요청이 ${tokensOf(usage.tokens)} 다시 씀 ` : ' '}</Text></Text>,
      )
    }
    if (top.length === 0 && bottom.length === 0) return below

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
        <Box flexDirection="row" columnGap={1}>
          {top}
          <Box flexGrow={1} />
          {work}
        </Box>
        {bottom.length ? <Box flexDirection="row" columnGap={1}>{bottom}</Box> : null}
      </Box>
    )
  })
}
