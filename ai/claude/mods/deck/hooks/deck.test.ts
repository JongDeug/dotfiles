import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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
    const results = items.map(it => ({ key: it.key, png: PNG, columns: 40, rows: 10, file: '/cache/p.html' }))
    const stdout = script.endsWith('convert.sh') ? `{"path":"${argv[3]}","file":"/cache/a.png","width":800,"height":600}\n` : JSON.stringify({ results })
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  // 엔진이 그리는 글.
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [String((e.props as { text?: unknown }).text ?? '')] }))
  return calls
}

test('chart · mermaid · page · 이미지 블록은 처음엔 글, 렌더러가 답하면 그림 — 렌더러마다 한 번씩만 부른다', async ($, on) => {
  const calls = world(on)
  const text = ['앞', '```mermaid', 'flowchart LR', '  A --> B', '```', '```chart', '{"title":"t","mark":"bar"}', '```', '```page', '<h1>요약</h1>', '```', '![사진](/tmp/a.png)', '끝'].join('\n')
  const ui = await $.ui.mount({ plugin: 'deck', surface: 'terminal', component: 'AssistantMessage', props: props(text) })
  // 그려진 뒤: 그림 네 장, 앞뒤 글은 그대로.
  const images = await ui.findAll({ type: 'Image' })
  expect(images.length).toBe(4)
  expect((await ui.find({ text: /^앞$/ }))?.text).toBe('앞')
  expect((await ui.find({ text: /^끝$/ }))?.text).toBe('끝')
  expect(calls.filter(c => c.includes('mermaid.mjs')).length).toBe(1)
  expect(calls.filter(c => c.includes('chart.mjs')).length).toBe(1)
  expect(calls.filter(c => c.includes('html.mjs')).length).toBe(1)
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

test('HTML 파일 줄: 미리보기에 ▾ 펼치기, 누르면 끝까지 여러 장, 다시 누르면 접힌다', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('env.get', ($, e) => ({ value: e.name === 'CLAUDE_CODE_FORCE_TERMINAL_IMAGES' ? '1' : undefined }))
  const asked: { slices?: boolean }[] = []
  on('process.run', ($, e) => {
    const items = (JSON.parse(String(e.init?.stdin ?? '{"items":[]}')).items ?? []) as { key: string; slices?: boolean }[]
    asked.push(...items)
    const results = items.map(it => it.slices
      ? { key: it.key, png: PNG, columns: 40, rows: 250, file: '/x.html', cut: false, parts: [{ path: '/c/a.png', columns: 40, rows: 250 }, { path: '/c/b.png', columns: 40, rows: 60 }] }
      : { key: it.key, png: PNG, columns: 40, rows: 30, file: '/x.html', cut: true })
    return { value: { exitCode: 0, stdout: JSON.stringify({ results }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const read: string[] = []
  on('fs.read', ($, e) => (read.push(e.path), { value: { base64: PNG } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [String((e.props as { text?: unknown }).text ?? '')] }))
  const ui = await $.ui.mount({ plugin: 'deck', surface: 'terminal', component: 'AssistantMessage', props: props('![리포트](/tmp/report.html)') })
  expect((await ui.findAll({ type: 'Image' })).length).toBe(1)
  expect((await ui.find({ text: /아래 이어짐/ }))?.text).toMatch(/리포트 · 아래 이어짐/)
  const fold = (await ui.findAll({ type: 'Button' })).find(b => /펼치기/.test(b.text ?? ''))
  expect(fold).toBeTruthy()
  await ui.press({ key: String(fold?.props.key) })
  const imgs = await ui.findAll({ type: 'Image' })
  expect(imgs.map(i => (i.props.source as { png?: string }).png)).toEqual([PNG, PNG])
  expect(read).toEqual(['/c/a.png', '/c/b.png'])
  expect(asked.some(a => a.slices)).toBe(true)
  const back = (await ui.findAll({ type: 'Button' })).find(b => /접기/.test(b.text ?? ''))
  await ui.press({ key: String(back?.props.key) })
  expect((await ui.findAll({ type: 'Image' })).length).toBe(1)
})
