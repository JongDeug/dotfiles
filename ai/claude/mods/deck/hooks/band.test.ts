import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { On } from 'claude-code'

tier('user')

const START = 1_000_000

// 계기판 아래 세상: 세션 값 · 명령 등록 · git(process.run). herdr 는 env 로 켠다.
function world(on: On, opts: { live?: { tokens?: number; percent?: number }; limits?: { kind: string; percentUsed: number; resetsAt?: string }[]; env?: Record<string, string>; agents?: unknown[] } = {}) {
  mock.store(on, {})
  const registered: string[] = []
  const runs: string[][] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'S1' }))
  on('session.model', () => ({ value: 'claude-fable-5-1' }))
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 1000000, tokens: opts.live?.tokens, percent: opts.live?.percent }, rateLimits: opts.limits ?? [] } }))
  on('session.cwd', () => ({ value: '/work' }))
  on('command.register', ($, e) => { registered.push(e.name); return { value: { command: e.name } } })
  on('env.get', ($, e) => ({ value: opts.env?.[e.name] }))
  on('process.run', ($, e) => {
    runs.push(e.argv)
    const stdout = e.argv[1] === 'agent' ? JSON.stringify({ result: { agents: opts.agents ?? [] } }) : '# branch.head develop\n'
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  // 엔진이 그리던 띠(다른 mod 몫) 자리 — 계기판은 그 아래에 붙는다.
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [''] }))
  return { registered, runs }
}

describe('board band', () => {
  const band = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 160, scroll: { offset: 0, bodyRows: 10 }, view: {} }

  test('/reload-plugins 처럼 session.start 없이 그려져도 명령이 잡힌다', async ($, on) => {
    mock.clock(on, { now: START })
    const w = world(on)
    const ui = await $.ui.mount({ plugin: 'deck', surface: 'terminal', component: 'AbovePrompt', props: band })
    await ui.find({ text: /develop/ })
    expect(w.registered).toEqual(['deck', 'pet', 'queue'])
  })

  for (const [cols, wide] of [[200, true], [26, false]] as const) {
    test(`폭 ${cols}칸: 경로·브랜치·CTX 는 남고 모델은 ${wide ? '브랜치 옆에 보인다' : '빠진다'}`, async ($, on) => {
      mock.clock(on, { now: START })
      world(on, { live: { tokens: 300000 } })
      const ui = await $.ui.mount({ plugin: 'deck', surface: 'terminal', component: 'AbovePrompt', props: { ...band, bodyColumns: cols } })
      expect((await ui.find({ text: /⎇ develop/ }))?.text).toMatch(/develop/)
      expect((await ui.find({ text: /📁 \/work/ }))?.text).toMatch(/work/)
      expect((await ui.find({ text: /^ CTX $/ }))?.text).toBe(' CTX ')
      expect(Boolean(await ui.find({ text: /Fable 5\.1/ }))).toBe(wide)
    })
  }

  test('CTX 는 한도처럼 ▰▱ 8칸과 퍼센트, 남은 시간은 띄어 쓴다', async ($, on) => {
    mock.clock(on, { now: START })
    world(on, { live: { tokens: 630000, percent: 63 }, limits: [{ kind: 'five_hour', percentUsed: 6, resetsAt: new Date(START + (4 * 60 + 46) * 60_000).toISOString() }] })
    const ui = await $.ui.mount({ plugin: 'deck', surface: 'terminal', component: 'AbovePrompt', props: band })
    expect((await ui.find({ text: /^ ▰▰▰▰▰$/ }))?.text).toBe(' ▰▰▰▰▰')
    expect((await ui.find({ text: /^ 63% $/ }))?.text).toBe(' 63% ')
    expect((await ui.find({ text: /^⟲ 4h 46m $/ }))?.text).toBe('⟲ 4h 46m ')
  })

  test('effort 는 요청에 실린 값 — /effort 로 세션에서만 바꾼 max 도 설정 파일 값 대신 보인다', async ($, on) => {
    mock.clock(on, { now: START })
    world(on)
    on('turn.step', async function* ($, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
    })
    const ui = await $.ui.mount({ plugin: 'deck', surface: 'terminal', component: 'AbovePrompt', props: band })
    await ui.find({ text: /develop/ })
    expect(await ui.find({ text: /^ max $/ })).toBe(undefined)
    await $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', effort: 'max', messageCount: 1 }).next()
    expect((await ui.find({ text: /^ max $/ }))?.text).toBe(' max ')
  })
})

describe('판단 큐', () => {
  const band = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 160, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  const env = { HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p1' }
  const agent = (pane_id: string, agent_status: string, slot: number) => ({ pane_id, agent_status, terminal_title_stripped: pane_id, tokens: slot ? { q: `◆${slot}` } : {} })

  test('칸마다 번호와 상태 기호, 빈 칸은 ·, 이 세션이 들었으면 ○ 없음', async ($, on) => {
    mock.clock(on, { now: START })
    world(on, { env, agents: [agent('w1:p1', 'working', 2), agent('w2:p1', 'done', 1), agent('w3:p1', 'idle', 0)] })
    const ui = await $.ui.mount({ plugin: 'deck', surface: 'terminal', component: 'AbovePrompt', props: band })
    expect((await ui.find({ text: /^ 1 ✓ $/ }))?.text).toBe(' 1 ✓ ')
    expect((await ui.find({ text: /^ 2 ◐ $/ }))?.text).toBe(' 2 ◐ ')
    expect((await ui.find({ text: /^ 3 · $/ }))?.text).toBe(' 3 · ')
    expect(await ui.find({ text: /^ ○ $/ })).toBe(undefined)
  })

  test('큐 밖 세션은 뒤에 ○', async ($, on) => {
    mock.clock(on, { now: START })
    world(on, { env, agents: [agent('w2:p1', 'blocked', 1)] })
    const ui = await $.ui.mount({ plugin: 'deck', surface: 'terminal', component: 'AbovePrompt', props: band })
    expect((await ui.find({ text: /^ 1 ! $/ }))?.text).toBe(' 1 ! ')
    expect((await ui.find({ text: /^ ○ $/ }))?.text).toBe(' ○ ')
  })

  test('/queue 는 꽉 차면 넣지 않고, 들어 있으면 뺀다', async ($, on) => {
    mock.clock(on, { now: START })
    const full = world(on, { env, agents: [agent('w2:p1', 'done', 1), agent('w3:p1', 'working', 2), agent('w4:p1', 'blocked', 3)] })
    const r = await $.command.run({ command: 'queue', args: '' } as never)
    expect(String((r as { text?: string }).text)).toMatch(/꽉 찼다 \(3\/3\)/)
    expect(full.runs.some(a => a.includes('report-metadata'))).toBe(false)
  })

  test('/queue 로 넣으면 비어 있는 가장 작은 칸 번호로 q 토큰을 단다', async ($, on) => {
    mock.clock(on, { now: START })
    const w = world(on, { env, agents: [agent('w2:p1', 'done', 1), agent('w3:p1', 'done', 3)] })
    const r = await $.command.run({ command: 'queue', args: '' } as never)
    expect(String((r as { text?: string }).text)).toMatch(/2번에 넣었다 \(3\/3\)/)
    expect(w.runs.find(a => a.includes('report-metadata'))).toEqual(['herdr', 'pane', 'report-metadata', 'w1:p1', '--source', 'deck.queue', '--token', 'q=◆2'])
    expect(w.runs.some(a => a.join(' ') === 'herdr plugin action invoke queue-sync --plugin dotfiles.agent-numbers')).toBe(true)
  })
})
