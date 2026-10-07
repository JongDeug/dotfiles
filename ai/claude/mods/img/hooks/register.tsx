import type { EngineInterface, Register } from 'claude-code'

import { gridFor, isImagePath, splitImages } from './images'

type Converted = { file: string; width: number; height: number } | { error: string }

// 변환 결과는 경로별로 기억한다. 렌더 중엔 기다리지 않고, 없으면 줄에 올려 두었다가 타이머가 한꺼번에 바꾼다.
// TODO: 같은 경로에 이미지가 새로 써져도 이 세션에선 옛 그림 — 필요하면 mtime 을 키에 넣는다.
const converted = new Map<string, Converted>()
const queue = new Set<string>()
let busy = false
let cacheDir = ''

const PROMPT = [
  '# Images in this terminal',
  'This terminal shows image files inline. To show the user an image file (a detection frame, a plot, a screenshot), put `![short description](/absolute/path.png)` on a line of its own in your reply.',
  'To compare images side by side (say the same frame from two models), put them on one line separated by a space: `![v6](/a.png) ![v7](/b.png)`.',
  'A video path works the same way (`![drone flight](/abs/clip.mp4)`): it is shown as six frames spread over the video.',
  'Reading an image file with the Read tool also shows it to them under the tool call.',
].join('\n')

function lookup(path: string): Converted | undefined {
  const hit = converted.get(path)
  if (!hit) queue.add(path)
  return hit
}

async function drain($: EngineInterface): Promise<void> {
  if (busy || queue.size === 0) return
  busy = true
  const paths = [...queue]
  queue.clear()
  try {
    const { stdout } = await $.process.run(['/bin/sh', `${$.plugin.root}/bin/convert.sh`, cacheDir, ...paths], { timeoutMs: 60_000 })
    for (const line of stdout.split('\n')) {
      if (!line.startsWith('{')) continue
      const { path, ...rest } = JSON.parse(line) as { path: string } & Converted
      converted.set(path, rest)
    }
  } catch (error) {
    for (const p of paths) converted.set(p, { error: String(error) })
  } finally {
    busy = false
  }
  $.ui.invalidate('ui.render')
}

export const register: Register = (on, options) => {
  const cellAspect = typeof options.cell_aspect === 'number' ? options.cell_aspect : 2.2
  const maxRows = typeof options.max_rows === 'number' ? options.max_rows : 30

  on('session.start', async ($, e, next) => {
    cacheDir = `${(await $.env.get('HOME')) ?? '/tmp'}/.cache/claude-img`
    $.clock.every(150, () => void drain($))
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.surfaces.includes('terminal')) return composed
    return { sections: [...composed.sections, { id: 'img:inline', text: PROMPT, scope: 'session' as const }] }
  })

  // Read 로 이미지를 읽은 줄 아래에 그 그림.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.tool !== 'Read' || e.props.isRunning || e.props.isErrored) return next(e)
    const path = (e.props.input as { file_path?: unknown } | null)?.file_path
    if (!isImagePath(path)) return next(e)
    const row = await next(e)
    const img = lookup(path)
    if (!img || 'error' in img) return row
    const { Box, Image } = $.ui.resolve(e)
    const grid = gridFor(img.width, img.height, Math.min(100, (e.viewport?.columns ?? 80) - 6), maxRows, cellAspect)
    return (
      <Box flexDirection="column">
        {row}
        <Box paddingLeft={5}>
          <Image source={{ file: img.file, format: 'png' }} columns={grid.columns} rows={grid.rows} alt={`[이미지: ${path}]`} />
        </Box>
      </Box>
    )
  })

  // 답 속 `![설명](/경로.png)` 줄을 그림으로.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const segments = splitImages(e.props.text)
    if (!segments.some(s => s.kind === 'image')) return next(e)
    const { Box, Image, Text } = $.ui.resolve(e)
    const maxColumns = Math.min(100, (e.viewport?.columns ?? 80) - 3)
    const rows = []
    let isFirst = e.props.isFirstOfReply
    for (const s of segments) {
      // 한 줄의 그림이 다 준비돼야 그린다 — 그 전엔 원래 글(이미지 문법)로 둔다.
      const imgs = s.kind === 'image' ? s.pictures.map(p => lookup(p.path)) : []
      const ready = s.kind === 'image' && imgs.every(i => i && !('error' in i))
      if (s.kind === 'text' || !ready) {
        const drawn = await next({ ...e, props: { ...e.props, text: s.kind === 'text' ? s.text : s.raw, isFirstOfReply: isFirst } })
        // 엔진은 답의 첫 덩어리에만 거터(⏺)를 붙인다 — 이어지는 조각은 여기서 맞춘다.
        rows.push(isFirst ? drawn : <Box flexDirection="row"><Box width={2} flexShrink={0} /><Box flexDirection="column" flexGrow={1} flexShrink={1}>{drawn}</Box></Box>)
      } else {
        // 여러 장이면 폭을 나눠 나란히. 각 그림 밑에 설명.
        const gap = 2
        const each = Math.floor((maxColumns - gap * (s.pictures.length - 1)) / s.pictures.length)
        rows.push(
          <Box flexDirection="row" marginTop={1}>
            <Box width={2} flexShrink={0}><Text>{isFirst ? '⏺' : ' '}</Text></Box>
            <Box flexDirection="row" columnGap={gap}>
              {s.pictures.map((p, i) => {
                const img = imgs[i] as { file: string; width: number; height: number }
                const grid = gridFor(img.width, img.height, each, maxRows, cellAspect)
                return (
                  <Box flexDirection="column">
                    <Image source={{ file: img.file, format: 'png' }} columns={grid.columns} rows={grid.rows} alt={`[이미지: ${p.alt || p.path}]`} />
                    {p.alt ? <Text dimColor wrap="truncate-end">{p.alt}</Text> : null}
                  </Box>
                )
              })}
            </Box>
          </Box>,
        )
      }
      isFirst = false
    }
    return <Box flexDirection="column">{rows}</Box>
  })
}
