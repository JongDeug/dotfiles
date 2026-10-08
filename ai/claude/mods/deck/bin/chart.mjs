// stdin 으로 JSON 하나 받아 stdout 으로 JSON 하나. 훅 모듈엔 Node 가 없어서 렌더는 이 프로세스가 한다.
//
//   { items: [{ key, spec, maxColumns, maxRows? }], cellAspect, style?: 'clean' | 'sketch', colors?: { text, grid, category } }
//   maxRows 가 있으면 그 칸 상자를 채우게 그린다(크게 보기). 없으면 높이는 폭의 0.45.
//   -> { results: [{ key, png, columns, rows } | { key, error }] }
//
// spec 은 Vega-Lite JSON 문자열. vega-lite → vega → SVG → resvg 로 PNG.
import fs from 'node:fs'
import { createRequire } from 'node:module'

import rough from 'roughjs'
import * as vega from 'vega'
import * as vl from 'vega-lite'

import { cached } from './diskcache.mjs'

const { Resvg } = createRequire(import.meta.url)('@resvg/resvg-js')

// 터미널 한 칸 너비를 이 CSS 픽셀로 본다. 차트 폭 = 칸 수 × 이 값.
const PX_PER_COLUMN = 8
// PNG 는 2배로 찍어 레티나에서 선명하게.
const SCALE = 2
const FONT = 'Apple SD Gothic Neo'
const FONT_FILE = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
const fontOptions = fs.existsSync(FONT_FILE)
  ? { loadSystemFonts: false, fontFiles: [FONT_FILE], defaultFontFamily: FONT }
  : { loadSystemFonts: true, defaultFontFamily: 'sans-serif' }

// 배경은 투명 — 터미널 테마가 비친다. 글자·축·계열 색은 훅이 herdr 테마에서 골라 넘긴다(colors: text · grid · category).
const GRUVBOX = { text: '#ebdbb2', grid: '#504945', category: ['#83a598', '#b8bb26', '#fe8019', '#d3869b', '#fabd2f', '#8ec07c', '#fb4934', '#a89984'] }
const themeOf = ({ text, grid, category } = GRUVBOX) => ({
  background: null,
  font: FONT,
  padding: 8,
  view: { stroke: null },
  title: { color: text, fontSize: 14, fontWeight: 'bold', anchor: 'start' },
  axis: { labelColor: text, titleColor: text, domainColor: grid, tickColor: grid, gridColor: grid, gridOpacity: 0.35, labelFontSize: 11, titleFontSize: 12 },
  // 막대 그래프 x 축 글자를 눕히지 않는다 — 한글 라벨이 세로로 서면 읽기 어렵다.
  axisBand: { labelAngle: 0 },
  legend: { labelColor: text, titleColor: text, labelFontSize: 11, titleFontSize: 12 },
  header: { labelColor: text, titleColor: text },
  text: { color: text },
  range: { category },
})

// 손그림(style: sketch) — mermaid 와 같은 excalidraw 느낌. 막대·도넛은 손으로 그린 모양을 단색으로 채우고,
// 선·축·격자는 rough.js 로 다시 긋고, 글자는 손글씨체(Gaegu — 한글도 있다)로.
const HAND = 'Gaegu'
const HAND_FILE = new URL('../fonts/Gaegu-Regular.ttf', import.meta.url).pathname
const HAND_SIZE = 1.15  // Gaegu 는 같은 크기에서 작아 보인다
const sketchFontOptions = { ...fontOptions, loadSystemFonts: false, fontFiles: [HAND_FILE, ...(fontOptions.fontFiles ?? [])], defaultFontFamily: HAND }
const roughGen = rough.generator()
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
const drawn = drawable =>
  roughGen.toPaths(drawable).map(p => `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill ?? 'none'}" stroke-linecap="round"/>`).join('')
const wrap = (tag, inner) => {
  const t = attr(tag, 'transform')
  return t ? `<g transform="${t}">${inner}</g>` : inner
}

export function sketchChart(svg, seed = 7) {
  const base = { roughness: 1.3, bowing: 1, seed }
  return svg
    // 막대·도넛·범례 기호(채움 있는 path): 흔들리는 모양을 단색으로 채운다(빗금 없이).
    .replace(/<path\b[^>]*\sfill="(#[0-9a-fA-F]{3,8})"[^>]*\/>/g, (tag, fill) => {
      const d = attr(tag, 'd')
      if (!d || /class="(background|foreground)"/.test(tag)) return tag
      return wrap(tag, drawn(roughGen.path(d, { ...base, fill, fillStyle: 'solid', stroke: fill, strokeWidth: 1.6 })))
    })
    // 선 그래프(채움 없이 stroke 만 있는 path).
    .replace(/<path\b[^>]*\sstroke="(#[0-9a-fA-F]{3,8})"[^>]*\/>/g, (tag, stroke) => {
      const d = attr(tag, 'd')
      if (!d || /\sfill="#/.test(tag) || /class="(background|foreground)"/.test(tag)) return tag
      return wrap(tag, drawn(roughGen.path(d, { ...base, stroke, strokeWidth: Number(attr(tag, 'stroke-width') ?? 2) * 1.2 })))
    })
    // 축·눈금·격자.
    .replace(/<line\b[^>]*\/>/g, tag => {
      const stroke = attr(tag, 'stroke')
      if (!stroke) return tag
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(n => Number(attr(tag, n) ?? 0))
      const op = attr(tag, 'opacity')
      const line = drawn(roughGen.line(x1, y1, x2, y2, { ...base, roughness: 0.9, stroke, strokeWidth: Number(attr(tag, 'stroke-width') ?? 1) }))
      return wrap(tag, op && op !== '1' ? `<g opacity="${op}">${line}</g>` : line)
    })
    .replace(/font-family="[^"]*"/g, `font-family="${HAND}, ${FONT}"`)
    .replace(/font-size="([\d.]+)px"/g, (_, n) => `font-size="${(n * HAND_SIZE).toFixed(1)}px"`)
}

export async function renderChart(specText, { maxColumns, maxRows, cellAspect, style = 'clean', colors }) {
  const spec = JSON.parse(specText)
  // 크기를 안 정했으면 칸 상자에 맞춘다.
  const width = maxColumns * PX_PER_COLUMN - 40
  const height = maxRows ? Math.round(maxRows * PX_PER_COLUMN * cellAspect) - 70 : Math.round(width * 0.45)
  if (Array.isArray(spec.hconcat)) {
    // 나란히 놓은 그래프는 폭을 나눠 갖는다. 범례·간격 몫으로 하나당 60px 뺀다.
    const each = Math.floor(width / spec.hconcat.length) - 60
    for (const child of spec.hconcat) {
      child.width ??= each
      child.height ??= Math.min(height, Math.round(each * 0.75))
    }
  }
  if (spec.width === undefined && !spec.facet && !spec.hconcat && !spec.concat && !spec.repeat) spec.width = width
  if (spec.height === undefined && !spec.facet && !spec.vconcat && !spec.concat && !spec.repeat) spec.height = height
  spec.config = { ...themeOf(colors), ...(spec.config ?? {}) }
  const compiled = spec.$schema?.includes('/vega/') ? spec : vl.compile(spec).spec
  const view = new vega.View(vega.parse(compiled), { renderer: 'none' })
  const svg = await view.toSVG()
  view.finalize()
  const w = Number(/width="([\d.]+)"/.exec(svg)?.[1] ?? 0)
  const h = Number(/height="([\d.]+)"/.exec(svg)?.[1] ?? 0)
  if (!(w > 0 && h > 0)) throw new Error('빈 차트')
  // 칸 상자 비율 = 그림 비율이어야 안 찌그러진다. 1칸 = 너비 PX_PER_COLUMN, 높이 그 cellAspect 배.
  let columns = Math.max(1, Math.round(w / PX_PER_COLUMN))
  let rows = Math.max(1, Math.round(h / (PX_PER_COLUMN * cellAspect)))
  // 정해 둔 크기가 칸 상자를 넘으면 비율을 지켜 줄인다.
  const shrink = Math.min(1, maxColumns / columns, (maxRows ?? 255) / rows, 255 / rows, 255 / columns)
  columns = Math.max(1, Math.floor(columns * shrink))
  rows = Math.max(1, Math.floor(rows * shrink))
  const hand = style === 'sketch'
  const png = new Resvg(hand ? sketchChart(svg) : svg, { fitTo: { mode: 'zoom', value: SCALE }, font: hand ? sketchFontOptions : fontOptions }).render().asPng()
  return { png: png.toString('base64'), columns, rows }
}

// 직접 실행일 때만 — 두 경로를 실제 경로로 맞춰 비교한다. 심링크 경로(~/.claude-work/plugins → ~/.claude/plugins)로
// 띄우면 import.meta.url 은 실제 경로, argv[1] 은 심링크라 글자 비교가 늘 거짓 → 아무것도 안 내고 0 으로 끝났다(2026-10-08).
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  const req = JSON.parse(fs.readFileSync(0, 'utf8'))
  const results = []
  for (const item of req.items) {
    try {
      const opts = { maxColumns: item.maxColumns, maxRows: item.maxRows, cellAspect: req.cellAspect ?? 2.2, style: req.style, colors: req.colors }
      results.push({ key: item.key, ...(await cached(import.meta.url, { spec: item.spec, opts }, () => renderChart(item.spec, opts))) })
    } catch (error) {
      results.push({ key: item.key, error: String(error?.message ?? error).split('\n')[0].slice(0, 200) })
    }
  }
  process.stdout.write(JSON.stringify({ results }))
}
