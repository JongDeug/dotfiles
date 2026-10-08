import { expect, test } from 'claude-code/testing'

import { gridFor, isImagePath, isMediaPath, splitImages } from './images'

test('이미지 경로만 고른다', () => {
  expect(['/a/b.png', '/a/b.JPG', '/x.heic'].map(isImagePath)).toEqual([true, true, true])
  expect(['a/b.png', '/a/b.txt', 'https://x/y.png', 3].map(isImagePath)).toEqual([false, false, false, false])
})

test('줄 하나를 통째로 차지한 이미지 문법만 그림으로', () => {
  const parts = splitImages('결과예요.\n\n![탐지 결과](/tmp/frame-01.jpg)\n\n문장 중간 ![x](/a.png) 은 글로.\n![웹](https://x/y.png)')
  expect(parts.map(p => p.kind)).toEqual(['text', 'image', 'text'])
  expect(parts[1]).toEqual({ kind: 'image', pictures: [{ alt: '탐지 결과', path: '/tmp/frame-01.jpg' }], raw: '![탐지 결과](/tmp/frame-01.jpg)' })
})

test('한 줄에 여러 장이면 나란히, 영상도 그림으로', () => {
  expect(isMediaPath('/a/clip.mp4')).toBe(true)
  expect(isImagePath('/a/clip.mp4')).toBe(false)
  const parts = splitImages('![v6](/r/v6.png) ![v7](/r/v7.png)\n![비행](/r/clip.MOV)')
  expect(parts.map(p => (p.kind === 'image' ? p.pictures.map(x => x.alt) : p.kind))).toEqual([['v6', 'v7'], ['비행']])
})

test('칸 수는 비율을 지키고 한도를 넘지 않는다', () => {
  // 가로로 긴 1600×900: 폭 100칸이면 높이 ≈ 100·900/(1600·2.2) ≈ 26
  expect(gridFor(1600, 900, 100, 30)).toEqual({ columns: 100, rows: 26 })
  // 세로로 긴 그림은 높이 한도에서 멈추고 폭을 줄인다
  expect(gridFor(900, 1600, 100, 30)).toEqual({ columns: 37, rows: 30 })
})


test('공백이 든 경로', () => {
  const [seg] = splitImages('![배경](/System/Library/Desktop Pictures/iMac Blue.heic)')
  expect(seg).toEqual({ kind: 'image', pictures: [{ alt: '배경', path: '/System/Library/Desktop Pictures/iMac Blue.heic' }], raw: '![배경](/System/Library/Desktop Pictures/iMac Blue.heic)' })
})
