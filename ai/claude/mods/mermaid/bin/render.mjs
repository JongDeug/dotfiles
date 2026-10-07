// stdin 으로 JSON 하나 받아 stdout 으로 JSON 하나 돌려준다. 훅 모듈은 Node 가 없어서
// 렌더는 이 프로세스가 한다.
//
//   { items: [{ key, source, kind: 'png' | 'text', maxColumns }], theme, cellAspect, scale }
//   -> { results: [{ key, png, columns, rows } | { key, text } | { key, error }] }
import fs from 'node:fs'
import { createRequire } from 'node:module'

import { THEMES, renderMermaidASCII, renderMermaidSVG } from 'beautiful-mermaid'

const { Resvg } = createRequire(import.meta.url)('@resvg/resvg-js')

// 한글·CJK 는 터미널에서 2칸인데 beautiful-mermaid 는 1칸으로 센다. 글자마다 보이지 않는
// 1칸짜리(사용자 영역 U+E000)를 붙여 2칸으로 세게 하고, 다 그린 뒤 뺀다.
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/gu
const PAD = ''

export function renderText(source) {
  const art = renderMermaidASCII(source.replace(WIDE, c => c + PAD), { colorMode: 'none' })
  const text = art.replaceAll(PAD, '').split('\n').map(l => l.trimEnd()).join('\n').trimEnd()
  if (!text) throw new Error('nothing to draw')
  return { text }
}

// SVG 1행 높이(px). beautiful-mermaid 라벨이 13px 이라 터미널 글자와 비슷하게 맞춘 값.
const ROW_SVG_PX = 17
// PNG 1행 높이(px) — 선명도만 정한다. 터미널이 칸에 맞춰 늘이고 줄인다.
const ROW_PNG_PX = 40
// 한글이 들어 있는 맥 기본 글꼴. 파일 하나만 읽으면 30ms, 시스템 글꼴 전부면 1.3초다.
// 없는 머신(리눅스)에선 시스템 글꼴 전부로 물러난다.
const FONT = 'Apple SD Gothic Neo'
const FONT_FILE = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
const fontOptions = fs.existsSync(FONT_FILE)
  ? { loadSystemFonts: false, fontFiles: [FONT_FILE], defaultFontFamily: FONT }
  : { loadSystemFonts: true, defaultFontFamily: 'sans-serif' }

function mix(a, b, p) {
  const ch = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return '#' + [0, 1, 2].map(i => Math.round(ch(a, i) * p + ch(b, i) * (1 - p)).toString(16).padStart(2, '0')).join('')
}

// resvg 는 CSS 변수와 color-mix() 를 모른다. 안쪽부터 hex 로 풀어 넣는다.
export function resolveCss(svg) {
  const vars = {}
  for (const [, k, v] of svg.matchAll(/(--[\w-]+)\s*:\s*([^;"]+)/g)) vars[k] ??= v.trim()
  let out = svg.replace(/@import[^;]*;/g, '')
  for (let prev = ''; prev !== out; ) {
    prev = out
    out = out
      .replace(/var\((--[\w-]+)(?:,\s*([^()]*))?\)/g, (m, k, fb) => vars[k] ?? fb ?? m)
      .replace(/color-mix\(in srgb,\s*(#[0-9a-f]{6})\s+([\d.]+)%,\s*(#[0-9a-f]{6})\)/gi, (_, a, p, b) => mix(a, b, p / 100))
  }
  return out
}

export function renderPicture(source, { theme, cellAspect, maxColumns, scale = 1 }) {
  const colors = THEMES[theme] ?? THEMES['catppuccin-mocha']
  const raw = renderMermaidSVG(source, { ...colors, font: FONT, transparent: true, padding: 8 })
  const [, , w, h] = (/viewBox="([^"]+)"/.exec(raw)?.[1] ?? '').split(/\s+/).map(Number)
  if (!(w > 0 && h > 0)) throw new Error('nothing to draw')
  // 칸 상자의 가로세로 비율을 그림 비율에 맞춰야 안 찌그러진다. 1칸 = 높이 1/cellAspect.
  let rows = Math.ceil((h * scale) / ROW_SVG_PX)  // scale 1 = 라벨이 터미널 글자 크기
  let columns = Math.round((rows * cellAspect * w) / h)
  if (columns > maxColumns) {
    columns = maxColumns
    rows = Math.max(1, Math.round((columns * h) / (w * cellAspect)))
  }
  rows = Math.min(rows, 255)
  const svg = resolveCss(raw).replace(/font-family:[^;}]*/g, `font-family: '${FONT}'`)
  const png = new Resvg(svg, {
    fitTo: { mode: 'height', value: rows * ROW_PNG_PX },
    font: fontOptions,
  })
    .render()
    .asPng()
  return { png: png.toString('base64'), columns, rows }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const req = JSON.parse(fs.readFileSync(0, 'utf8'))
  const results = req.items.map(item => {
    try {
      const r = item.kind === 'text' ? renderText(item.source) : renderPicture(item.source, { ...req, maxColumns: item.maxColumns })
      return { key: item.key, ...r }
    } catch (error) {
      return { key: item.key, error: String(error?.message ?? error).split('\n')[0].slice(0, 200) }
    }
  })
  process.stdout.write(JSON.stringify({ results }))
}
