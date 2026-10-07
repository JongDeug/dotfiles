// 헤드리스 Chrome 하나를 띄워 붙들고 있는 보조 프로세스. 훅 모듈엔 Node 가 없어서 이게 한다.
//
//   node browser.mjs <dir>
//
// stdout 으로 한 줄짜리 JSON 을 낸다.
//   { type: 'ready', cdpPort, socket }      — 준비됨. socket 은 아래 명령을 받는 Unix 소켓
//   { type: 'frame', file, generation }     — 화면이 바뀌었다 (PNG 파일, 두 장을 번갈아 쓴다)
//   { type: 'page', url, title }            — 주소·제목이 바뀌었다
//   { type: 'loading', on }                 — 불러오기 시작·끝
//   { type: 'error', message }              — 못 띄웠다 (곧 끝난다)
// 명령은 그 소켓으로 POST /<cmd> + JSON 본문: navigate, back, forward, reload, resize, click, wheel, key, quit.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const dir = process.argv[2]
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
// 레티나에서 선명하게. 터미널이 칸에 맞춰 줄인다.
const DPR = 2

const emit = msg => process.stdout.write(JSON.stringify(msg) + '\n')

// Chrome 은 프로필 하나를 한 프로세스만 쓴다. SingletonLock 이 산 프로세스를 가리키면 잡힌 것.
function isLocked(profile) {
  try {
    process.kill(Number(fs.readlinkSync(path.join(profile, 'SingletonLock')).split('-').pop()), 0)
    return true
  } catch {
    return false
  }
}

// 로그인이 세션을 넘어 남도록 프로필은 고정 경로. 다른 세션이 쓰고 있으면 이번만 임시 프로필
// (로그인 없음, 끝나면 지운다).
const shared = path.join(dir, 'profile')
fs.mkdirSync(shared, { recursive: true })
const profile = isLocked(shared) ? fs.mkdtempSync(path.join(dir, 'tmp-profile-')) : shared
// Unix 소켓 경로는 macOS 에서 104바이트까지라 짧은 /tmp 에 둔다.
const socket = `/tmp/claude-web-${process.pid}.sock`
fs.rmSync(path.join(profile, 'DevToolsActivePort'), { force: true })
fs.rmSync(socket, { force: true })

const chrome = spawn(
  CHROME,
  ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'],
  { stdio: 'ignore' },
)
// 끌 때는 Chrome 이 다 꺼지길 기다렸다가 끝낸다 — 꺼지는 중엔 프로필 폴더를 못 지운다.
// TODO: SIGKILL 은 잡을 수 없어 Chrome 이 남는다 — 그땐 `pkill -f claude-web/`.
let quitting = false
function quit() {
  if (quitting) return
  quitting = true
  if (chrome.exitCode !== null || chrome.signalCode !== null) process.exit(0)
  chrome.once('exit', () => process.exit(0))
  chrome.kill()
  setTimeout(() => process.exit(0), 3000)
}
process.on('exit', () => {
  chrome.kill()
  for (const f of [socket, path.join(dir, `frame-${process.pid}-0.png`), path.join(dir, `frame-${process.pid}-1.png`)]) fs.rmSync(f, { force: true })
  if (profile !== shared) {
    try {
      fs.rmSync(profile, { recursive: true, force: true })
    } catch {
      // 다음 기회에 — 지우지 못한 임시 프로필은 로그인도 없는 빈 껍데기다.
    }
  }
})
process.on('SIGTERM', quit)
process.on('SIGINT', quit)
chrome.on('exit', code => {
  if (quitting) return
  emit({ type: 'error', message: `Chrome 이 끝났다 (exit ${code})` })
  process.exit(1)
})
const fail = error => {
  emit({ type: 'error', message: String(error?.message ?? error) })
  process.exit(1)
}
process.on('uncaughtException', fail)
process.on('unhandledRejection', fail)

async function devtoolsPort() {
  for (let i = 0; i < 100; i++) {
    try {
      return Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0])
    } catch {
      await new Promise(r => setTimeout(r, 100))
    }
  }
  throw new Error('Chrome did not start')
}

const port = await devtoolsPort()
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = targets.find(t => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})

let nextId = 0
const waiting = new Map()
const send = (method, params = {}) =>
  new Promise(res => {
    const id = ++nextId
    waiting.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })

let size = { width: 1000, height: 700 }
let loading = false
let mainFrame = page.id
let generation = 0

// screencast 는 '바뀌었다' 신호로만 쓴다 — 헤드리스에선 DPR 을 무시하고 1배로 보내 흐리다.
// 실제 화면은 DPR 배 스크린샷. 찍는 중에 또 바뀌면 끝나고 한 번 더 찍는다.
let capturing = false
let dirty = false
async function capture() {
  if (capturing) {
    dirty = true
    return
  }
  capturing = true
  do {
    dirty = false
    const { result } = await send('Page.captureScreenshot', { format: 'png' })
    if (!result?.data) continue
    generation += 1
    // 세션마다 따로 — 둘이 같은 파일에 쓰면 서로 화면이 섞인다.
    const file = path.join(dir, `frame-${process.pid}-${generation % 2}.png`)
    fs.writeFileSync(file, Buffer.from(result.data, 'base64'))
    emit({ type: 'frame', file, generation })
  } while (dirty)
  capturing = false
}

async function title() {
  const { result } = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })
  return result?.result?.value ?? ''
}

ws.onmessage = async ({ data }) => {
  const msg = JSON.parse(data)
  if (msg.id) {
    waiting.get(msg.id)?.(msg)
    waiting.delete(msg.id)
    return
  }
  const { method, params } = msg
  if (method === 'Page.screencastFrame') {
    send('Page.screencastFrameAck', { sessionId: params.sessionId })
    void capture()
  } else if ((method === 'Page.frameStartedLoading' || method === 'Page.frameStoppedLoading') && params.frameId === mainFrame) {
    loading = method === 'Page.frameStartedLoading'
    emit({ type: 'loading', on: loading })
  } else if (method === 'Page.frameNavigated' && !params.frame.parentId) {
    mainFrame = params.frame.id
    emit({ type: 'page', url: params.frame.url, title: '' })
  } else if (method === 'Page.loadEventFired') {
    const { result } = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true })
    emit({ type: 'page', url: result?.result?.value ?? '', title: await title() })
  } else if (method === 'Page.windowOpen') {
    // 새 탭으로 여는 링크는 이 탭에서 연다 — 탭은 하나만 보여 준다.
    send('Page.navigate', { url: params.url })
  }
}

async function resize(width, height) {
  size = { width, height }
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: DPR, mobile: false })
  await send('Page.stopScreencast')
  // 신호용이라 작고 싸게.
  await send('Page.startScreencast', { format: 'jpeg', quality: 10, maxWidth: 200, maxHeight: 200 })
  void capture()
}

const KEYS = { return: ['Enter', 13], backspace: ['Backspace', 8], tab: ['Tab', 9], delete: ['Delete', 46], up: ['ArrowUp', 38], down: ['ArrowDown', 40], left: ['ArrowLeft', 37], right: ['ArrowRight', 39], pageup: ['PageUp', 33], pagedown: ['PageDown', 34], home: ['Home', 36], end: ['End', 35] }

const commands = {
  quit: () => setTimeout(quit, 10),
  // 스킴이 있으면 그대로, 점이 있거나 localhost 면 https://, 아니면 DuckDuckGo 검색 (구글은 헤드리스를 로봇 확인으로 막는다).
  navigate: ({ url }) => {
    const u = url.trim()
    const target = /^[a-z][a-z0-9+.-]*:/i.test(u)
      ? u
      : /^localhost(:\d+)?(\/|$)/.test(u)
        ? `http://${u}`
        : /^\S+\.\S+$/.test(u)
          ? `https://${u}`
          : `https://duckduckgo.com/?q=${encodeURIComponent(u)}`
    return send('Page.navigate', { url: target })
  },
  back: () => send('Runtime.evaluate', { expression: 'history.back()' }),
  forward: () => send('Runtime.evaluate', { expression: 'history.forward()' }),
  // 불러오는 중이면 멈추고, 아니면 새로고침 — 버튼 하나가 둘을 한다.
  reload: () => (loading ? send('Page.stopLoading') : send('Page.reload')),
  resize: ({ width, height }) => (width === size.width && height === size.height ? null : resize(width, height)),
  // x, y 는 0~1 비율 — 페이지 크기는 여기서만 안다.
  click: async ({ x, y }) => {
    const at = { x: x * size.width, y: y * size.height, button: 'left', clickCount: 1 }
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at })
  },
  wheel: ({ x, y, dy }) => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: x * size.width, y: y * size.height, deltaX: 0, deltaY: dy }),
  key: async ({ key, ctrl, meta, shift }) => {
    const special = KEYS[key]
    if (!special) return key.length === 1 && !ctrl && !meta ? send('Input.insertText', { text: key }) : null
    const [name, code] = special
    const modifiers = (shift ? 8 : 0) | (ctrl ? 2 : 0) | (meta ? 4 : 0)
    const base = { key: name, code: name, windowsVirtualKeyCode: code, modifiers }
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, ...(name === 'Enter' ? { text: '\r' } : {}) })
    if (name === 'Enter') await send('Input.dispatchKeyEvent', { type: 'char', ...base, text: '\r' })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
  },
}

await send('Page.enable')
// 헤드리스는 UA 에 HeadlessChrome 을 달고 다녀서 구글 검색 등이 로봇 확인으로 막는다. 보통 Chrome 처럼.
const { result: version } = await send('Browser.getVersion')
await send('Network.setUserAgentOverride', { userAgent: (version?.userAgent ?? '').replace('HeadlessChrome', 'Chrome') })
await resize(size.width, size.height)

http
  .createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const run = commands[req.url.slice(1)]
    try {
      if (!run) throw new Error(`unknown command ${req.url}`)
      await run(body ? JSON.parse(body) : {})
      res.end('ok')
    } catch (error) {
      res.statusCode = 400
      res.end(String(error?.message ?? error))
    }
  })
  .listen(socket, () => emit({ type: 'ready', cdpPort: port, socket, agentBrowser: findAgentBrowser() }))

// Claude 가 같은 탭을 읽고 누르는 데 쓰는 agent-browser. PATH 에 없으면 terminal-browser 에 들어 있는 것.
function findAgentBrowser() {
  for (const d of (process.env.PATH ?? '').split(':')) if (fs.existsSync(path.join(d, 'agent-browser'))) return 'agent-browser'
  const cask = '/opt/homebrew/Caskroom/terminal-browser'
  if (!fs.existsSync(cask)) return null
  for (const v of fs.readdirSync(cask).reverse()) {
    const bin = path.join(cask, v, 'terminal-browser/agent-browser/bin/agent-browser')
    if (fs.existsSync(bin)) return bin
  }
  return null
}
