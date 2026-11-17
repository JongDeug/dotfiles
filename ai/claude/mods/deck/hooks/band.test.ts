import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { On } from 'claude-code'

tier('user')

const START = 1_000_000

// 계기판 아래 세상: 세션 값 · git(process.run).
function world(on: On, opts: { live?: { tokens?: number; percent?: number }; limits?: { kind: string; percentUsed: number; resetsAt?: string }[] } = {}) {
  mock.store(on, {})
  const runs: string[][] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'S1' }))
  on('session.model', () => ({ value: 'claude-fable-5-1' }))
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 1000000, tokens: opts.live?.tokens, percent: opts.live?.percent }, rateLimits: opts.limits ?? [] } }))
  on('session.cwd', () => ({ value: '/work' }))
  on('env.get', () => ({ value: undefined }))
  on('process.run', ($, e) => {
    runs.push(e.argv)
    return { value: { exitCode: 0, stdout: '# branch.head develop\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  // 엔진이 그리던 띠(다른 mod 몫) 자리 — 계기판은 그 아래에 붙는다.
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [''] }))
  return { runs }
}

describe('board band', () => {
  const band = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 160, scroll: { offset: 0, bodyRows: 10 }, view: {} }

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
