import type { EngineInterface, Register } from 'claude-code'

const PANE = 'web'

type Helper = { socket: string; cdpPort: number; agentBrowser: string | null }
type Line =
  | { type: 'ready'; socket: string; cdpPort: number; agentBrowser: string | null }
  | { type: 'frame'; file: string; generation: number }
  | { type: 'page'; url: string; title: string }
  | { type: 'error'; message: string }
  | { type: 'loading'; on: boolean }

// 모듈 변수 — 리로드되면 보조 프로세스도 같이 죽으니 함께 비워져도 맞다.
let helper: Helper | null = null
let starting: Promise<Helper> | null = null
let frame: { file: string; generation: number } | null = null
let page = { url: '', title: '' }
let lastError = ''
let loading = false
let sent = { width: 0, height: 0 }
// /web debug 가 보여 줄 마지막 상태.
let lastBlit = '아직 없음'
let lastRender = '아직 안 그려짐'

// 보조 프로세스(bin/browser.mjs)를 띄우고 준비될 때까지 기다린다. 이미 떠 있으면 그대로.
function start($: EngineInterface): Promise<Helper> {
  if (helper) return Promise.resolve(helper)
  if (starting) return starting
  starting = (async () => {
    const home = (await $.env.get('HOME')) ?? ''
    const child = $.process.spawn({ argv: ['node', `${$.plugin.root}/bin/browser.mjs`, `${home}/.cache/claude-web`] })
    return new Promise<Helper>((resolve, reject) => {
      void (async () => {
        let buffer = ''
        try {
          for await (const piece of child) {
            if (!('stream' in piece) || piece.stream !== 'stdout') continue
            buffer += piece.text
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) if (line) await onLine($, JSON.parse(line) as Line, resolve)
          }
        } catch (error) {
          reject(error)
        } finally {
          helper = null
          starting = null
          frame = null
          sent = { width: 0, height: 0 }
          $.ui.invalidate('ui.render')
          reject(new Error('browser exited'))
        }
      })()
    })
  })()
  return starting
}

async function onLine($: EngineInterface, line: Line, resolve: (h: Helper) => void) {
  if (line.type === 'ready') {
    helper = { socket: line.socket, cdpPort: line.cdpPort, agentBrowser: line.agentBrowser }
    lastError = ''
    resolve(helper)
  } else if (line.type === 'error') {
    lastError = line.message
  } else if (line.type === 'loading') {
    loading = line.on
    $.ui.invalidate('ui.render')
  } else if (line.type === 'frame') {
    frame = { file: line.file, generation: line.generation }
    // 그림만 바꿔 끼운다. 아직 안 그려졌거나 크기가 바뀌었으면 다시 그린다.
    const blit = await $.ui.blit({ requestId: PANE, key: 'view', source: { file: line.file, format: 'png', generation: line.generation } })
    lastBlit = blit.deny ?? 'ok'
    if (blit.deny) $.ui.invalidate('ui.render')
  } else {
    page = { url: line.url, title: line.title || page.title }
    $.ui.invalidate('ui.render')
  }
}

// 떠 있을 때만 끈다 — 끄려고 새로 띄우지 않게.
async function stop($: EngineInterface): Promise<void> {
  if (helper) await $.http.fetch('http://web/quit', { method: 'POST', socketPath: helper.socket })
}

async function call($: EngineInterface, cmd: string, body: object = {}): Promise<void> {
  const h = await start($)
  await $.http.fetch(`http://web/${cmd}`, { method: 'POST', body: JSON.stringify(body), socketPath: h.socket })
}

export const register: Register = (on, options) => {
  const cellAspect = typeof options.cell_aspect === 'number' ? options.cell_aspect : 2.2
  const pxPerColumn = typeof options.px_per_column === 'number' ? options.px_per_column : 9

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'web', description: '브라우저를 pane 에 띄운다 (/web <주소>, /web close, /web debug)', argumentHint: '<url> | close | debug' })
    return next(e)
  })

  on('command.run', { command: 'web' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'debug') {
      const panes = await $.ui.panes()
      return {
        text: [
          `helper: ${helper ? `socket ${helper.socket}, cdp ${helper.cdpPort}, agent-browser ${helper.agentBrowser}` : starting ? '띄우는 중' : '없음'}`,
          `page: ${page.url} (${page.title})`,
          `frame: ${frame ? `#${frame.generation} ${frame.file}` : '없음'}, browser ${sent.width}x${sent.height}`,
          `render: ${lastRender}`,
          `blit: ${lastBlit}`,
          `panes: ${JSON.stringify(panes)}`,
          `presentation: ${JSON.stringify(e.presentation)}`,
          `env: TERM=${await $.env.get('TERM')} TERM_PROGRAM=${await $.env.get('TERM_PROGRAM')} KITTY_WINDOW_ID=${await $.env.get('KITTY_WINDOW_ID')}`,
        ].join('\n'),
      }
    }
    if (arg === 'close') {
      await stop($)
      await $.ui.close({ id: PANE })
      return { text: '브라우저를 닫았다.' }
    }
    await $.ui.open({ id: PANE, title: 'web' })
    try {
      if (arg) await call($, 'navigate', { url: arg })
      else await start($)
    } catch (error) {
      return { text: `브라우저를 못 띄웠다: ${lastError || String(error)}` }
    }
    return { text: arg ? `${arg} 를 연다.` : '브라우저 pane 을 열었다.' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await stop($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // 바깥 Claude 도 같은 탭을 다룰 수 있게 알려 준다 — 떠 있을 때만.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!helper?.agentBrowser) return composed
    const text = [
      '# Browser pane',
      `The person has a browser pane open in this terminal (headless Chrome, CDP port ${helper.cdpPort}), now at ${page.url || 'about:blank'}.`,
      `To read or act on the page they see, run \`${helper.agentBrowser} --cdp ${helper.cdpPort} <command>\` with Bash: snapshot -i, click @e3, fill @e5 "text", open <url>, get text body. It is the same tab, so they watch what you do.`,
      'Do not type passwords or one-time codes for them; ask them to do it in the pane.',
    ].join('\n')
    return { sections: [...composed.sections, { id: 'web:pane', text, scope: 'session' as const }] }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface !== 'terminal') return $.ui.resolve(e).Text({ children: '브라우저 pane 은 터미널에서만 보인다.' })
    const { Box, Button, Client, Image, Input, Text } = $.ui.resolve(e)
    const cols = Math.min(255, Math.max(10, e.props.bodyColumns))
    // 위 도구줄 1줄 + 아래 상태줄 1줄.
    const rows = Math.min(255, Math.max(4, e.props.scroll.bodyRows - 2))
    lastRender = `${e.props.placement} ${cols}x${rows} 칸, focused ${e.props.isFocused}, frame ${frame ? '있음' : '없음'}`
    // pane 크기에 맞춰 브라우저 창 크기를 바꾼다. 비율이 맞아야 그림이 안 찌그러진다.
    const width = Math.round(cols * pxPerColumn)
    const height = Math.round(rows * pxPerColumn * cellAspect)
    if (helper && (width !== sent.width || height !== sent.height)) {
      sent = { width, height }
      void call($, 'resize', sent)
    }
    const host = page.url.replace(/^https?:\/\//, '').split('/')[0] ?? ''
    const status = !helper
      ? starting
        ? '브라우저를 띄우는 중…'
        : `꺼져 있음${lastError ? ` · ${lastError}` : ''} — 주소를 넣으면 다시 뜬다`
      : loading
        ? `불러오는 중… ${host}`
        : [page.title, host].filter(Boolean).join('  ·  ') || '빈 페이지'
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Button key="back" plain onPress={() => void call($, 'back')}>‹</Button>
          <Button key="forward" plain onPress={() => void call($, 'forward')}>›</Button>
          <Button key="reload" plain onPress={() => void call($, 'reload')}>{loading ? '×' : '↻'}</Button>
          <Box flexGrow={1} flexShrink={1}>
            <Input key="url" value={page.url} placeholder="주소 또는 검색어" submitLabel="이동" onSubmit={url => void call($, 'navigate', { url })} />
          </Box>
        </Box>
        <Box width={cols} height={rows}>
          {frame && helper ? (
            <>
              <Image key="view" source={{ file: frame.file, format: 'png', generation: frame.generation }} columns={cols} rows={rows} alt={page.title || page.url || ' '} />
              <Box position="absolute" top={0} left={0}>
                <Client key="input" module="./input.tsx" width={cols} height={rows} />
              </Box>
            </>
          ) : null}
        </Box>
        <Text dimColor wrap="truncate-end">{status}</Text>
      </Box>
    )
  })

  // 그림 위 클릭·키 (input.tsx 가 보낸다).
  on('ui.message', { requestId: PANE }, async ($, e, next) => {
    const data = e.data as { type: 'click'; x: number; y: number } | { type: 'key'; key: string; ctrl: boolean; meta: boolean; shift: boolean }
    if (data.type === 'click') await call($, 'click', { x: data.x, y: data.y })
    else await call($, 'key', data)
    return next(e)
  })

  // pane 위 휠은 pane 을 굴리지 않고 페이지를 굴린다. 첫 줄은 주소창이라 빼고 계산.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (helper && e.pointer && sent.width > 0) {
      const rows = Math.max(1, Math.round(sent.height / (pxPerColumn * cellAspect)))
      const cols = Math.max(1, Math.round(sent.width / pxPerColumn))
      void call($, 'wheel', { x: (e.pointer.column + 0.5) / cols, y: (e.pointer.row - 1 + 0.5) / rows, dy: e.by * 120 })
    }
    return next({ ...e, offset: 0 })
  }).catch(($, e, next) => next(e))
}
