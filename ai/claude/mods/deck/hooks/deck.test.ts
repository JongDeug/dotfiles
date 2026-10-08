import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { HELP } from './help'

// 답 속 블록이 그림으로 바뀌는 길: 렌더러(node)는 가짜로 답한다.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const props = (text: string) => ({ text, isFirstOfReply: true }) as never

function world(on: On) {
  mock.clock(on, { now: 1_000_000 })
  on('env.get', ($, e) => ({ value: e.name === 'CLAUDE_CODE_FORCE_TERMINAL_IMAGES' ? '1' : e.name === 'HOME' ? '/home/me' : undefined }))
  const calls: string[] = []
  on('process.run', ($, e) => {
    const argv = e.argv as string[]
    calls.push(argv.join(' '))
    const script = argv[1] ?? ''
    const items = (JSON.parse(String(e.init?.stdin ?? '{"items":[]}')).items ?? []) as { key: string }[]
    const results = items.map(it => ({ key: it.key, png: PNG, columns: 40, rows: 10 }))
    const stdout = script.endsWith('convert.sh') ? `{"path":"${argv[3]}","file":"/cache/a.png","width":800,"height":600}\n` : JSON.stringify({ results })
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  // 엔진이 그리는 글.
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [String((e.props as { text?: unknown }).text ?? '')] }))
  return calls
}

test('chart · mermaid · 이미지 블록은 처음엔 글, 렌더러가 답하면 그림 — 렌더러마다 한 번씩만 부른다', async ($, on) => {
  const calls = world(on)
  const text = ['앞', '```mermaid', 'flowchart LR', '  A --> B', '```', '```chart', '{"title":"t","mark":"bar"}', '```', '![사진](/tmp/a.png)', '끝'].join('\n')
  const ui = await $.ui.mount({ plugin: 'deck', surface: 'terminal', component: 'AssistantMessage', props: props(text) })
  // 그려진 뒤: 그림 세 장, 앞뒤 글은 그대로.
  const images = await ui.findAll({ type: 'Image' })
  expect(images.length).toBe(3)
  expect((await ui.find({ text: /^앞$/ }))?.text).toBe('앞')
  expect((await ui.find({ text: /^끝$/ }))?.text).toBe('끝')
  expect(calls.filter(c => c.includes('mermaid.mjs')).length).toBe(1)
  expect(calls.filter(c => c.includes('chart.mjs')).length).toBe(1)
  expect(calls.filter(c => c.includes('convert.sh')).length).toBe(1)
})

test('렌더러가 어떤 블록의 결과를 빠뜨려도 다시 부르기를 되풀이하지 않는다 — 못 그림으로 남긴다', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('env.get', ($, e) => ({ value: e.name === 'CLAUDE_CODE_FORCE_TERMINAL_IMAGES' ? '1' : undefined }))
  let runs = 0
  on('process.run', () => {
    runs += 1
    return { value: { exitCode: 0, stdout: JSON.stringify({ results: [] }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [String((e.props as { text?: unknown }).text ?? '')] }))
  const ui = await $.ui.mount({ plugin: 'deck', surface: 'terminal', component: 'AssistantMessage', props: props(['```chart', '{"mark":"bar"}', '```'].join('\n')) })
  expect((await ui.find({ text: /차트를 그리지 못했다/ }))?.text).toMatch(/그리지 못했다/)
  expect(runs).toBe(1)
})

test('커밋·PR 서명 지시는 비우고 다른 문구는 엔진대로', async ($, on) => {
  on('attribution.text', ($, e) => ({ text: `engine:${e.kind}` }))
  expect((await $.attribution.text({ kind: 'commit', text: 'Co-Authored-By: Claude' })).text).toBe('')
  expect((await $.attribution.text({ kind: 'pr', text: 'Generated with Claude Code' })).text).toBe('')
  expect((await $.attribution.text({ kind: 'remedy', text: 'x' })).text).toBe('engine:remedy')
})

test('Claude 서명 줄이 든 git commit 은 실행 전에 막고, 깨끗한 커밋은 그대로 실행', async ($, on) => {
  const ran: string[] = []
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('tool.call', ($, e) => {
    ran.push(String((e as { command?: unknown }).command))
    return { result: { stdout: 'ok' } } as never
  })
  const bad = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"' })
  expect(String(bad.deny ?? bad.text)).toMatch(/서명 줄/)
  expect(ran).toEqual([])
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: 깨끗"' })
  expect(ran).toEqual(['git commit -m "feat: 깨끗"'])
})

test('/deck 은 안내를 글로 찍고, 등록한 명령은 모두 안내에 있다', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const opened: string[] = []
  on('ui.open', ($, e) => (opened.push(e.id), { value: undefined }) as never)
  const r = await $.command.run({ command: 'deck', args: '' } as never)
  const text = String((r as { text?: string }).text)
  expect(text).toMatch(/  scale · max_rows +그림 크기/)
  expect(opened).toEqual([])
  const keys = HELP.flatMap(sec => sec.rows.map(([k]) => k))
  for (const name of ['/deck', '/keepwarm', '/cache']) expect(keys).toContain(name)
})
