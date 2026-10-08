// node bin/check.mjs (npm ci 뒤) — 떼어 낸 글꼴로 그린 그림이 .ttc 로 그린 그림과 같은지, 손그림(다이어그램·차트)이 그려지는지, 페이지가 Chrome 으로 찍히는지 본다.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

import { THEMES, renderMermaidSVG } from 'beautiful-mermaid'

import { extractFace, renderPicture } from './mermaid.mjs'

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
// 손그림 차트: 그려지고, 반듯한 차트와 다르다
const { renderChart } = await import('./chart.mjs')
const spec = JSON.stringify({ data: { values: [{ a: '식비', b: 3 }, { a: '교통', b: 1 }] }, mark: 'bar', encoding: { x: { field: 'a', type: 'nominal' }, y: { field: 'b', type: 'quantitative' } } })
const clean = await renderChart(spec, { maxColumns: 60, cellAspect: 2.2 })
const hand = await renderChart(spec, { maxColumns: 60, cellAspect: 2.2, style: 'sketch' })
assert.ok(hand.png.length > 1000 && hand.columns === clean.columns)
assert.notEqual(hand.png, clean.png)
// 페이지: 실제 Chrome 으로 한 장 찍힌다(Chrome 이 없으면 건너뛴다)
if (fs.existsSync('/Applications/Google Chrome.app')) {
  const { execFileSync } = await import('node:child_process')
  const out = JSON.parse(execFileSync('node', [new URL('./html.mjs', import.meta.url).pathname], { input: JSON.stringify({ items: [{ key: 'p', html: '<h1>요약</h1><p>본문</p>', maxColumns: 60 }], cellAspect: 2.2 }) }).toString())
  const r = out.results[0]
  assert.ok(r.png && r.png.length > 1000, r.error)
  assert.ok(r.rows > 0 && r.rows < 20 && fs.existsSync(r.file))  // 내용 높이만큼만
}
console.log('ok')
