import type { EngineInterface, Register } from 'claude-code'

import { pickMode, splitReply, type Mode } from './parse'

type Drawing = { png: string; columns: number; rows: number } | { text: string } | { error: string }
type Job = { key: string; source: string; kind: 'png' | 'text'; maxColumns: number }

// 모듈 변수는 리로드 때 비워진다. session.start 는 다시 오지 않으니 모드는 처음 쓸 때 정하고,
// 그리기는 타이머 없이 쌓을 때마다 깨운다 — 세션 중에 설치하거나 /reload-plugins 해도 그린다.
const drawings = new Map<string, Drawing>()
const queue = new Map<string, Job>()
let isRendering = false
let mode: Mode | undefined
// 크게 보기 pane 에 띄운 그림. 이미 그린 PNG 를 pane 크기로 키워 보인다(1행 40px 로 그려 두어 두세 배까지 선명하다).
const VIEW = 'mermaid-view'
const ACCENT = '#8aadf4'
let viewing: { png: string; columns: number; rows: number; title: string } | null = null

async function modeOf($: EngineInterface, wanted: unknown): Promise<Mode> {
  mode ??= pickMode(typeof wanted === 'string' ? wanted : 'auto', {
    TERM: await $.env.get('TERM'),
    TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
    KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'),
    TMUX: await $.env.get('TMUX'),
    CLAUDE_CODE_FORCE_TERMINAL_IMAGES: await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'),
  })
  return mode
}

const PROMPT = [
  '# Mermaid diagrams',
  'This terminal draws ```mermaid code blocks in your replies as diagrams.',
  'When a flow, sequence, state machine or entity model is clearer drawn than written, put a mermaid block at the top level of the reply (not inside a list).',
  'Keep it small: about 12 nodes, short one-line labels (no <br/>). Node ids in ASCII; labels may be Korean.',
].join('\n')

// 쌓인 다이어그램을 node 한 번으로 그리고, 다 그리면 다시 그리게 한다.
async function drain($: EngineInterface, theme: string, cellAspect: number, scale: number, style: string): Promise<void> {
  if (isRendering || queue.size === 0) return
  isRendering = true
  const items = [...queue.values()]
  queue.clear()
  try {
    const { exitCode, stdout, stderr } = await $.process.run(['node', `${$.plugin.root}/bin/render.mjs`], {
      stdin: JSON.stringify({ items, theme, cellAspect, scale, style }),
      timeoutMs: 30_000,
    })
    if (exitCode !== 0) throw new Error(stderr.trim().split('\n').pop() ?? `exit ${exitCode}`)
    for (const { key, ...drawing } of JSON.parse(stdout).results as ({ key: string } & Drawing)[]) drawings.set(key, drawing)
  } catch (error) {
    for (const item of items) drawings.set(item.key, { error: String(error) })
  } finally {
    isRendering = false
  }
  $.ui.invalidate('ui.render')
  void drain($, theme, cellAspect, scale, style)  // 그리는 동안 쌓인 것
}

async function openView($: EngineInterface, next: { png: string; columns: number; rows: number; title: string }): Promise<void> {
  viewing = next
  await $.ui.open({ id: VIEW, title: next.title.slice(0, 40) || 'mermaid', focus: true, closeOnEscape: true, rows: 40 })
  $.ui.invalidate('ui.render')
}

export const register: Register = (on, options) => {
  const theme = typeof options.theme === 'string' ? options.theme : 'catppuccin-mocha'
  const cellAspect = typeof options.cell_aspect === 'number' ? options.cell_aspect : 2.2
  const scale = typeof options.scale === 'number' ? options.scale : 1
  const style = options.style === 'sketch' ? 'sketch' : 'clean'

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if ((await modeOf($, options.mode)) === 'off' || !e.surfaces.includes('terminal')) return composed
    return { sections: [...composed.sections, { id: 'mermaid:diagrams', text: PROMPT, scope: 'session' as const }] }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || (await modeOf($, options.mode)) === 'off') return next(e)
    const segments = splitReply(e.props.text)
    if (!segments.some(s => s.kind === 'mermaid')) return next(e)

    const { Box, Button, Image, Text } = $.ui.resolve(e)
    // 왼쪽 2칸 거터(⏺)와 마지막 빈 칸을 뺀 폭.
    const maxColumns = Math.max(10, (e.viewport?.columns ?? 80) - 3)
    const kind = mode === 'pictures' ? 'png' : 'text'
    const rows = []
    let isFirst = e.props.isFirstOfReply
    for (const [n, segment] of segments.entries()) {
      let drawing: Drawing | undefined
      if (segment.kind === 'mermaid') {
        const key = `${kind}|${kind === 'png' ? maxColumns : ''}|${segment.source}`
        drawing = drawings.get(key)
        if (drawing === undefined && !queue.has(key)) {
          queue.set(key, { key, source: segment.source, kind, maxColumns })
          void drain($, theme, cellAspect, scale, style)
        }
      }
      // 글, 아직 안 그려진 다이어그램, 못 그린 다이어그램은 엔진이 원래대로 그린다.
      if (segment.kind === 'text' || drawing === undefined || 'error' in drawing) {
        const text = segment.kind === 'text' ? segment.text : segment.raw
        const drawn = await next({ ...e, props: { ...e.props, text, isFirstOfReply: isFirst } })
        // 엔진은 답의 첫 블록에만 거터를 붙인다 — 이어지는 조각은 여기서 붙인다.
        rows.push(
          isFirst ? drawn : (
            <Box flexDirection="row">
              <Box width={2} flexShrink={0} />
              <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                {drawn}
              </Box>
            </Box>
          ),
        )
        // 못 그린 다이어그램은 코드 아래에 이유를 흐리게 단다.
        if (drawing && 'error' in drawing) rows.push(<Box paddingLeft={2}><Text dimColor>다이어그램을 그리지 못했다: {drawing.error}</Text></Box>)
      } else {
        const title = segment.kind === 'mermaid' ? (segment.source.trim().split('\n')[0] ?? '') : ''
        rows.push(
          <Box flexDirection="row" marginTop={1}>
            <Box width={2} flexShrink={0}>
              <Text>{isFirst ? '⏺' : ' '}</Text>
            </Box>
            {'png' in drawing ? (
              <Box flexDirection="column" hover={{ scope: `mermaid-${n}-${drawing.png.length}` }}>
                <Image source={{ png: drawing.png }} columns={drawing.columns} rows={drawing.rows} alt={`[mermaid: ${title}]`} />
                {/* 평소엔 빈 줄, 다이어그램에 포인터를 올리면 버튼. */}
                <Box minHeight={1}>
                  <Box display="none" hover={{ display: 'flex', scope: `mermaid-${n}-${drawing.png.length}` }}>
                    <Button key={`big-${n}`} plain dimColor onPress={() => void openView($, { ...drawing, title })}>⤢ 크게 보기</Button>
                  </Box>
                </Box>
              </Box>
            ) : (
              <Text wrap="truncate-end">{drawing.text}</Text>
            )}
          </Box>,
        )
      }
      isFirst = false
    }
    return <Box flexDirection="column">{rows}</Box>
  })

  on('ui.render', { component: 'Pane', requestId: VIEW }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box, Image, Text } = $.ui.resolve(e)
    if (!viewing) return <Text dimColor>보여 줄 다이어그램이 없다.</Text>
    // 비율을 지키며 pane 에 꽉 차게. 원래 크기의 세 배까지만 키운다.
    const grow = Math.min(3, e.props.bodyColumns / viewing.columns, Math.max(4, e.props.scroll.bodyRows - 3) / viewing.rows)
    const columns = Math.max(1, Math.floor(viewing.columns * grow))
    const rows = Math.max(1, Math.floor(viewing.rows * grow))
    return (
      <Box flexDirection="column" rowGap={1}>
        <Box flexDirection="row" columnGap={2}>
          <Text bold color={ACCENT}>{viewing.title}</Text>
          <Box flexGrow={1} />
          <Text dimColor>Esc 닫기</Text>
        </Box>
        <Box flexDirection="row" justifyContent="center">
          <Image source={{ png: viewing.png }} columns={columns} rows={rows} alt={`[mermaid: ${viewing.title}]`} />
        </Box>
      </Box>
    )
  })

  on('ui.close', { id: VIEW }, async ($, e, next) => {
    viewing = null
    return next(e)
  }).catch(($, e, next) => next(e))
}
