import { expect, test } from 'claude-code/testing'
import { pickPin } from './pin'

test('답의 마지막 표를 고르고, 바로 위 글 줄을 제목으로', () => {
  const reply = ['앞 글', '', '| a | b |', '|---|---|', '| 1 | 2 |', '', '**두 번째 표:**', '', '| x |', '|---|', '| 9 |', '', '끝 글'].join('\n')
  expect(pickPin(reply)).toEqual({ title: '두 번째 표', text: '| x |\n|---|\n| 9 |' })
})

test('표가 없으면 답 전체, 빈 답이면 null', () => {
  expect(pickPin('그냥 글\n둘째 줄')).toEqual({ title: '고정', text: '그냥 글\n둘째 줄' })
  expect(pickPin('  \n')).toBeNull()
})
