// 삭제 검수 — rm · rmdir · git clean -f 를 실행 전에 멈추고 사람에게 대상을 보여 준다.
// $ 를 안 쓴다: 명령을 읽고(readRemoves), 읽기 전용 조회 결과로 칸을 나누고(classify), 질문창 글을 만든다(askText).
import { cellWidth } from './board'

export type Remove = {
  kind: 'rm' | 'clean'
  dir: string // 이 명령이 도는 곳
  targets: string[] // 절대 경로(rm). clean 은 비어 있고 git clean -n 이 채운다
  unresolved: string[] // 글롭·변수·~user 처럼 미리 펼칠 수 없는 인자
  cleanArgs: string[] // git clean 의 인자(-f 를 -n 으로 바꿔 미리 보기로 돌린다)
}

// 따옴표·백슬래시를 아는 토큰 나누기. 따옴표 밖의 ; && || | & 줄바꿈은 명령 경계(빈 토큰 '\0').
export function tokenize(command: string): { text: string; quoted: boolean }[] {
  const out: { text: string; quoted: boolean }[] = []
  let cur = ''
  let quoted = false
  let has = false
  const push = () => {
    if (has) out.push({ text: cur, quoted })
    cur = ''
    quoted = false
    has = false
  }
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    if (c === "'") {
      const end = command.indexOf("'", i + 1)
      cur += command.slice(i + 1, end < 0 ? undefined : end)
      i = end < 0 ? command.length : end
      quoted = has = true
    } else if (c === '"') {
      let j = i + 1
      for (; j < command.length && command[j] !== '"'; j++) {
        if (command[j] === '\\' && j + 1 < command.length) j++
        cur += command[j]
      }
      i = j
      quoted = has = true
    } else if (c === '\\' && i + 1 < command.length) {
      cur += command[++i]
      has = true
    } else if (/\s/.test(c) && c !== '\n') push()
    else if (c === ';' || c === '\n' || c === '&' || c === '|') {
      push()
      if (out.at(-1)?.text !== '\0') out.push({ text: '\0', quoted: false })
      if (command[i + 1] === c) i++
    } else {
      cur += c
      has = true
    }
  }
  push()
  return out
}

function resolve(base: string, path: string, home: string): string | null {
  if (path === '~' || path.startsWith('~/')) return home ? home + path.slice(1) : null
  if (path.startsWith('~')) return null
  const parts = (path.startsWith('/') ? path : `${base}/${path}`).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (!p || p === '.') continue
    if (p === '..') out.pop()
    else out.push(p)
  }
  return `/${out.join('/')}`
}

const WRAPPERS = new Set(['sudo', 'command', 'builtin', 'exec', 'nice', 'nohup', 'time', 'xargs'])

// 명령 안의 삭제들. 없으면 빈 목록. 앞의 cd 는 따라간다(못 따라가면 dir 을 '' 로 — 대상 확정 못 함).
export function readRemoves(command: string, cwd: string, home: string): Remove[] {
  const tokens = tokenize(command)
  const segments: { text: string; quoted: boolean }[][] = [[]]
  for (const t of tokens) t.text === '\0' ? segments.push([]) : segments.at(-1)!.push(t)
  const out: Remove[] = []
  let here = cwd
  for (const seg of segments) {
    // 앞의 VAR=값 · sudo · xargs 같은 감싸개(와 바로 뒤 옵션)는 건너뛴다. xargs 면 대상은 입력에서 오니 확정 못 함.
    let k = 0
    let piped = false
    while (seg[k]) {
      const t = seg[k]!.text
      if (WRAPPERS.has(t)) piped ||= t === 'xargs'
      else if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(t) && !(t.startsWith('-') && k > 0 && WRAPPERS.has(seg[k - 1]!.text))) break
      k++
    }
    const [head, ...rest] = seg.slice(k)
    if (!head) continue
    const name = head.text.split('/').pop()
    if (name === 'cd') {
      const to = rest[0]?.text
      here = to === undefined ? home : /[$`*?]/.test(to) ? '' : here ? resolve(here, to, home) ?? '' : ''
      continue
    }
    if (name === 'rm' || name === 'rmdir' || name === 'unlink') {
      const r: Remove = { kind: 'rm', dir: here, targets: [], unresolved: [], cleanArgs: [] }
      let opts = true
      for (const t of rest) {
        if (opts && t.text === '--') opts = false
        else if (opts && t.text.startsWith('-') && !t.quoted && t.text !== '-') continue
        else if (!here || (!t.quoted && /[*?[{$`]/.test(t.text)) || (t.quoted && /[$`]/.test(t.text))) r.unresolved.push(t.text)
        else {
          const p = resolve(here, t.text, home)
          p ? r.targets.push(p) : r.unresolved.push(t.text)
        }
      }
      if (piped) r.unresolved.push('(xargs 입력)')
      if (r.targets.length || r.unresolved.length) out.push(r)
      continue
    }
    if (name === 'git') {
      let i = 0
      let dir = here
      while (rest[i] && rest[i]!.text.startsWith('-')) {
        if (rest[i]!.text === '-C' && rest[i + 1]) dir = dir ? resolve(dir, rest[i + 1]!.text, home) ?? '' : ''
        i += rest[i]!.text === '-C' || rest[i]!.text === '-c' ? 2 : 1
      }
      if (rest[i]?.text !== 'clean') continue
      const args = rest.slice(i + 1).map(t => t.text)
      const forced = args.some(a => a === '--force' || /^-[a-zA-Z]*f/.test(a))
      const dry = args.some(a => a === '--dry-run' || /^-[a-zA-Z]*n/.test(a))
      if (!forced || dry) continue
      const cleanArgs = args.filter(a => a !== '--force').map(a => (/^-[a-zA-Z]+$/.test(a) ? a.replace(/f/g, '') : a)).filter(a => a !== '-')
      out.push({ kind: 'clean', dir, targets: [], unresolved: dir ? [] : ['(위치 모름)'], cleanArgs: ['-n', ...cleanArgs] })
    }
  }
  return out
}

// 묻지 않고 넘기는 곳: 임시 폴더와 다시 만들어지는 산출물 폴더. 대상이 전부 여기 들 때만.
const DISPOSABLE = new Set(['node_modules', 'dist', 'build', '.next', '.cache', '__pycache__', '.turbo', '.pytest_cache', 'coverage'])
export function disposable(path: string, tmpRoots: string[]): boolean {
  if (tmpRoots.some(r => r && (path === r || path.startsWith(`${r.replace(/\/$/, '')}/`)))) return true
  return path.split('/').some(p => DISPOSABLE.has(p))
}

export type Entry = { path: string; why: 'outside' | 'untracked' | 'ignored' | 'modified' | 'clean' | 'missing' }
export const LOST = new Set<Entry['why']>(['outside', 'untracked', 'ignored', 'modified'])

// git status --porcelain -z --ignored -uall → 저장소 기준 경로별 코드. 이름 바뀜(R·C)은 뒤따르는 옛 경로를 건너뛴다.
export function porcelain(out: string): Map<string, string> {
  const m = new Map<string, string>()
  const recs = out.split('\0')
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i]!
    if (r.length < 4) continue
    const code = r.slice(0, 2)
    m.set(r.slice(3), code)
    if (/[RC]/.test(code)) i++
  }
  return m
}

// 한 파일의 칸: 저장소 밖이면 outside, 아니면 git status 코드로.
export function whyOf(code: string | undefined, inRepo: boolean): Entry['why'] {
  if (!inRepo) return 'outside'
  if (code === undefined) return 'clean'
  if (code === '??') return 'untracked'
  if (code === '!!') return 'ignored'
  return 'modified'
}

const MARK: Record<Entry['why'], string> = { outside: 'git 밖', untracked: '추적 안 함', ignored: 'gitignore', modified: '고친 채', clean: '', missing: '' }

export function sizeText(kb: number): string {
  return kb >= 1024 * 1024 ? `${(kb / 1024 / 1024).toFixed(1)}GB` : kb >= 1024 ? `${(kb / 1024).toFixed(1)}MB` : `${kb}KB`
}

// 질문창: 한 줄 요약(선택지 설명)과 미리 보기(대상 목록). 미리 보기는 칸마다 앞의 몇 개만.
export function askText(o: { command: string; dir: string; home: string; entries: Entry[]; more: boolean; unresolved: string[]; kb: number }): { summary: string; preview: string } {
  const short = (p: string) => {
    const rel = o.dir && p.startsWith(`${o.dir}/`) ? p.slice(o.dir.length + 1) : p
    return o.home && rel.startsWith(`${o.home}/`) ? `~${rel.slice(o.home.length)}` : rel
  }
  const lost = o.entries.filter(e => LOST.has(e.why))
  const safe = o.entries.filter(e => e.why === 'clean')
  const missing = o.entries.filter(e => e.why === 'missing')
  const files = lost.length + safe.length
  const parts = [`파일 ${files}${o.more ? '+' : ''}개`, sizeText(o.kb)]
  const summary = `${parts.join(' · ')} — ${lost.length ? `되살릴 수 없는 것 ${lost.length}${o.more ? '+' : ''}개` : '전부 git 으로 되살릴 수 있다'}${o.unresolved.length ? ' · 대상 확정 못 함 ⚠' : ''}`
  const width = Math.max(0, ...lost.slice(0, 8).map(e => cellWidth(short(e.path))))
  const lines = [`$ ${o.command.length > 200 ? `${o.command.slice(0, 200)}…` : o.command}`, `위치 ${o.dir ? short(o.dir) || o.dir : '(모름)'}`, '']
  if (o.unresolved.length) lines.push(`⚠ 대상 확정 못 함 (글롭·변수) — ${o.unresolved.join(' ')}`, '')
  lines.push(`✗ 되살릴 수 없음  ${lost.length}${o.more ? '+' : ''}`)
  for (const e of lost.slice(0, 8)) lines.push(`  ${short(e.path)}${' '.repeat(width - cellWidth(short(e.path)) + 2)}(${MARK[e.why]})`)
  if (lost.length > 8) lines.push(`  … 외 ${lost.length - 8}개`)
  lines.push(`✓ git 으로 되살림  ${safe.length}`)
  if (safe.length) lines.push(`  ${safe.slice(0, 4).map(e => short(e.path)).join('  ')}${safe.length > 4 ? `  … 외 ${safe.length - 4}개` : ''}`)
  if (missing.length) lines.push(`· 없는 경로  ${missing.length}`, `  ${missing.slice(0, 4).map(e => short(e.path)).join('  ')}`)
  return { summary, preview: lines.join('\n') }
}

// 삭제 검수 창(questions 하나, 그 질문)이면 선택지에 설명과 대상 목록을 단 questions, 아니면 null.
export function decorate(questions: unknown[], ask: string, a: { summary: string; preview: string }): unknown[] | null {
  const q = questions[0] as { question?: string; options?: { label: string }[] } | undefined
  if (questions.length !== 1 || q?.question !== ask) return null
  const options = (q.options ?? []).map(o => ({ ...o, description: o.label === '삭제 진행' ? a.summary : '명령을 막고 Claude 에게 취소됐다고 알린다', preview: a.preview }))
  return [{ ...q, options }]
}
