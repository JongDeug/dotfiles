import type { EngineInterface, Register } from 'claude-code'

import { splitCharts } from './fences'

type Drawing = { png: string; columns: number; rows: number } | { error: string }
type Job = { key: string; spec: string; maxColumns: number; maxRows?: number }
type Ready = { png: string; columns: number; rows: number }

// session.start 는 /reload-plugins 뒤엔 다시 오지 않는다 — 쌓을 때마다 그리기를 깨운다.
const drawings = new Map<string, Drawing>()
const queue = new Map<string, Job>()
let busy = false
let cellAspect = 2.2
// 크게 보기 pane 에 띄운 차트(spec). 한 번에 하나.
const VIEW = 'chart-view'
const ACCENT = '#8aadf4'
let viewing: { spec: string; title: string } | null = null

const PROMPT = [
  '# Charts in this terminal',
  'This terminal draws charts in your replies. When numbers are clearer as a chart (a comparison, a trend, a breakdown such as spending by category or recall per class), put a fenced code block with the language `chart` holding a Vega-Lite JSON spec, at the top level of the reply.',
  'Put the data inline under "data": {"values": [...]}. Leave out width, height and colors: they are fitted to the terminal. Add a short "title". Labels may be Korean. Keep a table of the key numbers in text too if the user needs exact values.',
  'To compare two charts side by side (this month vs last month), put both in one spec as {"hconcat": [spec1, spec2]} with the data inside each; for a pie or donut use mark "arc" with a theta encoding.',
].join('\n')

// 같은 spec 은 같은 그림 — 크기만 다르면 다시 그린다.
function lookup($: EngineInterface, spec: string, maxColumns: number, maxRows?: number): Drawing | undefined {
  const key = `${maxColumns}x${maxRows ?? ''}|${spec}`
  const hit = drawings.get(key)
  if (!hit && !queue.has(key)) {
    queue.set(key, { key, spec, maxColumns, maxRows })
    void drain($)
  }
  return hit
}

const titleOf = (spec: string): string => {
  try {
    const t = (JSON.parse(spec) as { title?: unknown }).title
    return typeof t === 'string' ? t : typeof (t as { text?: unknown })?.text === 'string' ? (t as { text: string }).text : 'chart'
  } catch {
    return 'chart'
  }
}

async function openView($: EngineInterface, spec: string): Promise<void> {
  viewing = { spec, title: titleOf(spec) }
  // 입력창 위에 넓게 — 터미널 폭을 다 쓰고 높이는 엔진이 내줄 만큼.
  await $.ui.open({ id: VIEW, title: viewing.title.slice(0, 40), focus: true, closeOnEscape: true, rows: 40 })
  $.ui.invalidate('ui.render')
}

// ~/Downloads 에 PNG 로. 같은 이름이 있으면 시각을 붙인다.
async function save($: EngineInterface, d: Ready, spec: string): Promise<void> {
  const name = titleOf(spec).replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60) || 'chart'
  const home = (await $.env.get('HOME')) ?? '/tmp'
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  const file = `${home}/Downloads/${name}-${stamp}.png`
  const { exitCode } = await $.process.run(['/bin/sh', '-c', 'base64 -D > "$1"', 'sh', file], { stdin: d.png })
  $.ui.toast(exitCode === 0 ? `저장했다: ${file}` : '저장하지 못했다')
}

async function drain($: EngineInterface): Promise<void> {
  if (busy || queue.size === 0) return
  busy = true
  const items = [...queue.values()]
  queue.clear()
  try {
    const { exitCode, stdout, stderr } = await $.process.run(['node', `${$.plugin.root}/bin/render.mjs`], {
      stdin: JSON.stringify({ items, cellAspect }),
      timeoutMs: 60_000,
    })
    if (exitCode !== 0) throw new Error(stderr.trim().split('\n').pop() ?? `exit ${exitCode}`)
    for (const { key, ...d } of JSON.parse(stdout).results as ({ key: string } & Drawing)[]) drawings.set(key, d)
  } catch (error) {
    for (const item of items) drawings.set(item.key, { error: String(error) })
  } finally {
    busy = false
  }
  $.ui.invalidate('ui.render')
  void drain($)  // 그리는 동안 쌓인 것
}

export const register: Register = (on, options) => {
  if (typeof options.cell_aspect === 'number') cellAspect = options.cell_aspect

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.surfaces.includes('terminal')) return composed
    return { sections: [...composed.sections, { id: 'chart:blocks', text: PROMPT, scope: 'session' as const }] }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const segments = splitCharts(e.props.text)
    if (!segments.some(s => s.kind === 'chart')) return next(e)
    const { Box, Button, Image, Text } = $.ui.resolve(e)
    const maxColumns = Math.max(20, Math.min(110, (e.viewport?.columns ?? 80) - 4))
    const rows = []
    let isFirst = e.props.isFirstOfReply
    for (const [n, s] of segments.entries()) {
      const d = s.kind === 'chart' ? lookup($, s.spec, maxColumns) : undefined
      if (s.kind === 'text' || !d || 'error' in d) {
        const drawn = await next({ ...e, props: { ...e.props, text: s.kind === 'text' ? s.text : s.raw, isFirstOfReply: isFirst } })
        // 엔진은 답의 첫 덩어리에만 거터(⏺)를 붙인다 — 이어지는 조각은 여기서 맞춘다.
        rows.push(isFirst ? drawn : <Box flexDirection="row"><Box width={2} flexShrink={0} /><Box flexDirection="column" flexGrow={1} flexShrink={1}>{drawn}</Box></Box>)
        // 그리지 못한 차트는 코드 아래에 이유를 흐리게 단다.
        if (s.kind === 'chart' && d && 'error' in d) rows.push(<Box paddingLeft={2}><Text dimColor>차트를 그리지 못했다: {d.error}</Text></Box>)
      } else {
        const spec = s.spec
        const ready = d
        rows.push(
          <Box flexDirection="row" marginTop={1}>
            <Box width={2} flexShrink={0}><Text>{isFirst ? '⏺' : ' '}</Text></Box>
            <Box flexDirection="column" hover={{ scope: `chart-${n}-${spec.length}` }}>
              <Image source={{ png: ready.png }} columns={ready.columns} rows={ready.rows} alt={`[chart: ${titleOf(spec)}]`} />
              {/* 평소엔 빈 줄, 차트에 포인터를 올리면 버튼. */}
              <Box flexDirection="row" columnGap={2} minHeight={1}>
                <Box display="none" columnGap={2} hover={{ display: 'flex', scope: `chart-${n}-${spec.length}` }}>
                  <Button key={`big-${n}`} plain dimColor onPress={() => void openView($, spec)}>⤢ 크게 보기</Button>
                  <Button key={`save-${n}`} plain dimColor onPress={() => void save($, ready, spec)}>↓ PNG 저장</Button>
                </Box>
              </Box>
            </Box>
          </Box>,
        )
      }
      isFirst = false
    }
    return <Box flexDirection="column">{rows}</Box>
  })

  // 크게 보기: pane 의 폭·높이에 맞춰 다시 그린다.
  on('ui.render', { component: 'Pane', requestId: VIEW }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box, Button, Image, Text } = $.ui.resolve(e)
    if (!viewing) return <Text dimColor>보여 줄 차트가 없다.</Text>
    const { spec } = viewing
    const d = lookup($, spec, Math.max(20, e.props.bodyColumns - 1), Math.max(8, e.props.scroll.bodyRows - 3))
    const body = !d ? <Text dimColor>그리는 중…</Text>
      : 'error' in d ? <Text dimColor>차트를 그리지 못했다: {d.error}</Text>
      : <Image source={{ png: d.png }} columns={d.columns} rows={d.rows} alt={`[chart: ${viewing.title}]`} />
    return (
      <Box flexDirection="column" rowGap={1}>
        <Box flexDirection="row" columnGap={2}>
          <Text bold color={ACCENT}>{viewing.title}</Text>
          <Box flexGrow={1} />
          {d && !('error' in d) ? <Button key="save" plain dimColor hotkey="s" onPress={() => void save($, d, spec)}>↓ PNG 저장</Button> : null}
          <Text dimColor>Esc 닫기</Text>
        </Box>
        <Box flexDirection="row" justifyContent="center">{body}</Box>
      </Box>
    )
  })

  on('ui.close', { id: VIEW }, async ($, e, next) => {
    viewing = null
    return next(e)
  }).catch(($, e, next) => next(e))
}
