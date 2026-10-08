// 화면도 엔진도 모르는 규칙만 — 테스트가 여기를 본다.

export type Git = { branch: string; ahead: number; behind: number; files: { code: string; path: string }[]; added: number; deleted: number }
export type Ci = { state: 'ok' | 'fail' | 'run' | 'other'; name: string; url: string; at: number }

// `git status --porcelain=v2 --branch` 와 `git diff --numstat HEAD` 를 합친다.
export function parseGit(status: string, numstat: string): Git {
  const git: Git = { branch: '', ahead: 0, behind: 0, files: [], added: 0, deleted: 0 }
  for (const line of status.split('\n')) {
    // 커밋이 하나도 없는 저장소는 git 이 (unknown) 이라고 답한다.
    if (line.startsWith('# branch.head ')) git.branch = line.slice(14) === '(unknown)' ? '커밋 없음' : line.slice(14)
    else if (line.startsWith('# branch.ab ')) {
      const [a, b] = line.slice(12).split(' ')
      git.ahead = Math.abs(Number(a) || 0)
      git.behind = Math.abs(Number(b) || 0)
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      // 1 XY sub mH mI mW hH hI path / 2 … path\torig
      const parts = line.split(' ')
      const xy = parts[1] ?? '..'
      const path = parts.slice(line.startsWith('1 ') ? 8 : 9).join(' ').split('\t')[0] ?? ''
      git.files.push({ code: (xy[0] !== '.' ? xy[0] : xy[1]) ?? 'M', path })
    } else if (line.startsWith('? ')) git.files.push({ code: '?', path: line.slice(2) })
    else if (line.startsWith('u ')) git.files.push({ code: 'U', path: line.split(' ').slice(10).join(' ') })
  }
  for (const line of numstat.split('\n')) {
    const [a, d] = line.split('\t')
    git.added += Number(a) || 0
    git.deleted += Number(d) || 0
  }
  return git
}

// `gh run list --json status,conclusion,updatedAt,workflowName,url` 의 첫 줄.
export function ciFromGithub(json: string): Ci | null {
  const run = (JSON.parse(json || '[]') as { status?: string; conclusion?: string; updatedAt?: string; workflowName?: string; url?: string }[])[0]
  if (!run) return null
  const state = run.status !== 'completed' ? 'run' : run.conclusion === 'success' ? 'ok' : run.conclusion === 'failure' ? 'fail' : 'other'
  return { state, name: run.workflowName ?? 'CI', url: run.url ?? '', at: Date.parse(run.updatedAt ?? '') || 0 }
}

// `glab ci list -F json` 의 첫 줄.
export function ciFromGitlab(json: string): Ci | null {
  const run = (JSON.parse(json || '[]') as { status?: string; updated_at?: string; web_url?: string; ref?: string }[])[0]
  if (!run) return null
  const s = run.status ?? ''
  const state = s === 'success' ? 'ok' : s === 'failed' ? 'fail' : ['running', 'pending', 'created', 'preparing', 'waiting_for_resource'].includes(s) ? 'run' : 'other'
  return { state, name: 'pipeline', url: run.web_url ?? '', at: Date.parse(run.updated_at ?? '') || 0 }
}

// 72 → "1m12s", 9 → "9s"
export const elapsed = (seconds: number): string => (seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`)

// 지난 시각을 "방금 · 3분 전 · 2시간 전 · 5일 전" 으로.
export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return '방금'
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  return `${Math.floor(s / 86400)}일 전`
}

// 컨텍스트 막대: 분류마다 차지한 칸 수. 칸이 모자라도 쓴 분류는 한 칸은 받는다. 나머지는 빈칸.
export type Slice = { name: string; tokens: number; color: string }
export function barCells(slices: Slice[], window: number, width: number): { color: string; cells: number; name: string }[] {
  if (window <= 0) return []
  const used = slices.filter(s => s.tokens > 0)
  const out = used.map(s => ({ name: s.name, color: s.color, cells: Math.max(1, Math.round((s.tokens / window) * width)) }))
  // 반올림이 넘치면 가장 큰 분류에서 덜어 낸다.
  let over = out.reduce((n, s) => n + s.cells, 0) - width
  while (over > 0) {
    const big = out.reduce((a, b) => (b.cells > a.cells ? b : a))
    if (big.cells <= 1) break
    big.cells -= 1
    over -= 1
  }
  return out
}

// 325_412 → "325k", 1_000_000 → "1M"
export const tokensOf = (n: number): string => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

// claude-opus-5-5 → "Opus 5.5", claude-haiku-4-5-20251001 → "Haiku 4.5", 그 밖은 그대로.
export function modelName(id: string): string {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/i.exec(id)
  if (!m) return id
  const name = (m[1] ?? '').replace(/^./, c => c.toUpperCase())
  return m[3] && m[3].length <= 2 ? `${name} ${m[2]}.${m[3]}` : `${name} ${m[2]}`
}

// /Users/x/Documents/m1ucs/com.m1ucs/detector → "~/…/com.m1ucs/detector"
export function shortPath(path: string, home: string): string {
  const p = home && path.startsWith(home) ? `~${path.slice(home.length)}` : path
  const parts = p.split('/').filter(Boolean)
  return parts.length <= 3 ? p : `${p.startsWith('~') ? '~' : ''}/…/${parts.slice(-2).join('/')}`
}

// 남은 시간: "42m" · "2h22m" · "3d3h"
export function untilText(at: number, now: number): string {
  const m = Math.max(0, Math.round((at - now) / 60_000))
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(m / 1440)}d${Math.floor((m % 1440) / 60)}h`
}

// 0~100 값들을 ▁▂▃▄▅▆▇█ 로.
export const sparkline = (values: number[]): string => values.map(v => '▁▂▃▄▅▆▇█'[Math.min(7, Math.max(0, Math.floor((v / 100) * 8)))] ?? '▁').join('')

// 터미널 칸 수: 한글·한자·전각과 그림 문자(☕🔥🧊⏸ 등)는 2칸, 나머지는 1칸.
export function cellWidth(text: string): number {
  let n = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    const wide =
      (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x23e9 && c <= 0x23fa) || c === 0x2614 || c === 0x2615 || (c >= 0x1f300 && c <= 0x1faff)
    if (c === 0xfe0f || c === 0x200d) continue
    n += wide ? 2 : 1
  }
  return n
}

// 한 줄에 다 안 들어가면 덜 중요한 것(p 가 큰 것)부터 뺀다. glue 는 앞 알약에 붙어 사이 칸이 없다.
export type Fit = { w: number; p: number; glue?: boolean }
export function fit(items: Fit[], cols: number): boolean[] {
  const keep = items.map(() => true)
  const total = () => {
    let n = 0
    let first = true
    items.forEach((it, i) => {
      if (!keep[i]) return
      n += it.w + (first || it.glue ? 0 : 1)
      first = false
    })
    return n
  }
  while (total() > cols) {
    let drop = -1
    items.forEach((it, i) => {
      if (keep[i] && (drop < 0 || it.p >= (items[drop]?.p ?? -1))) drop = i
    })
    if (drop < 0) break
    keep[drop] = false
  }
  return keep
}
