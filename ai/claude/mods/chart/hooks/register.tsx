import type { EngineInterface, Register } from 'claude-code'

import { splitCharts } from './fences'

type Drawing = { png: string; columns: number; rows: number } | { error: string }
type Job = { key: string; spec: string; maxColumns: number }

const drawings = new Map<string, Drawing>()
const queue = new Map<string, Job>()
let busy = false

const PROMPT = [
  '# Charts in this terminal',
  'This terminal draws charts in your replies. When numbers are clearer as a chart (a comparison, a trend, a breakdown such as spending by category or recall per class), put a fenced code block with the language `chart` holding a Vega-Lite JSON spec, at the top level of the reply.',
  'Put the data inline under "data": {"values": [...]}. Leave out width, height and colors: they are fitted to the terminal. Add a short "title". Labels may be Korean. Keep a table of the key numbers in text too if the user needs exact values.',
].join('\n')

async function drain($: EngineInterface, cellAspect: number): Promise<void> {
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
}

export const register: Register = (on, options) => {
  const cellAspect = typeof options.cell_aspect === 'number' ? options.cell_aspect : 2.2

  on('session.start', async ($, e, next) => {
    $.clock.every(150, () => void drain($, cellAspect))
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.surfaces.includes('terminal')) return composed
    return { sections: [...composed.sections, { id: 'chart:blocks', text: PROMPT, scope: 'session' as const }] }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const segments = splitCharts(e.props.text)
    if (!segments.some(s => s.kind === 'chart')) return next(e)
    const { Box, Image, Text } = $.ui.resolve(e)
    const maxColumns = Math.max(20, (e.viewport?.columns ?? 80) - 4)
    const rows = []
    let isFirst = e.props.isFirstOfReply
    for (const s of segments) {
      let d: Drawing | undefined
      if (s.kind === 'chart') {
        const key = `${maxColumns}|${s.spec}`
        d = drawings.get(key)
        if (!d && !queue.has(key)) queue.set(key, { key, spec: s.spec, maxColumns })
      }
      if (s.kind === 'text' || !d || 'error' in d) {
        const drawn = await next({ ...e, props: { ...e.props, text: s.kind === 'text' ? s.text : s.raw, isFirstOfReply: isFirst } })
        // 엔진은 답의 첫 덩어리에만 거터(⏺)를 붙인다 — 이어지는 조각은 여기서 맞춘다.
        rows.push(isFirst ? drawn : <Box flexDirection="row"><Box width={2} flexShrink={0} /><Box flexDirection="column" flexGrow={1} flexShrink={1}>{drawn}</Box></Box>)
        // 그리지 못한 차트는 코드 아래에 이유를 흐리게 단다.
        if (s.kind === 'chart' && d && 'error' in d) rows.push(<Box paddingLeft={2}><Text dimColor>차트를 그리지 못했다: {d.error}</Text></Box>)
      } else {
        rows.push(
          <Box flexDirection="row" marginTop={1}>
            <Box width={2} flexShrink={0}><Text>{isFirst ? '⏺' : ' '}</Text></Box>
            <Image source={{ png: d.png }} columns={d.columns} rows={d.rows} alt="[chart]" />
          </Box>,
        )
      }
      isFirst = false
    }
    return <Box flexDirection="column">{rows}</Box>
  })
}
