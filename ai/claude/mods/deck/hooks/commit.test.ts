import { expect, test } from 'claude-code/testing'
import { commitProblems, readCommit, type Repo } from './commit'

const check = (command: string, repo?: Repo) => {
  const plan = readCommit(command, '/repo')
  return plan ? commitProblems(plan, repo) : null
}
const heredoc = (msg: string) => `git commit -m "$(cat <<'EOF'\n${msg}\nEOF\n)"`

test('커밋·add 가 아닌 명령은 보지 않는다 — 글 속 git commit · 서명 줄에 속지 않는다', () => {
  expect(check('echo "git commit -m x Co-Authored-By: Claude"')).toBeNull()
  expect(check('python3 - <<EOF\nprint("git commit -a")\nEOF')).toBeNull()
  expect(check('git status && git diff')).toBeNull()
})

test('깨끗한 커밋은 통과', () => {
  expect(check('git add hooks/a.ts && git commit -m "feat(deck): 커밋 검문"')).toEqual([])
  expect(check(heredoc('fix: 줄바꿈\n\n짧은 문장은 그대로 둔다.\n- 목록은\n- 괜찮다'))).toEqual([])
  expect(check('git commit --amend --no-edit')).toEqual([])
  expect(check('git commit -m "style(deck): 연하게"')).toEqual([])
  expect(check('git commit -m "Merge branch \'develop\'"')).toEqual([])
})

test('서명 줄 — Co-Authored-By · Claude-Session · 🤖 Generated with', () => {
  expect(check('git commit -m "feat: x" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"')!.join()).toMatch(/서명 줄/)
  expect(check(heredoc('feat: x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'))!.join()).toMatch(/서명 줄/)
  expect(check('git commit -m "feat: x" -m "Co-Authored-By: Kim <k@x.com>"')).toEqual([])
})

test('한꺼번에 담기 — add -A · add . · commit -a', () => {
  expect(check('git add -A && git commit -m "feat: x"')!.join()).toMatch(/git add -A/)
  expect(check('git add . ')!.join()).toMatch(/한꺼번에/)
  expect(check('git commit -am "feat: x"')!.join()).toMatch(/한꺼번에/)
  expect(check('git add .claude-plugin/plugin.json')).toBeNull()
  expect(check('git commit --amend -m "feat: x"')).toEqual([])
})

test('제목 — type(scope): 제목, type 열한 가지', () => {
  expect(check('git commit -m "커밋 검문 추가"')!.join()).toMatch(/type\(scope\)/)
  expect(check('git commit -m "update: x"')!.join()).toMatch(/`update`/)
  for (const t of ['build', 'ci', 'revert', 'perf']) expect(check(`git commit -m "${t}: x"`)).toEqual([])
})

test('브랜치 prefix 와 type 을 맞춘다, 팀 레포 develop 직접 커밋은 막는다', () => {
  expect(check('git commit -m "feat: x"', { branch: 'fix/sei', team: false })!.join()).toMatch(/`fix`/)
  expect(check('git commit -m "fix: x"', { branch: 'fix/sei', team: true })).toEqual([])
  expect(check('git commit -m "feat: x"', { branch: 'feature/tap', team: true })).toEqual([])
  expect(check('git commit -m "feat: x"', { branch: 'develop', team: true })!.join()).toMatch(/develop 에 바로/)
  expect(check('git commit -m "feat: x"', { branch: 'main', team: false })).toEqual([])
})

test('본문 — 문장 중간 줄바꿈, 표, 열 맞춤', () => {
  const wrapped = 'fix: x\n\n추론 시간 추정치가 마감 예산을 넘으면 영영 추론하지 않던 문제를 고치려고 건너뛸 때마다\n추정치를 줄인다.'
  expect(check(heredoc(wrapped))!.join()).toMatch(/3째 줄이 문장 중간에서 끊겼다/)
  const long = 'fix: x\n\n추론 시간 추정치가 마감 예산을 넘으면 영영 추론하지 않던 문제를 고치려고 건너뛸 때마다 추정치를 줄인다.\n다음 문장은 새 줄에서 시작한다.'
  expect(check(heredoc(long))).toEqual([])
  expect(check(heredoc('docs: x\n\n| 값 | 뜻 |\n|---|---|'))!.join()).toMatch(/표다/)
  expect(check(heredoc('docs: x\n\nSEI_DELAY_MS    기본 2500'))!.join()).toMatch(/열을 맞췄다/)
})
