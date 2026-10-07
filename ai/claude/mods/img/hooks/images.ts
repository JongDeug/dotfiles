// 화면도 엔진도 모르는 규칙만 — 테스트가 여기를 본다.

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic)$/i
// 영상은 프레임 몇 장을 한 장으로 붙여 보여 준다(bin/convert.sh).
const VIDEO_EXT = /\.(mp4|mov|mkv|webm|avi|m4v)$/i

export const isImagePath = (path: unknown): path is string => typeof path === 'string' && path.startsWith('/') && IMAGE_EXT.test(path)
export const isMediaPath = (path: unknown): path is string => isImagePath(path) || (typeof path === 'string' && path.startsWith('/') && VIDEO_EXT.test(path))

export type Picture = { path: string; alt: string }
export type Segment = { kind: 'text'; text: string } | { kind: 'image'; pictures: Picture[]; raw: string }

// 줄 하나가 통째로 `![설명](/절대/경로.png)` 들인 것만 그림으로 바꾼다 — 여러 개면 나란히.
// 문장 중간의 이미지 문법·URL 은 글로 둔다.
const ONE = '!\\[([^\\]\\n]*)\\]\\((\\/[^)\\s]+)\\)'
const LINE = new RegExp(`^${ONE}(?:[ \\t]+${ONE})*[ \\t]*$`, 'gm')
const EACH = new RegExp(ONE, 'g')

export function splitImages(text: string): Segment[] {
  const out: Segment[] = []
  let at = 0
  const pushText = (s: string) => {
    if (s.trim()) out.push({ kind: 'text', text: s.replace(/^\n+|\n+$/g, '') })
  }
  for (const m of text.matchAll(LINE)) {
    const pictures = [...m[0].matchAll(EACH)].map(x => ({ alt: x[1] ?? '', path: x[2] ?? '' }))
    if (!pictures.every(p => isMediaPath(p.path))) continue
    pushText(text.slice(at, m.index))
    out.push({ kind: 'image', pictures, raw: m[0] })
    at = (m.index ?? 0) + m[0].length
  }
  pushText(text.slice(at))
  return out
}

// 그림 비율을 지키는 칸 수. 한 칸은 높이가 너비의 cellAspect 배. 폭·높이 한도 안에서 가장 크게.
export function gridFor(width: number, height: number, maxColumns: number, maxRows: number, cellAspect = 2.2): { columns: number; rows: number } {
  let columns = Math.max(1, Math.min(maxColumns, 255))
  let rows = Math.round((columns * height) / (width * cellAspect))
  if (rows > maxRows) {
    rows = maxRows
    columns = Math.max(1, Math.round((rows * width * cellAspect) / height))
  }
  return { columns, rows: Math.max(1, Math.min(rows, 255)) }
}
