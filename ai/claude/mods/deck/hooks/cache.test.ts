import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { CommandRunInput, ModelForkResult, On, PromptSubmitInput, SessionStartInput, TurnCompleteInput, TurnUsage } from 'claude-code'

import { fmtDuration, freshState, parseDuration, resetForClear, seedFromResume } from './cache'
import { viewOf } from './cacheview'

tier('user')

const MIN = 60 * 1000
const HOUR = 60 * MIN
const START = 1_000_000

const session: SessionStartInput = { surface: null, isInteractive: false, cwd: '/work' }

const usage = (over: Partial<TurnUsage> = {}): TurnUsage => ({
  input_tokens: 2, output_tokens: 10, cache_read_input_tokens: 200000, cache_creation_input_tokens: 500, model: 'claude-fable-5-1', ...over,
})

// TurnCompleteInput is a union on `reason`; the tests only drive the answered arm.
type AnsweredTurn = Exclude<TurnCompleteInput, { reason: 'refusal' }>
let turns = 0
const turn = (over: Partial<AnsweredTurn> = {}): TurnCompleteInput => ({
  answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't' + ++turns, reason: 'answer', usage: usage(), ...over,
})

const run = (command: 'keepwarm' | 'cache', args: string): CommandRunInput => ({
  command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 },
})

const prompt = (text: string): PromptSubmitInput => ({ text, wait: false, origin: { kind: 'composer' } })

type ForkAnswer = null | ModelForkResult | { read: number; write: number; out?: number; input?: number }

// The world beneath the mod: its store, the engine's answers, and a fork that
// replies from a script so each test decides what the cache looked like.
function world(on: On, forkAnswers: ForkAnswer[], opts: { store?: Map<string, unknown>; commands?: string[]; live?: { tokens?: number; percent?: number }; limits?: { kind: string; percentUsed: number; resetsAt?: string }[]; sid?: string; model?: string } = {}) {
  if (opts.store) {
    const store = opts.store
    on('store.get', ($, e) => ({ value: store.get(e.key) }))
    on('store.set', ($, e) => { store.set(e.key, e.value); return { value: undefined } })
    on('store.delete', ($, e) => { store.delete(e.key); return { value: undefined } })
    on('store.keys', () => ({ value: [...store.keys()] }))
  } else mock.store(on, {})
  const forks: number[] = []
  const status: Array<string | undefined> = []
  const logs: string[] = []
  const entered: string[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: opts.sid ?? 'S1' }))
  on('session.model', () => ({ value: opts.model ?? 'claude-fable-5-1' }))
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 1000000, tokens: opts.live?.tokens, percent: opts.live?.percent }, rateLimits: opts.limits ?? [] } }))
  const registered: string[] = []
  on('command.register', ($, e) => { registered.push(e.name); return { value: { command: e.name } } })
  on('command.list', () => ({ value: (opts.commands ?? []).map(name => ({ name, description: '', source: 'plugin' as const })) }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => { entered.push(e.text); return { text: e.text } })
  on('session.compact', ($, e) => ({ messages: e.messages }))
  on('classic.SessionStart', () => ({}))
  on('ui.log', ($, e) => { logs.push(e.text); return { value: undefined } })
  on('ui.status', ($, e) => { status.push(e.text); return { value: undefined } })
  on('model.fork', () => {
    forks.push(forks.length)
    const a = forkAnswers.shift()
    // Older Claude Code releases returned null instead of a failure object.
    if (a === null || a === undefined) return { value: null as unknown as ModelForkResult }
    if ('isAnswered' in a) return { value: a }
    const value: ModelForkResult = { isAnswered: true, text: 'warm', usage: { input_tokens: a.input ?? 2, output_tokens: a.out ?? 1, cache_read_input_tokens: a.read, cache_creation_input_tokens: a.write } }
    return { value }
  })
  return { forks, status, logs, entered, registered }
}

const warm: ForkAnswer = { read: 200000, write: 0 }

describe('status fallback', () => {
  for (const surface of ['vscode', 'mobile', null] as const) {
    test(`${surface ?? 'headless'} keeps the plain status fallback`, async ($, on) => {
      mock.clock(on, { now: START })
      const w = world(on, [])
      await $.session.start({ ...session, surface })
      await $.turn.complete(turn())
      await $.command.run(run('keepwarm', '90m'))
      expect(w.status.at(-1)).toBe('keepwarm 1h30m 남음 · 핑 50m 뒤')
      expect(w.status.at(-1)).not.toMatch(/\x1b/)
      expect(w.forks.length).toBe(0)
    })
  }
})


describe('parse and format', () => {
  test('durations', async () => {
    expect(parseDuration('6h')).toBe(6 * HOUR)
    expect(parseDuration('90m')).toBe(90 * MIN)
    expect(parseDuration('2h30m')).toBe(150 * MIN)
    expect(parseDuration('soon')).toBe(null)
    expect(fmtDuration(150 * MIN)).toBe('2h30m')
    expect(fmtDuration(7 * MIN)).toBe('7m')
    expect(fmtDuration((15 * 24 + 9) * 60 * MIN)).toBe('15d 9h')
  })
})

describe('guard', () => {
  test('refuses a cold send once with the price, then lets the resend through', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [])
    await $.session.start(session)
    await $.turn.complete(turn())
    await clock.advance(3 * HOUR)
    const first = await $.prompt.submit(prompt('hi'))
    expect(first.drop).toMatch(/cache: 프롬프트 캐시가 2h00m 전에 식었다\. 이대로 보내면 최대 200,502토큰을 \$20\/MTok에 다시 쓴다 = \$4\.01/)
    expect(w.entered).toEqual([])
    const second = await $.prompt.submit(prompt('hi'))
    expect(second.drop).toBe(undefined)
    expect(w.entered).toEqual(['hi'])
  })

  test('lets slash commands, warm sends and small contexts through', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [])
    await $.session.start(session)
    await $.turn.complete(turn())
    await clock.advance(30 * MIN)
    await $.prompt.submit(prompt('warm one'))
    await clock.advance(3 * HOUR)
    await $.prompt.submit(prompt('/clear'))
    await $.turn.complete(turn({ usage: usage({ cache_read_input_tokens: 20000 }) }))
    await clock.advance(3 * HOUR)
    await $.prompt.submit(prompt('small one'))
    expect(w.entered).toEqual(['warm one', '/clear', 'small one'])
  })

  test('warn mode shows the price and sends', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [])
    await $.session.start(session)
    const r = await $.command.run(run('cache', 'guard warn'))
    expect(r.text).toMatch(/가격만 보여 주고 보낸다/)
    await $.turn.complete(turn())
    await clock.advance(3 * HOUR)
    await $.prompt.submit(prompt('hi'))
    expect(w.entered).toEqual(['hi'])
    expect(w.logs.at(-1)).toMatch(/그대로 보낸다/)
  })

  test('a paid cold write is scored and arms keepwarm for three hours', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [warm, warm, warm, warm])
    await $.session.start(session)
    await $.turn.complete(turn())
    await clock.advance(3 * HOUR)
    await $.prompt.submit(prompt('hi'))
    await $.prompt.submit(prompt('hi'))
    await $.turn.complete(turn({ usage: usage({ cache_read_input_tokens: 0, cache_creation_input_tokens: 200502 }) }))
    expect(w.logs.at(-1)).toMatch(/식은 쓰기 201k토큰 냈다\(\$4\.01\)\. 오늘 또 내지 않게 3h00m 동안/)
    expect(w.status.at(-1)).toMatch(/^keepwarm 3h00m 남음 · 핑 50m 뒤/)
    await clock.advance(50 * MIN)
    expect(w.forks.length).toBe(1)
    const card = await $.command.run(run('cache', 'status'))
    expect(card.text).toMatch(/이 세션    식은 쓰기 1번, \$4\.01/)
    expect(card.text).toMatch(/keepwarm   켬, 2h10m 남음/)
  })

  test('context comes from the live window, not the turn\'s summed usage', async ($, on) => {
    mock.clock(on, { now: START })
    const live: { tokens?: number } = {}
    const w = world(on, [], { live })
    await $.session.start(session)
    await $.turn.complete(turn())
    live.tokens = 100000
    await $.turn.complete(turn({ usage: usage({ cache_read_input_tokens: 500000, cache_creation_input_tokens: 2000 }) }))
    const card = await $.command.run(run('cache', 'status'))
    expect(card.text).toMatch(/컨텍스트   100,000토큰/)
    expect(card.text).toMatch(/식은 쓰기 0번/)
    expect(w.status.at(-1)).toBe(undefined)
  })

  test('/clear forgets the context, the clock and the tally', async () => {
    const s = freshState()
    s.ctx = 200000
    s.lastRequestAt = START - 2 * HOUR
    s.ackedAt = s.lastRequestAt
    s.misses = [{ at: START, tokens: 200000, usd: 4 }]
    let cancelled = false
    s.pending = { cancel: () => { cancelled = true } }
    resetForClear(s)
    expect(s.ctx).toBe(0)
    expect(s.lastRequestAt).toBe(0)
    expect(s.ackedAt).toBe(0)
    expect(s.misses).toEqual([])
    expect(s.pending).toBe(null)
    expect(cancelled).toBe(true)
  })

  test('an unguarded full miss is scored too', async ($, on) => {
    mock.clock(on, { now: START })
    const w = world(on, [warm])
    await $.session.start(session)
    await $.turn.complete(turn())
    await $.turn.complete(turn({ usage: usage({ cache_read_input_tokens: 0, cache_creation_input_tokens: 200502 }) }))
    const card = await $.command.run(run('cache', 'status'))
    expect(card.text).toMatch(/식은 쓰기 1번/)
    expect(w.status.at(-1)).toMatch(/^keepwarm 3h00m 남음/)
  })

  test('stays quiet after a compaction until the first new turn', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [])
    await $.session.start(session)
    await $.turn.complete(turn())
    await clock.advance(3 * HOUR)
    await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'old', toolUses: [] }] })
    await $.prompt.submit(prompt('after compact'))
    expect(w.entered).toEqual(['after compact'])
    const card = await $.command.run(run('cache', 'status'))
    expect(card.text).toMatch(/압축으로 초기화됨/)
  })

  test('a cold resume seeds the guard before any turn and returns the estimate line', async () => {
    const s = freshState()
    const now = START
    const line = seedFromResume(s, { source: 'resume', model: 'claude-fable-5-1', context_tokens: 396113, seconds_since_last_response: 3 * 3600, prompt_cache_likely_expired: true, estimated_cache_write_usd: 7.92 }, now)
    expect(line).toMatch(/식은 채로 이어 왔다\. 첫 메시지가 396,113토큰을 다시 쓴다, 약 \$7\.92/)
    expect(s.ctx).toBe(396113)
    expect(s.lastRequestAt).toBe(now - 3 * HOUR)
    expect(seedFromResume(freshState(), { source: 'startup' }, now)).toBe(null)
    expect(seedFromResume(freshState(), { source: 'resume', context_tokens: 20000, prompt_cache_likely_expired: true }, now)).toBe(null)
  })

  test('warns once when the hook form is installed beside it', async ($, on) => {
    mock.clock(on, { now: START })
    const w = world(on, [], { commands: ['cache-tax:status'] })
    await $.session.start(session)
    expect(w.logs.at(-1)).toMatch(/훅 버전.*도 깔려 있어서/)
  })
})

describe('keepwarm', () => {
  test('pings 50 minutes after the last request, then again, and reports the read', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [warm, warm])
    await $.session.start(session)
    const r = await $.command.run(run('keepwarm', '6h'))
    expect(r.text).toMatch(/keepwarm 6h00m 켬/)
    await $.turn.complete(turn())
    await clock.advance(49 * MIN)
    expect(w.forks.length).toBe(0)
    await clock.advance(1 * MIN)
    expect(w.forks.length).toBe(1)
    expect(w.status.at(-1)).toMatch(/keepwarm 5h10m 남음 · 핑 50m 뒤 · 지난 핑 200k 읽음 \$0\.05/)
    await clock.advance(50 * MIN)
    expect(w.forks.length).toBe(2)
  })

  test('a new turn resets the countdown', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [warm])
    await $.session.start(session)
    await $.command.run(run('keepwarm', '6h'))
    await $.turn.complete(turn())
    await clock.advance(40 * MIN)
    await $.turn.complete(turn())
    await clock.advance(40 * MIN)
    expect(w.forks.length).toBe(0)
    await clock.advance(10 * MIN)
    expect(w.forks.length).toBe(1)
  })

  test('stops when a ping reads cold', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [{ read: 0, write: 180000 }, warm])
    await $.session.start(session)
    await $.command.run(run('keepwarm', '6h'))
    await $.turn.complete(turn())
    await clock.advance(50 * MIN)
    expect(w.forks.length).toBe(1)
    expect(w.status.at(-1)).toMatch(/keepwarm 멈춤: 핑이 0을 읽고 180k토큰을 썼다\(\$3\.60\)/)
    await clock.advance(120 * MIN)
    expect(w.forks.length).toBe(1)
    const s = await $.command.run(run('keepwarm', 'status'))
    expect(s.text).toMatch(/멈춤/)
  })

  test('stops when the engine returns null, a cold snapshot or an API error', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [null])
    await $.session.start(session)
    await $.command.run(run('keepwarm', '1h'))
    await $.turn.complete(turn())
    await clock.advance(50 * MIN)
    expect(w.forks.length).toBe(1)
    expect(w.status.at(-1)).toMatch(/스냅숏이 식었거나 API 호출이 실패했다/)
  })

  test('the window ends on its own, forgetting the every knob, and off cancels', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const store = new Map<string, unknown>()
    const w = world(on, [warm, warm, warm], { store })
    await $.session.start(session)
    await $.command.run(run('keepwarm', '3m every 1m'))
    await $.turn.complete(turn())
    await clock.advance(1 * MIN)
    expect(w.forks.length).toBe(1)
    await clock.advance(5 * MIN)
    expect(w.forks.length).toBe(2)
    expect(w.status.at(-1)).toBe(undefined)
    expect(store.has('every:S1')).toBe(false)
    expect(store.has('deadline:S1')).toBe(false)
    await $.command.run(run('keepwarm', '6h'))
    await $.turn.complete(turn())
    await clock.advance(10 * MIN)
    expect(w.forks.length).toBe(2)
    const off = await $.command.run(run('keepwarm', 'off'))
    expect(off.text).toBe('keepwarm 꺼짐')
    await clock.advance(60 * MIN)
    expect(w.forks.length).toBe(2)
  })

  test('the every knob lasts one window only', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [warm, warm, warm, warm])
    await $.session.start(session)
    await $.command.run(run('keepwarm', '1h every 1m'))
    await $.turn.complete(turn())
    await clock.advance(2 * MIN)
    expect(w.forks.length).toBe(2)
    await $.command.run(run('keepwarm', 'off'))
    await $.command.run(run('keepwarm', '6h'))
    await $.turn.complete(turn())
    await clock.advance(10 * MIN)
    expect(w.forks.length).toBe(2)
    await $.command.run(run('keepwarm', '1h every 1m'))
    await $.turn.complete(turn())
    await clock.advance(1 * MIN)
    expect(w.forks.length).toBe(3)
    await $.command.run(run('keepwarm', '6h'))
    await $.turn.complete(turn())
    await clock.advance(10 * MIN)
    expect(w.forks.length).toBe(3)
  })

  test('a bare /keepwarm arms six hours', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [warm])
    await $.session.start(session)
    const r = await $.command.run(run('keepwarm', ''))
    expect(r.text).toMatch(/^keepwarm 6h00m 켬\. 쉴 때마다 50m 뒤 핑을/)
    await $.turn.complete(turn())
    expect(w.status.at(-1)).toBe('keepwarm 6h00m 남음 · 핑 50m 뒤')
    await clock.advance(50 * MIN)
    expect(w.forks.length).toBe(1)
  })

  test('always is remembered, arms every session start, and off ends it for good', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const store = new Map<string, unknown>([['always', true], ['deadline:S1', START - MIN], ['every:S1', MIN]])
    const w = world(on, [warm], { store })
    await $.session.start(session)
    expect(w.status.at(-1)).toBe('keepwarm 6h00m 남음 · 첫 턴 기다림')
    expect(store.get('deadline:S1')).toBe(START + 6 * HOUR)
    expect(store.has('every:S1')).toBe(false)
    await $.turn.complete(turn())
    await clock.advance(1 * MIN)
    expect(w.forks.length).toBe(0)
    await clock.advance(49 * MIN)
    expect(w.forks.length).toBe(1)
    const card = await $.command.run(run('cache', ''))
    expect(card.text).toMatch(/keepwarm   켬, 5h10m 남음 · 핑 50m 뒤 · 지난 핑 200k 읽음 \$0\.05 \(항상\)/)
    const off = await $.command.run(run('keepwarm', 'off'))
    expect(off.text).toBe('keepwarm 꺼짐. 세션 시작 때 저절로 켜지지도 않는다')
    expect(store.has('always')).toBe(false)
    expect(w.status.at(-1)).toBe(undefined)
  })

  test('/keepwarm always sets the switch and arms now', async ($, on) => {
    mock.clock(on, { now: START })
    const store = new Map<string, unknown>()
    const w = world(on, [], { store })
    await $.session.start(session)
    const r = await $.command.run(run('keepwarm', 'always'))
    expect(r.text).toMatch(/^keepwarm 항상 켬: 세션마다 6h00m 창으로 시작한다/)
    expect(store.get('always')).toBe(true)
    expect(store.get('deadline:S1')).toBe(START + 6 * HOUR)
    expect(w.status.at(-1)).toBe('keepwarm 6h00m 남음 · 첫 턴 기다림')
  })

  test('the ping figure counts output tokens at the model\'s rate, Sonnet 5 priced as itself', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [{ read: 200000, write: 0, out: 1000 }])
    await $.session.start(session)
    await $.command.run(run('keepwarm', '6h'))
    await $.turn.complete(turn({ usage: usage({ model: 'claude-sonnet-5' }) }))
    await clock.advance(50 * MIN)
    expect(w.status.at(-1)).toBe('keepwarm 5h10m 남음 · 핑 50m 뒤 · 지난 핑 200k 읽음 $0.05')
    const card = await $.command.run(run('cache', ''))
    expect(card.text).toMatch(/식은 비용  다시 쓰면 \$0\.80 \(데워진 턴 \$0\.04\)/)
    expect(card.text).toMatch(/손익분기   읽기 단가 핑 20번 = 식은 쓰기 1번, 핑 50m 간격이면 쉬는 시간 약 16h40m/)
  })

  test('a partial write, a zero read, or a full write stops the loop; a ping\'s own few tokens do not', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [{ read: 200000, write: 500 }, { read: 75000, write: 70000 }, warm])
    await $.session.start(session)
    await $.command.run(run('keepwarm', '6h every 1m'))
    await $.turn.complete(turn())
    await clock.advance(1 * MIN)
    expect(w.forks.length).toBe(1)
    expect(w.status.at(-1)).toMatch(/^keepwarm 5h59m 남음 · 핑 1m 뒤 · 지난 핑 200k 읽음/)
    await clock.advance(1 * MIN)
    expect(w.forks.length).toBe(2)
    expect(w.status.at(-1)).toMatch(/^keepwarm 멈춤: 핑이 75k을 읽고 70k토큰을 썼다/)
    await clock.advance(5 * MIN)
    expect(w.forks.length).toBe(2)
  })

  test('a ping that reads nothing stops the loop too', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [{ read: 0, write: 0 }, warm])
    await $.session.start(session)
    await $.command.run(run('keepwarm', '6h'))
    await $.turn.complete(turn())
    await clock.advance(50 * MIN)
    expect(w.status.at(-1)).toMatch(/^keepwarm 멈춤: 핑이 0을 읽고 0토큰을 썼다/)
    await clock.advance(60 * MIN)
    expect(w.forks.length).toBe(1)
  })

  test('the ping figure counts uncached input at the base rate', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [{ read: 200000, write: 0, input: 50000, out: 1000 }])
    await $.session.start(session)
    await $.command.run(run('keepwarm', '6h'))
    await $.turn.complete(turn({ usage: usage({ model: 'claude-sonnet-5' }) }))
    await clock.advance(50 * MIN)
    expect(w.status.at(-1)).toBe('keepwarm 5h10m 남음 · 핑 50m 뒤 · 지난 핑 200k 읽음 $0.15')
  })

  test('the card states the break-even for Fable 5.1', async ($, on) => {
    mock.clock(on, { now: START })
    world(on, [])
    await $.session.start(session)
    await $.turn.complete(turn())
    const card = await $.command.run(run('cache', ''))
    expect(card.text).toMatch(/손익분기   읽기 단가 핑 80번 = 식은 쓰기 1번, 핑 50m 간격이면 쉬는 시간 약 2d 18h/)
  })

  test('/keepwarm on a cold session schedules no fork before a turn, and does after one', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [warm])
    await $.session.start(session)
    await $.turn.complete(turn())
    await clock.advance(15 * 24 * HOUR)
    const r = await $.command.run(run('keepwarm', ''))
    expect(r.text).toBe('keepwarm 6h00m 켬. 지금은 캐시가 식어서 다음 턴 50m 뒤에 첫 핑이 간다')
    expect(w.status.at(-1)).toBe('keepwarm 6h00m 남음 · 지금 식음, 다음 턴 50m 뒤 첫 핑')
    await clock.advance(1 * MIN)
    expect(w.forks.length).toBe(0)
    await clock.advance(60 * MIN)
    expect(w.forks.length).toBe(0)
    const card = await $.command.run(run('cache', ''))
    expect(card.text).toMatch(/keepwarm   켬, 4h59m 남음 · 지금 식음, 다음 턴 50m 뒤 첫 핑/)
    await $.turn.complete(turn())
    expect(w.status.at(-1)).toBe('keepwarm 4h59m 남음 · 핑 50m 뒤')
    await clock.advance(49 * MIN)
    expect(w.forks.length).toBe(0)
    await clock.advance(1 * MIN)
    expect(w.forks.length).toBe(1)
  })

  test('the always switch on a cold resume schedules no fork before a turn, and does after one', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const store = new Map<string, unknown>([['always', true]])
    const w = world(on, [warm], { store })
    await $.session.start(session)
    await $.turn.complete(turn())
    await $.command.run(run('keepwarm', 'off'))
    await clock.advance(15 * 24 * HOUR)
    // The test kit cannot raise classic.SessionStart, so the cold state comes from the turn above and a second start arms the switch over it.
    store.set('always', true)
    await $.session.start(session)
    expect(w.status.at(-1)).toBe('keepwarm 6h00m 남음 · 지금 식음, 다음 턴 50m 뒤 첫 핑')
    await clock.advance(1 * MIN)
    expect(w.forks.length).toBe(0)
    const r = await $.command.run(run('keepwarm', 'always'))
    expect(r.text).toBe('keepwarm 항상 켬: 세션마다 6h00m 창으로 시작한다. /keepwarm off 하면 아주 꺼진다. 지금은 캐시가 식어서 다음 턴 50m 뒤에 첫 핑이 간다')
    await clock.advance(60 * MIN)
    expect(w.forks.length).toBe(0)
    await $.turn.complete(turn())
    await clock.advance(50 * MIN)
    expect(w.forks.length).toBe(1)
  })

  test('a cold window expires and its testing period does not reach the next auto-window', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const store = new Map<string, unknown>()
    const w = world(on, [warm], { store })
    await $.session.start(session)
    await $.turn.complete(turn())
    await clock.advance(2 * HOUR)
    await $.command.run(run('keepwarm', '90m every 1m'))
    await clock.advance(90 * MIN)
    expect(w.forks.length).toBe(0)
    expect(store.has('deadline:S1')).toBe(false)
    expect(store.has('every:S1')).toBe(false)
    expect(w.status.at(-1)).toBe(undefined)
    expect((await $.command.run(run('keepwarm', 'status'))).text).toBe('keepwarm 꺼짐')
    await $.turn.complete(turn({ usage: usage({ cache_read_input_tokens: 0, cache_creation_input_tokens: 200000 }) }))
    await clock.advance(49 * MIN)
    expect(w.forks.length).toBe(0)
    await clock.advance(MIN)
    expect(w.forks.length).toBe(1)
  })

  test('a turn after sleep clears the expired period before the overdue timer runs', async ($, on) => {
    let now = START
    on('clock.now', () => ({ value: now }))
    on('clock.after', () => new Promise<{ value: void }>(() => {}))
    const store = new Map<string, unknown>()
    const w = world(on, [], { store })
    await $.session.start(session)
    await $.turn.complete(turn())
    now += 2 * HOUR
    await $.command.run(run('keepwarm', '90m every 1m'))
    now += 91 * MIN
    expect(store.get('every:S1')).toBe(MIN)
    await $.turn.complete(turn({ usage: usage({ cache_read_input_tokens: 0, cache_creation_input_tokens: 200000 }) }))
    expect(store.has('every:S1')).toBe(false)
    expect(store.get('deadline:S1')).toBe(now + 3 * HOUR)
    expect(w.status.at(-1)).toBe('keepwarm 3h00m 남음 · 핑 50m 뒤')
    expect(w.forks.length).toBe(0)
  })

  test('subagent turns do not touch the timer', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const w = world(on, [warm])
    await $.session.start(session)
    await $.command.run(run('keepwarm', '6h'))
    await $.turn.complete(turn())
    await clock.advance(40 * MIN)
    await $.turn.complete(turn({ agentId: 'a1' }))
    await clock.advance(10 * MIN)
    expect(w.forks.length).toBe(1)
  })
})

describe('store per session', () => {
  test('another session\'s window does not arm this one', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const store = new Map<string, unknown>([['deadline:other', START + HOUR], ['every:other', MIN]])
    const w = world(on, [warm], { store, sid: 'mine' })
    await $.session.start(session)
    expect(w.status.at(-1)).toBe(undefined)
    const r = await $.command.run(run('keepwarm', 'status'))
    expect(r.text).toBe('keepwarm 꺼짐')
    await $.turn.complete(turn())
    await clock.advance(50 * MIN)
    expect(w.forks.length).toBe(0)
    expect(store.get('deadline:other')).toBe(START + HOUR)
    expect(store.get('every:other')).toBe(MIN)
  })

  test('this session\'s own window is restored on start', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    const store = new Map<string, unknown>([['deadline:mine', START + 2 * HOUR], ['every:mine', MIN]])
    const w = world(on, [warm], { store, sid: 'mine' })
    await $.session.start(session)
    expect(w.status.at(-1)).toBe('keepwarm 2h00m 남음 · 첫 턴 기다림')
    await $.turn.complete(turn())
    await clock.advance(1 * MIN)
    expect(w.forks.length).toBe(1)
  })

  test('a window that lapsed less than a week ago is left for its own session', async ($, on) => {
    const now = START + 30 * 24 * HOUR
    mock.clock(on, { now })
    const store = new Map<string, unknown>([['deadline:recent', now - HOUR], ['every:recent', MIN]])
    world(on, [], { store, sid: 'mine' })
    await $.session.start(session)
    expect([...store.keys()]).toEqual(['deadline:recent', 'every:recent'])
  })

  test('/keepwarm off deletes only this session\'s keys', async ($, on) => {
    mock.clock(on, { now: START })
    const store = new Map<string, unknown>([['deadline:other', START + HOUR], ['every:other', MIN], ['always', true], ['guard', 'warn']])
    world(on, [], { store, sid: 'mine' })
    await $.session.start(session)
    await $.command.run(run('keepwarm', '1h every 1m'))
    expect(store.get('deadline:mine')).toBe(START + HOUR)
    expect(store.get('every:mine')).toBe(MIN)
    await $.command.run(run('keepwarm', 'off'))
    expect(store.has('deadline:mine')).toBe(false)
    expect(store.has('every:mine')).toBe(false)
    expect(store.has('always')).toBe(false)
    expect(store.get('deadline:other')).toBe(START + HOUR)
    expect(store.get('every:other')).toBe(MIN)
    expect(store.get('guard')).toBe('warn')
  })

  test('legacy bare keys are cleared on start; other sessions\' keys, live or dead, and the global switches stay', async ($, on) => {
    mock.clock(on, { now: START })
    const store = new Map<string, unknown>([
      ['deadline:old1', START - 8 * 24 * HOUR], ['every:old1', MIN],
      ['deadline:old2', 0],
      ['deadline', 0], ['every', MIN],
      ['deadline:live', START + HOUR], ['every:live', 2 * MIN],
      ['guard', 'warn'],
    ])
    world(on, [], { store, sid: 'mine' })
    await $.session.start(session)
    expect([...store.keys()]).toEqual(['deadline:old1', 'every:old1', 'deadline:old2', 'deadline:live', 'every:live', 'guard'])
  })

  test('this session\'s own dead window is cleared on start', async ($, on) => {
    mock.clock(on, { now: START })
    const store = new Map<string, unknown>([['deadline:mine', START - MIN], ['every:mine', MIN], ['deadline:other', START - MIN], ['every:other', MIN]])
    world(on, [], { store, sid: 'mine' })
    await $.session.start(session)
    expect([...store.keys()]).toEqual(['deadline:other', 'every:other'])
  })
})

// board 의 캐시 알약이 그리는 글자 — 원본의 입력창 위 줄 테스트를 대신한다.
describe('cache pill', () => {
  // 요청 시각이 0보다 커야 '요청 있음'으로 친다 — 넉넉한 시각에서 잰다.
  const NOW = 10 * HOUR
  const at = (over: Partial<ReturnType<typeof freshState>>) => Object.assign(freshState(), { lastModel: 'claude-fable-5-1', ctx: 200000 }, over)

  test('요청 전엔 숨고, keepwarm 이 켜져 있으면 첫 턴을 기다린다', () => {
    expect(viewOf(at({}), NOW)).toBe(null)
    expect(viewOf(at({ deadline: NOW + 3 * HOUR }), NOW)).toEqual({ tone: 'unknown', head: '☕ 캐시', body: '첫 턴 기다림 · keepwarm 3h00m' })
  })

  test('데워진 동안은 식기까지 남은 시간, keepwarm 이면 다음 핑과 지난 핑 값까지', () => {
    expect(viewOf(at({ lastRequestAt: NOW - 18 * MIN }), NOW)).toEqual({ tone: 'warm', head: '☕ 캐시', body: '42m 남음' })
    const s = at({ lastRequestAt: NOW - 10 * MIN, deadline: NOW + 5 * HOUR, last: { at: NOW - 10 * MIN, read: 200000, write: 0, usd: 0.05, warm: true } })
    expect(viewOf(s, NOW)?.body).toBe('50m 남음 · keepwarm 5h00m · 핑 40m 뒤 · 지난 핑 $0.05')
  })

  test('한 시간이 지나면 식음과 다시 쓰는 값', () => {
    expect(viewOf(at({ lastRequestAt: NOW - 2 * HOUR }), NOW)).toEqual({ tone: 'cold', head: '🧊 캐시 식음', body: '다음 요청이 200k 다시 씀 ≈$4.00' })
  })

  test('압축 뒤와 멈춘 keepwarm', () => {
    expect(viewOf(at({ lastRequestAt: NOW - 2 * HOUR, compacted: true }), NOW)?.body).toBe('압축 뒤 첫 턴 기다림')
    expect(viewOf(at({ lastRequestAt: NOW, stopped: '아직 데울 대화가 없다' }), NOW)).toEqual({ tone: 'stopped', head: '⏸ keepwarm 멈춤', body: '아직 데울 대화가 없다' })
  })

  test('끝난 keepwarm 창은 알약에 남기지 않는다', () => {
    expect(viewOf(at({ lastRequestAt: NOW - 5 * MIN, deadline: NOW - MIN }), NOW)?.body).toBe('55m 남음')
  })
})

// 계기판을 실제로 그려 본다 — git·셸은 가짜로 답한다.
describe('board band', () => {
  const band = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 160, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  const shell = (on: On) => {
    on('session.cwd', () => ({ value: '/work' }))
    on('env.get', () => ({ value: undefined }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: '# branch.head develop\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    // 엔진이 그리던 띠(다른 mod 몫) 자리 — 계기판은 그 아래에 붙는다.
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [''] }))
  }

  test('/reload-plugins 처럼 session.start 없이 그려져도 keepwarm 명령이 잡힌다', async ($, on) => {
    mock.clock(on, { now: START })
    const w = world(on, [])
    shell(on)
    const ui = await $.ui.mount({ plugin: 'deck', surface: 'terminal', component: 'AbovePrompt', props: band })
    await ui.find({ text: /develop/ })
    expect(w.registered).toEqual(['keepwarm', 'deck', 'pet', 'cache'])
  })

  test('식은 채 보내기가 막히면 작업 중 알약이 돌지 않고, 캐시 알약이 식음을 보인다', async ($, on) => {
    const clock = mock.clock(on, { now: START })
    world(on, [])
    shell(on)
    await $.session.start({ ...session, surface: 'terminal', isInteractive: true })
    await $.turn.complete(turn())
    await clock.advance(3 * HOUR)
    const ui = await $.ui.mount({ plugin: 'deck', surface: 'terminal', component: 'AbovePrompt', props: band })
    expect((await $.prompt.submit(prompt('hi'))).drop).toMatch(/^cache: /)
    expect(await ui.find({ text: /생각 중/ })).toBe(undefined)
    expect((await ui.find({ text: /캐시 식음/ }))?.text).toMatch(/캐시 식음/)
  })

  for (const [cols, wide] of [[200, true], [26, false]] as const) {
    test(`폭 ${cols}칸: 경로·브랜치·CTX 는 남고 모델은 ${wide ? '브랜치 옆에 보인다' : '빠진다'}`, async ($, on) => {
      mock.clock(on, { now: START })
      world(on, [], { live: { tokens: 300000 } })
      shell(on)
      const ui = await $.ui.mount({ plugin: 'deck', surface: 'terminal', component: 'AbovePrompt', props: { ...band, bodyColumns: cols } })
      expect((await ui.find({ text: /⎇ develop/ }))?.text).toMatch(/develop/)
      expect((await ui.find({ text: /📁 \/work/ }))?.text).toMatch(/work/)
      expect((await ui.find({ text: /^ CTX $/ }))?.text).toBe(' CTX ')
      expect(Boolean(await ui.find({ text: /Fable 5\.1/ }))).toBe(wide)
    })
  }

  test('CTX 는 한도처럼 ▰▱ 8칸과 퍼센트, 남은 시간은 띄어 쓴다', async ($, on) => {
    mock.clock(on, { now: START })
    world(on, [], { live: { tokens: 630000, percent: 63 }, limits: [{ kind: 'five_hour', percentUsed: 6, resetsAt: new Date(START + (4 * 60 + 46) * 60_000).toISOString() }] })
    shell(on)
    const ui = await $.ui.mount({ plugin: 'deck', surface: 'terminal', component: 'AbovePrompt', props: band })
    expect((await ui.find({ text: /^ ▰▰▰▰▰$/ }))?.text).toBe(' ▰▰▰▰▰')
    expect((await ui.find({ text: /^ 63% $/ }))?.text).toBe(' 63% ')
    expect((await ui.find({ text: /^⟲ 4h 46m $/ }))?.text).toBe('⟲ 4h 46m ')
  })
})
