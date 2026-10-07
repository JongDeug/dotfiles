import { expect, test } from 'claude-code/testing'

import { splitCharts } from './fences'

test('닫힌 chart·vega-lite 블록만 떼어 낸다', () => {
  const parts = splitCharts('이번 달 지출이에요.\n\n```chart\n{"mark":"bar"}\n```\n\n```vega-lite\n{"mark":"line"}\n```\n끝')
  expect(parts.map(p => p.kind)).toEqual(['text', 'chart', 'chart', 'text'])
  expect(parts[1]).toEqual({ kind: 'chart', spec: '{"mark":"bar"}', raw: '```chart\n{"mark":"bar"}\n```' })
})

test('스트리밍 중 안 닫힌 블록, 다른 언어는 글로 둔다', () => {
  expect(splitCharts('```chart\n{"mark":"bar"').map(p => p.kind)).toEqual(['text'])
  expect(splitCharts('```json\n{}\n```').map(p => p.kind)).toEqual(['text'])
})
