// stdin 으로 JSON 하나 받아 stdout 으로 JSON 하나 — 답 속 ```page 블록(HTML)을 맥의 Chrome 으로 찍는다.
//
//   { items: [{ key, html | path, maxColumns, maxRows?, slices? }], cellAspect }
//   -> { results: [{ key, png, columns, rows, file, cut } | { key, columns, rows, file, cut, parts } | { key, error }] }
//   slices 면 페이지 끝까지 찍어 터미널 그림 한 장(255줄)에 들어가게 위에서부터 잘라 parts: [{ path, columns, rows }] 로 준다(펼치기).
//   경로만 주는 건 stdout 4 MiB 한도 때문 — 훅이 장마다 $.fs.read 로 읽어 base64 로 그린다(herdr 는 파일 그림을 못 넘긴다).
//   html 은 답 속 조각(기본 CSS 를 깔아 감싼다), path 는 이미 있는 HTML 파일(그대로 연다). cut 은 한도에서 잘렸는지.
//
// Chrome 을 화면 없이(headless) 한 번 띄워 DevTools 프로토콜로 항목마다 새 탭을 열고, 터미널 폭에 맞춘 창에서
// 페이지 전체 높이를 2배로 찍는다. 바탕은 투명 — 터미널 테마가 비친다. 쓴 HTML 은 file 로 남겨 Chrome 에서 열 수 있게.
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PX_PER_COLUMN = 8 // 터미널 한 칸을 이 CSS 픽셀로 본다(chart.mjs 와 같다)
const SCALE = 2
const CACHE = path.join(os.homedir(), '.cache', 'claude-deck')
const MAX_FULL = 40_000 // 펼치기의 한도(CSS px) — 이보다 긴 페이지는 Chrome 에서

// herdr 테마(gruvbox dark) 기본 모양 — 페이지가 자기 CSS 를 쓰면 그쪽이 이긴다(앞에 넣는다).
const BASE_CSS = `
:root { color-scheme: dark; }
html, body { margin: 0; background: transparent; }
body { padding: 12px 14px; word-break: keep-all; color: #ebdbb2; font: 14px/1.55 'Apple SD Gothic Neo', -apple-system, 'Helvetica Neue', sans-serif; }
h1, h2, h3, h4 { color: #fabd2f; margin: 0.4em 0 0.5em; line-height: 1.3; }
a { color: #83a598; }
code, pre { font-family: 'SF Mono', Menlo, monospace; font-size: 12.5px; background: #3c3836; border-radius: 4px; }
code { padding: 1px 5px; } pre { padding: 10px 12px; overflow: hidden; }
table { border-collapse: collapse; } th, td { border: 1px solid #504945; padding: 5px 10px; text-align: left; }
th { background: #3c3836; color: #fabd2f; } hr { border: 0; border-top: 1px solid #504945; }
`

// 조각이면 문서로 감싸고, 문서면 <head> 맨 앞에 기본 CSS 를 끼운다.
export function wrapHtml(html) {
  const base = `<meta charset="utf-8"><style>${BASE_CSS}</style>`
  if (/<html[\s>]/i.test(html)) return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + base) : html.replace(/<html[^>]*>/i, m => `${m}<head>${base}</head>`)
  return `<!doctype html><html><head>${base}</head><body>${html}</body></html>`
}

// DevTools 프로토콜 — 명령 하나 보내고 같은 id 의 답을 기다린다. 이벤트는 once 로 기다린다.
function connect(url) {
  const ws = new WebSocket(url)
  let id = 0
  const pending = new Map()
  const waiters = []
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(String(ev.data))
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    } else if (msg.method) {
      for (const w of [...waiters]) if (w.method === msg.method && w.sessionId === msg.sessionId) {
        waiters.splice(waiters.indexOf(w), 1)
        w.resolve(msg.params)
      }
    }
  })
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', () => reject(new Error('DevTools 에 붙지 못했다')))
  })
  return {
    ready,
    send: (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const n = ++id
      pending.set(n, { resolve, reject })
      ws.send(JSON.stringify({ id: n, method, params, sessionId }))
    }),
    once: (method, sessionId) => new Promise(resolve => waiters.push({ method, sessionId, resolve })),
    close: () => ws.close(),
  }
}

function launch() {
  if (!fs.existsSync(CHROME)) throw new Error('Google Chrome 이 없다')
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-chrome-'))
  const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
  // 끄고, 다 꺼진 뒤 임시 프로필을 지운다. 지우기가 실패해도 결과는 이미 나갔으니 넘어간다(임시 폴더라 OS 가 치운다).
  const quit = async () => {
    const exited = new Promise(resolve => child.once('exit', resolve))
    child.kill()
    await Promise.race([exited, new Promise(r => setTimeout(r, 3000))])
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch {}
  }
  const endpoint = new Promise((resolve, reject) => {
    let err = ''
    child.stderr.on('data', b => {
      err += b
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(err)
      if (m) resolve(m[1])
    })
    child.on('exit', () => reject(new Error('Chrome 이 바로 끝났다')))
    setTimeout(() => reject(new Error('Chrome 이 뜨지 않았다')), 15_000)
  })
  return { endpoint, quit }
}

const timeout = (ms, what) => new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} 시간이 넘었다`)), ms))

async function shoot(cdp, item, cellAspect) {
  let file = item.path
  if (file) {
    if (!fs.existsSync(file)) throw new Error('파일이 없다')
  } else {
    fs.mkdirSync(CACHE, { recursive: true })
    file = path.join(CACHE, crypto.createHash('md5').update(item.html).digest('hex') + '.html')
    fs.writeFileSync(file, wrapHtml(item.html))
  }
  const width = Math.max(200, item.maxColumns * PX_PER_COLUMN)
  // 높이 한도: 그림 요소는 255줄까지, 크게 보기는 pane 높이까지.
  const maxRows = Math.min(255, item.maxRows ?? 255)
  const maxHeight = Math.floor(maxRows * PX_PER_COLUMN * cellAspect)
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  try {
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 600, deviceScaleFactor: SCALE, mobile: false }, sessionId)
    await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, sessionId)
    const loaded = cdp.once('Page.loadEventFired', sessionId)
    await cdp.send('Page.navigate', { url: `file://${file}` }, sessionId)
    await Promise.race([loaded, timeout(10_000, '페이지 불러오기')])
    // 글꼴과 짧은 JS(차트 라이브러리 등)가 그릴 틈.
    await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => new Promise(r => setTimeout(r, 300)))', awaitPromise: true }, sessionId)
    // 창 높이가 아니라 내용이 끝나는 곳까지 — documentElement.scrollHeight 는 창보다 작아지지 않는다.
    const { result } = await cdp.send('Runtime.evaluate', { expression: 'Math.ceil(document.body ? document.body.getBoundingClientRect().bottom + parseFloat(getComputedStyle(document.body).marginBottom || 0) : 0)', returnByValue: true }, sessionId)
    const full = Number(result.value) || 20
    const columns = Math.min(255, Math.max(1, Math.round(width / PX_PER_COLUMN)))
    const rowsOf = h => Math.min(255, Math.max(1, Math.round(h / (PX_PER_COLUMN * cellAspect))))
    if (item.slices) {
      // 끝까지(너무 긴 페이지는 MAX_FULL 에서 끊는다) 125줄씩 잘라 찍는다 — 한 장이 그림 한도(2 MiB)보다 넉넉히 작게.
      const total = Math.min(full, MAX_FULL)
      const step = Math.floor(125 * PX_PER_COLUMN * cellAspect)
      const parts = []
      for (let y = 0; y < total; y += step) {
        const h = Math.min(step, total - y)
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y, width, height: h, scale: 1 } }, sessionId)
        // 장들을 stdout 으로 보내면 4 MiB 를 넘는다 — 캐시에 PNG 로 두고 경로만(내용으로 이름 지어 같은 그림은 같은 파일).
        fs.mkdirSync(CACHE, { recursive: true })
        const png = path.join(CACHE, crypto.createHash('md5').update(data).digest('hex') + '.png')
        if (!fs.existsSync(png)) fs.writeFileSync(png, Buffer.from(data, 'base64'))
        parts.push({ path: png, columns, rows: rowsOf(h) })
      }
      return { columns, rows: parts[0].rows, file, cut: full > total, parts }
    }
    const height = Math.max(20, Math.min(maxHeight, full))
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } }, sessionId)
    return { png: data, columns, rows: rowsOf(height), file, cut: full > maxHeight }
  } finally {
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {})
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const req = JSON.parse(fs.readFileSync(0, 'utf8'))
  const results = []
  let chrome
  let cdp
  try {
    chrome = launch()
    cdp = connect(await chrome.endpoint)
    await cdp.ready
    for (const item of req.items) {
      try {
        results.push({ key: item.key, ...(await Promise.race([shoot(cdp, item, req.cellAspect ?? 2.2), timeout(20_000, '찍기')])) })
      } catch (error) {
        results.push({ key: item.key, error: String(error?.message ?? error).split('\n')[0].slice(0, 200) })
      }
    }
  } catch (error) {
    for (const item of req.items) if (!results.some(r => r.key === item.key)) results.push({ key: item.key, error: String(error?.message ?? error).slice(0, 200) })
  }
  process.stdout.write(JSON.stringify({ results }))
  cdp?.close()
  await chrome?.quit()
  process.exit(0)
}
