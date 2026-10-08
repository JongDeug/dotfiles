// node bin/check.mjs (npm ci 뒤) — 떼어 낸 글꼴로 그린 그림이 .ttc 로 그린 그림과 같은지, 손그림(다이어그램·차트)이 그려지는지, 한글 subgraph 가 안 합쳐지는지 본다.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

import { THEMES, renderMermaidSVG } from 'beautiful-mermaid'

import { asciiSubgraphs, extractFace, renderPicture } from './mermaid.mjs'

const TTC = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
if (!fs.existsSync(TTC)) process.exit(0)  // 맥이 아니면 건너뛴다
const { Resvg } = createRequire(import.meta.url)('@resvg/resvg-js')
const ttc = fs.readFileSync(TTC)
const face = extractFace(ttc, 0)
assert.equal(face.readUInt16BE(4), ttc.readUInt16BE(ttc.readUInt32BE(12) + 4))  // 표 수가 같다
const svg = renderMermaidSVG('flowchart LR\n  A["송출"] --> B["추론"]', { ...THEMES['catppuccin-mocha'], font: 'Apple SD Gothic Neo' })
const png = fonts => new Resvg(svg, { font: { loadSystemFonts: false, fontBuffers: fonts, defaultFontFamily: 'Apple SD Gothic Neo' } }).render().asPng()
assert.deepEqual(png([face]), png([ttc]))
// 손그림: 그려지고, 글꼴에 없는 빼기 기호(U+2212)도 '-' 로 바뀌어 그려진다
const opts = { theme: 'gruvbox', cellAspect: 2.2, maxColumns: 80 }
const sketched = renderPicture('flowchart LR\n  A["t2 \u2212 t0"] --> B["추론"]', { ...opts, style: 'sketch' })
assert.ok(sketched.png.length > 1000 && sketched.columns > 0)
assert.notEqual(sketched.png, renderPicture('flowchart LR\n  A["t2 \u2212 t0"] --> B["추론"]', opts).png)
// 한글 subgraph id: 칸이 하나로 합쳐지지 않는다(제목 둘), 가리키는 곳도 같이 바뀐다, ASCII id 소스는 그대로다
const ko = 'flowchart LR\n  subgraph 지금\n    W1[www] --> S1[streamhub]\n  end\n  subgraph 바꾸면\n    W2[www] --> S2[streamhub]\n  end'
assert.deepEqual(renderMermaidSVG(asciiSubgraphs(ko), {}).match(/>(지금|바꾸면)</g), ['>지금<', '>바꾸면<'])
assert.equal(asciiSubgraphs(`${ko}\n  지금 --> 바꾸면\n  X[지금 상태] --> 바꾸면\n  style 지금 fill:#333`).split('\n').slice(-3).join('|'), '  sg1 --> sg2|  X[지금 상태] --> sg2|  style sg1 fill:#333')
const ascii = 'flowchart LR\n  subgraph A\n    W1[지금] --> S1\n  end\n  A --> B'
assert.equal(asciiSubgraphs(ascii), ascii)
// 손그림 차트: 그려지고, 반듯한 차트와 다르다
const { renderChart } = await import('./chart.mjs')
const spec = JSON.stringify({ data: { values: [{ a: '식비', b: 3 }, { a: '교통', b: 1 }] }, mark: 'bar', encoding: { x: { field: 'a', type: 'nominal' }, y: { field: 'b', type: 'quantitative' } } })
const clean = await renderChart(spec, { maxColumns: 60, cellAspect: 2.2 })
const hand = await renderChart(spec, { maxColumns: 60, cellAspect: 2.2, style: 'sketch' })
assert.ok(hand.png.length > 1000 && hand.columns === clean.columns)
assert.notEqual(hand.png, clean.png)
console.log('ok')
