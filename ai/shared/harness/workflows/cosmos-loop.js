export const meta = {
  name: 'cosmos-loop',
  description: 'cosmos dev→qe 루프(최대 3회)를 돌고, PASS면 ops로 커밋한다',
  whenToUse: '/cosmos 가 planner 승인과 워크트리 생성을 끝낸 뒤 호출한다. 사람이 낄 일이 없는 구간만 맡는다.',
  phases: [
    { title: 'Dev', detail: 'spec 구현 (재시도면 직전 QE 확정 실패만 전달)' },
    { title: 'QE', detail: 'Acceptance Criteria 검증' },
    { title: 'Ops', detail: '로컬 커밋' },
  ],
}

const { spec, specPath = 'spec', worktree, learning = '', deploy = '' } = args ?? {}
if (!spec || !worktree) throw new Error('args.spec(전문)과 args.worktree(작업 경로)가 필요하다')

// 스키마는 코드가 분기·전달에 쓰는 값만 강제한다. 나머지는 에이전트 프롬프트가
// 이미 형식을 정해뒀고, 필수 필드를 늘릴수록 StructuredOutput 재시도가 늘어난다.
const VERDICT = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    confirmed: { type: 'array', items: { type: 'string' }, description: '확정 실패. 재시도 시 dev 에게 이것만 간다' },
    suspected: { type: 'array', items: { type: 'string' } },
    regression: { type: 'string' },
  },
  required: ['verdict', 'confirmed'],
}
const OPS = {
  type: 'object',
  properties: { sha: { type: 'string' }, branch: { type: 'string' }, staged: { type: 'array', items: { type: 'string' } } },
  required: ['sha', 'branch'],
}

const base = `## spec (${specPath})\n${spec}\n\n## 작업 경로 — 모든 작업을 여기서 한다\n${worktree}\n` +
  (learning ? `\n## LEARNING.md (대상 프로젝트)\n${learning}\n` : '')

const attempts = []

for (let n = 1; n <= 3; n++) {
  const prev = attempts.at(-1)
  const dev = await agent(
    base + (prev ? `\n## 직전 QE 확정 실패 — 이것만 고친다. spec 을 재해석하지 않는다\n${prev.qe.confirmed.join('\n')}\n` : ''),
    { agentType: 'cosmos-dev', phase: 'Dev', label: `dev:${n}` },
  )

  const qe = await agent(
    base + `\n## dev 리포트\n${dev ?? '(없음 — 워크트리를 직접 확인한다)'}\n`,
    { agentType: 'cosmos-qe', phase: 'QE', label: `qe:${n}`, schema: VERDICT },
  )
  if (!qe) return { result: 'aborted', reason: `attempt ${n}: QE 판정을 받지 못했다`, attempts, worktree }

  attempts.push({ attempt: n, dev, qe })
  log(`attempt ${n}: ${qe.verdict}${qe.confirmed.length ? ` (확정 ${qe.confirmed.length})` : ''}`)
  if (qe.verdict === 'PASS') break
}

const last = attempts.at(-1)
if (last.qe.verdict !== 'PASS') return { result: 'loop_exhausted', attempts, worktree }

const ops = await agent(
  `## 작업 경로\n${worktree}\n\n## QE 가 통과시킨 변경\n${last.dev ?? ''}\n` +
  `\n${deploy || '로컬 커밋까지만 진행하고, push 나 PR 은 만들지 마세요.'}\n`,
  { agentType: 'cosmos-ops', phase: 'Ops', schema: OPS },
)

return { result: 'committed', attempts, ops, worktree }
