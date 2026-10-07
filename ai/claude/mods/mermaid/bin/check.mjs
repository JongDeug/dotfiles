// node bin/check.mjs (npm ci 뒤) — 떼어 낸 글꼴로 그린 그림이 .ttc 로 그린 그림과 같은지 본다.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

import { THEMES, renderMermaidSVG } from 'beautiful-mermaid'

import { extractFace } from './render.mjs'

const TTC = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
if (!fs.existsSync(TTC)) process.exit(0)  // 맥이 아니면 건너뛴다
const { Resvg } = createRequire(import.meta.url)('@resvg/resvg-js')
const ttc = fs.readFileSync(TTC)
const face = extractFace(ttc, 0)
assert.equal(face.readUInt16BE(4), ttc.readUInt16BE(ttc.readUInt32BE(12) + 4))  // 표 수가 같다
const svg = renderMermaidSVG('flowchart LR\n  A["송출"] --> B["추론"]', { ...THEMES['catppuccin-mocha'], font: 'Apple SD Gothic Neo' })
const png = fonts => new Resvg(svg, { font: { loadSystemFonts: false, fontBuffers: fonts, defaultFontFamily: 'Apple SD Gothic Neo' } }).render().asPng()
assert.deepEqual(png([face]), png([ttc]))
console.log('ok')
