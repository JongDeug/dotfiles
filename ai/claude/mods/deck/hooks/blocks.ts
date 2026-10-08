// 답 하나를 한 번에 나눈다: ```mermaid · ```chart · ```page · 이미지 줄 · 나머지 글.
import { splitCharts, splitPages } from './fences'
import { splitImages, type Picture } from './images'
import { splitReply } from './parse'

export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'mermaid'; source: string; raw: string }
  | { kind: 'chart'; spec: string; raw: string }
  | { kind: 'page'; html: string; raw: string }
  | { kind: 'image'; pictures: Picture[]; raw: string }

export function splitAll(text: string): Block[] {
  const out: Block[] = []
  for (const a of splitReply(text)) {
    if (a.kind !== 'text') {
      out.push(a)
      continue
    }
    for (const b of splitCharts(a.text)) {
      if (b.kind !== 'text') {
        out.push(b)
        continue
      }
      for (const c of splitPages(b.text)) {
        if (c.kind !== 'text') out.push(c)
        else out.push(...splitImages(c.text))
      }
    }
  }
  return out
}
