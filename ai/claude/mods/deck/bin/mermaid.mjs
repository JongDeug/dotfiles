// stdin 으로 JSON 하나 받아 stdout 으로 JSON 하나 돌려준다. 훅 모듈은 Node 가 없어서
// 렌더는 이 프로세스가 한다.
//
//   { items: [{ key, source, kind: 'png' | 'text', maxColumns }], theme, cellAspect, scale, style: 'clean' | 'sketch', maxRows? }
//   -> { results: [{ key, png, columns, rows } | { key, text } | { key, error }] }
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { THEMES, renderMermaidASCII, renderMermaidSVG } from 'beautiful-mermaid'
import rough from 'roughjs'

const { Resvg } = createRequire(import.meta.url)('@resvg/resvg-js')

// 한글·CJK 는 터미널에서 2칸인데 beautiful-mermaid 는 1칸으로 센다. 글자마다 보이지 않는
// 1칸짜리(사용자 영역 U+E000)를 붙여 2칸으로 세게 하고, 다 그린 뒤 뺀다.
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/gu
const PAD = ''

// 글꼴에 없는 흔한 기호를 있는 글자로 — 없으면 □ 나 빈칸이 된다.
const SYMBOLS = { '\u2212': '-', '\u2013': '-', '\u2014': '-' }
const plain = source => asciiSubgraphs(source.replace(/[\u2212\u2013\u2014]/g, c => SYMBOLS[c]))

// beautiful-mermaid(SVG)\ub294 ASCII \uac00 \uc544\ub2cc subgraph id \ub97c \uc11c\ub85c \uac00\ub974\uc9c0 \ubabb\ud574 \uce78\ub4e4\uc744 \uccab \uce78 \ud558\ub098\ub85c \ud569\uce5c\ub2e4.
// \uc81c\ubaa9 \uc5c6\ub294 `subgraph \uc9c0\uae08` \uc744 `subgraph sg1["\uc9c0\uae08"]` \uc73c\ub85c \ubc14\uafb8\uace0, \uadf8 id \ub97c \uac00\ub9ac\ud0a4\ub294 \uacf3(\ud654\uc0b4\ud45c \ub05d\u00b7class\u00b7style)\ub3c4
// sg1 \ub85c \ubc14\uafbc\ub2e4. \ub77c\ubca8([\u2026] (\u2026) {\u2026} "\u2026" |\u2026|) \uc18d \uae00\uc790\ub294 \uac74\ub4dc\ub9ac\uc9c0 \uc54a\ub294\ub2e4. \ubc14\uafc0 \uac8c \uc5c6\uc73c\uba74 \uc18c\uc2a4\ub97c \uadf8\ub300\ub85c \ub3cc\ub824\uc900\ub2e4.
export function asciiSubgraphs(source) {
  const ids = new Map()
  const lines = source.split('\n').map(line => {
    const m = /^(\s*subgraph\s+)([^\s[\]"(){}]+)\s*$/.exec(line)
    if (!m || /^[\x00-\x7f]+$/.test(m[2])) return line
    if (!ids.has(m[2])) ids.set(m[2], `sg${ids.size + 1}`)
    return `${m[1]}${ids.get(m[2])}["${m[2]}"]`
  })
  if (ids.size === 0) return source
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const ref = new RegExp(`(\\[[^\\]]*\\]|\\([^)]*\\)|\\{[^}]*\\}|"[^"]*"|\\|[^|]*\\|)|(?<![\\p{L}\\p{N}_])(${[...ids.keys()].map(esc).join('|')})(?![\\p{L}\\p{N}_])`, 'gu')
  return lines
    .map(line => (/^\s*(subgraph\s|%%)/.test(line) ? line : line.replace(ref, (all, label, id) => (label ? label : ids.get(id)))))
    .join('\n')
}

export function renderText(source) {
  const art = renderMermaidASCII(plain(source).replace(WIDE, c => c + PAD), { colorMode: 'none' })
  const text = art.replaceAll(PAD, '').split('\n').map(l => l.trimEnd()).join('\n').trimEnd()
  if (!text) throw new Error('nothing to draw')
  return { text }
}

// SVG 1행 높이(px). beautiful-mermaid 라벨이 13px 이라 터미널 글자와 비슷하게 맞춘 값.
const ROW_SVG_PX = 17
// PNG 1행 높이(px) — 선명도만 정한다. 터미널이 칸에 맞춰 늘이고 줄인다.
const ROW_PNG_PX = 40
// 한글이 들어 있는 맥 기본 글꼴. 시스템 글꼴 전부를 읽으면 1.3초다.
// 없는 머신(리눅스)에선 시스템 글꼴 전부로 물러난다.
const FONT = 'Apple SD Gothic Neo'
const FONT_FILE = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
// .ttc 는 굵기 18개를 한 파일에 묶었다 — resvg 가 라벨마다 그걸 뒤져 라벨 11개에 1초가 든다.
// 라벨이 쓰는 굵기(400 Regular · 500 Medium)만 한 번 떼어 캐시해 두면 25ms 다.
const FACES = [0, 2]

// TTC 의 한 글꼴(얼굴)을 단독 TTF 로 옮긴다: 표 목록을 다시 쓰고 표를 그대로 붙인다.
export function extractFace(ttc, index) {
  if (ttc.toString('latin1', 0, 4) !== 'ttcf') throw new Error('not a ttc')
  const start = ttc.readUInt32BE(12 + index * 4)
  const count = ttc.readUInt16BE(start + 4)
  const tables = Array.from({ length: count }, (_, i) => {
    const at = start + 12 + i * 16
    return { record: ttc.subarray(at, at + 16), offset: ttc.readUInt32BE(at + 8), length: ttc.readUInt32BE(at + 12) }
  })
  const head = Buffer.from(ttc.subarray(start, start + 12 + count * 16))
  const parts = [head]
  let offset = head.length
  tables.forEach(({ offset: from, length }, i) => {
    head.writeUInt32BE(offset, 12 + i * 16 + 8)
    const padded = Buffer.alloc((length + 3) & ~3)
    ttc.copy(padded, 0, from, from + length)
    parts.push(padded)
    offset += padded.length
  })
  return Buffer.concat(parts)
}

function cachedFaces() {
  const dir = path.join(os.tmpdir(), 'claude-mermaid-fonts')
  const files = FACES.map(i => path.join(dir, `AppleSDGothicNeo-${i}.ttf`))
  if (files.every(f => fs.existsSync(f))) return files
  fs.mkdirSync(dir, { recursive: true })
  const ttc = fs.readFileSync(FONT_FILE)
  files.forEach((file, i) => {
    const tmp = `${file}.${process.pid}`
    fs.writeFileSync(tmp, extractFace(ttc, FACES[i]))
    fs.renameSync(tmp, file)  // 동시에 두 번 그려도 반쯤 쓴 파일을 읽지 않는다
  })
  return files
}

function fontSetup() {
  if (!fs.existsSync(FONT_FILE)) return { loadSystemFonts: true, defaultFontFamily: 'sans-serif' }
  try {
    return { loadSystemFonts: false, fontFiles: cachedFaces(), defaultFontFamily: FONT }
  } catch {
    return { loadSystemFonts: false, fontFiles: [FONT_FILE], defaultFontFamily: FONT }  // 느려도 그린다
  }
}
const fontOptions = fontSetup()

// 손그림(sketch): excalidraw 처럼 rough.js 로 상자 · 선을 다시 긋고 손글씨체(Gaegu, OFL)로 쓴다. 없는 글자는 위 글꼴로.
const HAND = 'Gaegu'
const HAND_FILE = new URL('../fonts/Gaegu-Regular.ttf', import.meta.url).pathname
const HAND_SIZE = 1.15  // Gaegu 는 같은 크기에서 작아 보인다
const sketchFontOptions = { ...fontOptions, fontFiles: [HAND_FILE, ...(fontOptions.fontFiles ?? [])], defaultFontFamily: HAND }
const roughGen = rough.generator()
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
const roughPaths = drawable =>
  roughGen.toPaths(drawable).map(p => `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="none" stroke-linecap="round"/>`).join('')

// 손으로 그은 선으로 바꾼다 — 상자·다각형(마름모·육각형…)·원·타원·직선·꺾은선·path 모두.
// 원래 도형은 채움만 남기고(선은 지운다) 그 위에 rough 선을 얹는다. <defs> 안(화살촉 marker 등)은 그대로 둔다.
const NUMS = /-?\d+(?:\.\d+)?(?:e-?\d+)?/g
const pairs = text => {
  const n = (text.match(NUMS) ?? []).map(Number)
  const out = []
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]])
  return out
}
const num = (tag, name, fallback = 0) => {
  const v = Number(attr(tag, name))
  return Number.isFinite(v) ? v : fallback
}

export function sketch(svg, seed = 7) {
  const opts = (stroke, width) => ({ stroke, strokeWidth: Number(width ?? 1) * 1.4, roughness: 1.2, bowing: 1.2, seed })
  // 작은 원·타원·다각형(상태도 시작·끝 점, ER 기호 같은 아이콘)은 반듯하게 둔다 — 손그림이면 뭉툭한 덩어리가 된다.
  // 상자(rect)는 작아도(화살표 위 라벨) 다른 상자와 맞춰 손그림으로.
  const SMALL = 32
  // 선만 지우고(채움은 남긴다) 손그림 선을 얹는다. 선이 없는 도형은 건드리지 않는다.
  // 화살촉(marker)이 달린 선은 지우지 않고 투명하게 — 지우면 화살촉도 같이 사라진다.
  const redraw = (tag, make, size = Infinity) => {
    const stroke = attr(tag, 'stroke')
    if (!stroke || stroke === 'none' || size < SMALL) return tag
    const drawable = make(opts(stroke, attr(tag, 'stroke-width')))
    if (!drawable) return tag
    const hidden = /\smarker-(start|mid|end)=/.test(tag) ? tag.replace(/\/>$/, ' stroke-opacity="0"/>') : tag.replace(/\sstroke="[^"]*"/, ' stroke="none"')
    const t = attr(tag, 'transform')
    const lines = roughPaths(drawable)
    return hidden + (t ? `<g transform="${t}">${lines}</g>` : lines)
  }
  const defs = []
  const body = svg.replace(/<defs\b[\s\S]*?<\/defs>/g, m => {
    defs.push(m)
    return `\u0000${defs.length - 1}\u0000`
  })
  return body
    .replace(/<rect\b[^>]*\/>/g, tag => {
      const [x, y, w, h] = [num(tag, 'x'), num(tag, 'y'), num(tag, 'width'), num(tag, 'height')]
      return redraw(tag, o => (w > 0 && h > 0 ? roughGen.rectangle(x, y, w, h, o) : null))
    })
    .replace(/<polygon\b[^>]*\/>/g, tag => {
      const pts = pairs(attr(tag, 'points') ?? '')
      const xs = pts.map(q => q[0])
      const ys = pts.map(q => q[1])
      const size = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
      return redraw(tag, o => (pts.length >= 3 ? roughGen.polygon(pts, o) : null), size)
    })
    .replace(/<polyline\b[^>]*\/>/g, tag => redraw(tag, o => {
      const pts = pairs(attr(tag, 'points') ?? '')
      return pts.length >= 2 ? roughGen.linearPath(pts, o) : null
    }))
    .replace(/<circle\b[^>]*\/>/g, tag => {
      const r = num(tag, 'r')
      return redraw(tag, o => (r > 0 ? roughGen.circle(num(tag, 'cx'), num(tag, 'cy'), r * 2, o) : null), r * 2)
    })
    .replace(/<ellipse\b[^>]*\/>/g, tag => {
      const [rx, ry] = [num(tag, 'rx'), num(tag, 'ry')]
      return redraw(tag, o => (rx > 0 && ry > 0 ? roughGen.ellipse(num(tag, 'cx'), num(tag, 'cy'), rx * 2, ry * 2, o) : null), Math.min(rx, ry) * 2)
    })
    .replace(/<line\b[^>]*\/>/g, tag => redraw(tag, o => roughGen.line(num(tag, 'x1'), num(tag, 'y1'), num(tag, 'x2'), num(tag, 'y2'), o)))
    .replace(/<path\b[^>]*\/>/g, tag => redraw(tag, o => {
      const d = attr(tag, 'd')
      return d ? roughGen.path(d, o) : null
    }))
    .replace(/\u0000(\d+)\u0000/g, (_, i) => defs[Number(i)])
}

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

// beautiful-mermaid 에 없는 gruvbox dark — herdr 테마에 맞춘다(선은 bg3, 강조는 herdr 노랑).
const OWN_THEMES = { gruvbox: { bg: '#282828', fg: '#ebdbb2', line: '#665c54', accent: '#fabd2f', muted: '#a89984' } }

export function renderPicture(source, { theme, cellAspect, maxColumns, maxRows = 255, scale = 1, style = 'clean' }) {
  const colors = OWN_THEMES[theme] ?? THEMES[theme] ?? OWN_THEMES.gruvbox
  const hand = style === 'sketch'
  const raw = renderMermaidSVG(plain(source), { ...colors, font: hand ? HAND : FONT, transparent: true, padding: 8 })
  const [, , w, h] = (/viewBox="([^"]+)"/.exec(raw)?.[1] ?? '').split(/\s+/).map(Number)
  if (!(w > 0 && h > 0)) throw new Error('nothing to draw')
  // 칸 상자의 가로세로 비율을 그림 비율에 맞춰야 안 찌그러진다. 1칸 = 높이 1/cellAspect.
  let rows = Math.ceil((h * scale) / ROW_SVG_PX)  // scale 1 = 라벨이 터미널 글자 크기
  let columns = Math.round((rows * cellAspect * w) / h)
  if (columns > maxColumns) {
    columns = maxColumns
    rows = Math.max(1, Math.round((columns * h) / (w * cellAspect)))
  }
  // 키 큰 그림은 max_rows 에서 자른다 — 폭은 비율대로 줄인다(크게 보기로 펼쳐 본다).
  if (rows > Math.min(maxRows, 255)) {
    rows = Math.min(maxRows, 255)
    columns = Math.max(1, Math.round((rows * cellAspect * w) / h))
  }
  let svg = resolveCss(raw).replace(/font-family:[^;}]*/g, hand ? `font-family: '${HAND}', '${FONT}'` : `font-family: '${FONT}'`)
  if (hand) svg = sketch(svg).replace(/font-size="([\d.]+)"/g, (_, s) => `font-size="${(s * HAND_SIZE).toFixed(1)}"`)
  const png = new Resvg(svg, {
    fitTo: { mode: 'height', value: rows * ROW_PNG_PX },
    font: hand ? sketchFontOptions : fontOptions,
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
