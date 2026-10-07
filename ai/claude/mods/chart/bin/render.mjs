// stdin 으로 JSON 하나 받아 stdout 으로 JSON 하나. 훅 모듈엔 Node 가 없어서 렌더는 이 프로세스가 한다.
//
//   { items: [{ key, spec, maxColumns }], cellAspect }
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

export async function renderChart(specText, { maxColumns, cellAspect }) {
  const spec = JSON.parse(specText)
  // 크기를 안 정했으면 터미널 폭에 맞춘다. 높이는 폭의 0.45.
  const width = Math.min(maxColumns, 110) * PX_PER_COLUMN - 40
  if (spec.width === undefined && !spec.facet && !spec.hconcat && !spec.concat && !spec.repeat) spec.width = width
  if (spec.height === undefined && !spec.facet && !spec.vconcat && !spec.concat && !spec.repeat) spec.height = Math.round(width * 0.45)
  spec.config = { ...THEME, ...(spec.config ?? {}) }
  const compiled = spec.$schema?.includes('/vega/') ? spec : vl.compile(spec).spec
  const view = new vega.View(vega.parse(compiled), { renderer: 'none' })
  const svg = await view.toSVG()
  view.finalize()
  const w = Number(/width="([\d.]+)"/.exec(svg)?.[1] ?? 0)
  const h = Number(/height="([\d.]+)"/.exec(svg)?.[1] ?? 0)
  if (!(w > 0 && h > 0)) throw new Error('빈 차트')
  // 칸 상자 비율 = 그림 비율이어야 안 찌그러진다. 1칸 = 너비 PX_PER_COLUMN, 높이 그 cellAspect 배.
  const columns = Math.min(255, Math.max(1, Math.round(w / PX_PER_COLUMN)))
  const rows = Math.min(255, Math.max(1, Math.round(h / (PX_PER_COLUMN * cellAspect))))
  const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: SCALE }, font: fontOptions }).render().asPng()
  return { png: png.toString('base64'), columns, rows }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const req = JSON.parse(fs.readFileSync(0, 'utf8'))
  const results = []
  for (const item of req.items) {
    try {
      results.push({ key: item.key, ...(await renderChart(item.spec, { maxColumns: item.maxColumns, cellAspect: req.cellAspect ?? 2.2 })) })
    } catch (error) {
      results.push({ key: item.key, error: String(error?.message ?? error).split('\n')[0].slice(0, 200) })
    }
  }
  process.stdout.write(JSON.stringify({ results }))
}
