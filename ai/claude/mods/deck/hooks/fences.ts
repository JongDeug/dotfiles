export type Segment = { kind: 'text'; text: string } | { kind: 'chart'; spec: string; raw: string }

// 줄 맨 앞에서 열고 닫힌 ```chart / ```vega-lite 블록만. 스트리밍 중 아직 안 닫힌 블록은 글로 남는다.
const FENCE = /^(`{3,}|~{3,})(?:chart|vega-?lite)[^\n`]*\n([\s\S]*?)\n\1[ \t]*$/gim

export function splitCharts(text: string): Segment[] {
  const out: Segment[] = []
  let at = 0
  const pushText = (s: string) => {
    if (s.trim()) out.push({ kind: 'text', text: s.replace(/^\n+|\n+$/g, '') })
  }
  for (const m of text.matchAll(FENCE)) {
    pushText(text.slice(at, m.index))
    out.push({ kind: 'chart', spec: m[2] ?? '', raw: m[0] })
    at = (m.index ?? 0) + m[0].length
  }
  pushText(text.slice(at))
  return out
}
