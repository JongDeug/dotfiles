import { expect, test } from 'claude-code/testing'

import { splitAll } from './blocks'

test('한 답에 mermaid · chart · 이미지 줄이 섞여도 순서대로 나눈다', () => {
  const text = [
    '앞 글',
    '```mermaid',
    'flowchart LR',
    '  A --> B',
    '```',
    '중간 글',
    '```chart',
    '{"mark":"bar"}',
    '```',
    '![사진](/tmp/a.png) ![둘](/tmp/b.jpg)',
    '끝 글',
  ].join('\n')
  expect(splitAll(text).map(b => b.kind)).toEqual(['text', 'mermaid', 'text', 'chart', 'image', 'text'])
  const img = splitAll(text).find(b => b.kind === 'image')
  expect(img && img.kind === 'image' ? img.pictures.map(p => p.path) : []).toEqual(['/tmp/a.png', '/tmp/b.jpg'])
})

test('블록이 없으면 글 하나', () => {
  expect(splitAll('그냥 글')).toEqual([{ kind: 'text', text: '그냥 글' }])
})
