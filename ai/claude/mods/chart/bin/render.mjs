// stdin 으로 JSON 하나 받아 stdout 으로 JSON 하나. 훅 모듈엔 Node 가 없어서 렌더는 이 프로세스가 한다.
//
//   { items: [{ key, spec, maxColumns, maxRows? }], cellAspect }
//   maxRows 가 있으면 그 칸 상자를 채우게 그린다(크게 보기). 없으면 높이는 폭의 0.45.
//   -> { results: [{ key, png, columns, rows } | { key, error }] }
//
// spec 은 Vega-Lite JSON 문자열. vega-lite → vega → SVG → resvg 로 PNG.
import fs from 'node:fs'
import { createRequire } from 'node:module'

import * as vega from 'vega'
import * as vl from 'vega-lite'

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

// 배경은 투명 — 터미널 테마가 비친다. 글자·축은 밝은 회색이라 어두운 테마(Catppuccin)에 맞춘다.
const TEXT = '#cad3f5'
const GRID = '#494d64'
const THEME = {
  background: null,
  font: FONT,
  padding: 8,
  view: { stroke: null },
  title: { color: TEXT, fontSize: 14, fontWeight: 'bold', anchor: 'start' },
  axis: { labelColor: TEXT, titleColor: TEXT, domainColor: GRID, tickColor: GRID, gridColor: GRID, gridOpacity: 0.35, labelFontSize: 11, titleFontSize: 12 },
  // 막대 그래프 x 축 글자를 눕히지 않는다 — 한글 라벨이 세로로 서면 읽기 어렵다.
  axisBand: { labelAngle: 0 },
  legend: { labelColor: TEXT, titleColor: TEXT, labelFontSize: 11, titleFontSize: 12 },
  header: { labelColor: TEXT, titleColor: TEXT },
  text: { color: TEXT },
  range: { category: ['#8aadf4', '#a6da95', '#f5a97f', '#c6a0f6', '#eed49f', '#91d7e3', '#f5bde6', '#ed8796'] },
}

export async function renderChart(specText, { maxColumns, maxRows, cellAspect }) {
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
  spec.config = { ...THEME, ...(spec.config ?? {}) }
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
  const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: SCALE }, font: fontOptions }).render().asPng()
  return { png: png.toString('base64'), columns, rows }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const req = JSON.parse(fs.readFileSync(0, 'utf8'))
  const results = []
  for (const item of req.items) {
    try {
      results.push({ key: item.key, ...(await renderChart(item.spec, { maxColumns: item.maxColumns, maxRows: item.maxRows, cellAspect: req.cellAspect ?? 2.2 })) })
    } catch (error) {
      results.push({ key: item.key, error: String(error?.message ?? error).split('\n')[0].slice(0, 200) })
    }
  }
  process.stdout.write(JSON.stringify({ results }))
}
