// 커밋 검문 — git-commit 스킬 규칙 중 기계로 가를 수 있는 것만. 판단(왜를 쓰기·나누기·스쿼시)은 스킬 몫이다.
// $ 를 안 쓴다: 명령을 읽고(readCommit), 저장소 사정(브랜치·팀 레포)을 받아 걸리는 곳을 문장으로 돌려준다(commitProblems).
import { cellWidth, claudeTrailer } from './board'

export const TYPES = ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'chore', 'style', 'build', 'ci', 'revert']
// 브랜치 prefix → 맞는 커밋 type. 목록에 없는 브랜치(develop·main·이름만 있는 것)는 따지지 않는다.
const BRANCH_TYPE: Record<string, string> = {
  feature: 'feat', feat: 'feat', fix: 'fix', bugfix: 'fix', hotfix: 'fix',
  refactor: 'refactor', perf: 'perf', test: 'test', docs: 'docs', chore: 'chore', style: 'style', build: 'build', ci: 'ci',
}
const MAIN = new Set(['develop', 'main', 'master'])

export type CommitPlan = {
  bulkAdd: string | null // git add -A · git add . · git commit -a 중 걸린 것
  commit: boolean
  message: string | null // -m 들(빈 줄로 이음) 또는 heredoc 본문. 편집기로 쓰거나 --no-edit 면 null
  dir: string | null // 커밋이 도는 곳(-C · 앞의 cd). 모르면 null — 그럼 브랜치 규칙은 건너뛴다
  command: string
}
export type Repo = { branch: string; team: boolean }

// 따옴표 속 글과 heredoc 본문을 걷어 낸 명령 — 메시지 안의 ; · && · -a 에 속지 않게.
function bare(command: string): string {
  return command
    .replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1\b/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, ' Q ')
}

function subcommand(tokens: string[]): { sub: string; dir: string | null; rest: string[] } | null {
  if (!/(^|\/)git$/.test(tokens[0] ?? '')) return null
  let dir: string | null = null
  let i = 1
  while (i < tokens.length && tokens[i]!.startsWith('-')) {
    if (tokens[i] === '-C') dir = tokens[i + 1] ?? null
    i += tokens[i] === '-C' || tokens[i] === '-c' ? 2 : 1
  }
  return { sub: tokens[i] ?? '', dir, rest: tokens.slice(i + 1) }
}

function unquote(raw: string): string {
  if (raw.startsWith("'")) return raw.slice(1, -1)
  if (raw.startsWith('"')) return raw.slice(1, -1).replace(/\\(["\\$`])/g, '$1')
  return raw
}

export function readCommit(command: string, cwd: string): CommitPlan | null {
  const parts = bare(command).split(/&&|\|\||[;|\n]/).map(p => p.trim().split(/\s+/).filter(Boolean))
  let bulkAdd: string | null = null
  let commit = false
  let dir: string | null = cwd
  let here: string | null = cwd
  for (const tokens of parts) {
    if (tokens[0] === 'cd') here = tokens[1] && tokens[1] !== 'Q' && !tokens[1].startsWith('~') ? join(here, tokens[1]) : null
    const g = subcommand(tokens)
    if (!g) continue
    if (g.sub === 'add' && g.rest.some(t => t === '-A' || t === '--all' || t === '.')) bulkAdd = `git add ${g.rest.join(' ')}`
    if (g.sub === 'commit') {
      commit = true
      if (g.rest.some(t => t === '--all' || /^-[a-zA-Z]*a[a-zA-Z]*$/.test(t))) bulkAdd = `git commit ${g.rest.filter(t => t !== 'Q').join(' ')}`
      dir = g.dir === null ? here : g.dir === 'Q' || g.dir.startsWith('~') ? null : join(here, g.dir)
    }
  }
  if (!commit && !bulkAdd) return null
  let message: string | null = null
  if (commit) {
    // 메시지는 git commit 뒤에서만 찾는다 — 앞선 다른 명령의 heredoc(스크립트)을 메시지로 읽지 않게.
    const spans = [...command.matchAll(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1\b/g)].map(h => [h.index, h.index + h[0].length] as const)
    const at = [...command.matchAll(/\bgit\b[^\n;&|]*?\bcommit\b/g)].find(c => !spans.some(([a, b]) => c.index > a && c.index < b))?.index ?? 0
    const tail = command.slice(at)
    const heredoc = /<<-?\s*['"]?(\w+)['"]?[^\n]*\n([\s\S]*?)\n\s*\1\b/.exec(tail)
    if (heredoc) message = heredoc[2]!
    else {
      const ms = [...tail.matchAll(/(?:^|\s)(?:-[a-zA-Z]*m|--message)(?:\s+|=)("(?:[^"\\]|\\.)*"|'[^']*'|[^\s;&|]+)/g)].map(m => unquote(m[1]!))
      if (ms.length) message = ms.join('\n\n')
    }
  }
  return { bulkAdd, commit, message, dir, command }
}

function join(base: string | null, path: string): string | null {
  if (path.startsWith('/')) return path
  return base === null ? null : `${base}/${path}`
}

// 문장 끝 = 문장부호로 끝난 줄. 한글 어미(다·요)로는 가르지 않는다 — "때마다"처럼 문장 중간에도 온다.
const SENTENCE_END = /[.!?。:;…)\]」』"'`]$/
const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s/

export function commitProblems(plan: CommitPlan, repo?: Repo): string[] {
  const out: string[] = []
  const sig = plan.commit ? claudeTrailer(plan.command) : null
  if (sig) out.push(`Claude 서명 줄(${sig})을 뺀다 — 이 사용자는 커밋에 트레일러를 넣지 않는다.`)
  if (plan.bulkAdd) out.push(`\`${plan.bulkAdd}\` 로 한꺼번에 담지 않는다 — 확인한 파일만 이름으로 \`git add\` 한다.`)
  if (plan.commit && repo && repo.team && MAIN.has(repo.branch)) out.push(`팀 레포의 ${repo.branch} 에 바로 커밋하지 않는다 — feature/* · fix/* 브랜치에서 한다(task-flow).`)
  const msg = plan.message
  if (msg === null) return out
  const lines = msg.split('\n')
  const title = lines[0]!.trim()
  if (/^(Merge |Revert "|fixup! |squash! |amend! )/.test(title)) return out
  const m = /^([a-z]+)(\([^)]*\))?!?: \S/.exec(title)
  if (!m) out.push(`제목 「${title}」 이 \`type(scope): 제목\` 꼴이 아니다 — type 은 ${TYPES.join(' · ')}.`)
  else if (!TYPES.includes(m[1]!)) out.push(`제목의 type \`${m[1]}\` 은 쓰지 않는다 — ${TYPES.join(' · ')} 중 하나.`)
  else if (repo) {
    const want = BRANCH_TYPE[repo.branch.split('/')[0]!]
    if (repo.branch.includes('/') && want && want !== m[1]) out.push(`브랜치 ${repo.branch} 에서는 제목 type 을 \`${want}\` 로 맞춘다(지금 \`${m[1]}\`).`)
  }
  let fence = false
  lines.forEach((raw, i) => {
    if (i === 0) return
    const line = raw.trimEnd()
    if (/^\s*```/.test(line)) fence = !fence
    if (fence || !line.trim()) return
    const n = i + 1
    if (/^\s*\|/.test(line) || (line.match(/\|/g)?.length ?? 0) >= 2) out.push(`${n}째 줄이 표다 — 표 대신 문장이나 목록으로 쓴다.`)
    else if (/\S {2,}\S/.test(line.trim())) out.push(`${n}째 줄이 공백으로 열을 맞췄다 — 정렬하지 말고 한 칸만 띄운다.`)
    const next = lines[i + 1]?.trimEnd() ?? ''
    if (cellWidth(line) >= 60 && !SENTENCE_END.test(line) && next.trim() && !LIST_ITEM.test(next) && !/^\s*```/.test(next))
      out.push(`${n}째 줄이 문장 중간에서 끊겼다 — 폭을 맞추려 끊지 말고 ${n + 1}째 줄과 한 줄로 잇는다.`)
  })
  return out
}
