import { expect, test } from 'claude-code/testing'

import { pickMode, splitReply } from './parse'

test('닫힌 mermaid 블록만 떼어 내고 앞뒤 글은 남긴다', () => {
  const parts = splitReply('앞 글\n\n```mermaid\ngraph TD\n  A --> B\n```\n\n뒤 글')
  expect(parts.map(p => p.kind)).toEqual(['text', 'mermaid', 'text'])
  expect(parts[1]).toEqual({ kind: 'mermaid', source: 'graph TD\n  A --> B', raw: '```mermaid\ngraph TD\n  A --> B\n```' })
})

test('스트리밍 중 안 닫힌 블록, 다른 언어, 들여쓴 블록은 글로 둔다', () => {
  expect(splitReply('```mermaid\ngraph TD\n  A --> B').map(p => p.kind)).toEqual(['text'])
  expect(splitReply('```js\nx\n```').map(p => p.kind)).toEqual(['text'])
  expect(splitReply('- 항목\n  ```mermaid\n  graph TD\n  ```').map(p => p.kind)).toEqual(['text'])
})

test('auto 는 kitty·Ghostty 에서만 그림, tmux 안에선 선 도형', () => {
  expect(pickMode('auto', { TERM: 'xterm-kitty' })).toBe('pictures')
  expect(pickMode('auto', { TERM_PROGRAM: 'ghostty' })).toBe('pictures')
  expect(pickMode('auto', { TERM: 'xterm-kitty', TMUX: '/tmp/x' })).toBe('text')
  expect(pickMode('auto', { TERM_PROGRAM: 'iTerm.app' })).toBe('text')
  expect(pickMode('on', { TERM_PROGRAM: 'iTerm.app' })).toBe('pictures')
  // herdr 안: TERM 은 서버를 띄운 터미널 것이라 못 믿고, 강제 변수를 따른다.
  expect(pickMode('auto', { TERM_PROGRAM: 'iTerm.app', CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' })).toBe('pictures')
})
