// /deck:sync — push 한 deck 을 이 맥의 Claude 들에 깐다: 설정 폴더(~/.claude · ~/.claude-work)마다 마켓플레이스를 받고
// 플러그인을 올린 뒤, herdr(TUI·데스크톱 앱) 안이면 쉬는(idle·done) Claude 세션에 /reload-plugins 를 보낸다. 작업 중이거나 입력하다 만
// 세션, 이 명령을 부른 세션은 건드리지 않는다. 한 줄씩 결과를 찍고, 마지막 줄이 요약이다.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 깔린 자리 …/plugins/cache/<마켓플레이스>/<플러그인>/<버전>/bin/sync.mjs 에서 이름을 읽는다.
const parts = path.dirname(new URL(import.meta.url).pathname).split(path.sep)
const [market, plugin] = parts.slice(-4, -2)
if (parts.at(-5) !== 'cache') {
  console.log(`마켓플레이스 설치본이 아니라 못 한다(${parts.slice(0, -1).join('/')})`)
  process.exit(1)
}

const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120_000 })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}

const installed = []
for (const dir of ['.claude', '.claude-work'].map(d => path.join(os.homedir(), d)).filter(d => fs.existsSync(d))) {
  const env = { CLAUDE_CONFIG_DIR: dir }
  run('claude', ['plugin', 'marketplace', 'update', market], env)
  const r = run('claude', ['plugin', 'update', `${plugin}@${market}`], env)
  const version = /to ([\d.]+)|latest version \(([\d.]+)\)/.exec(r.out)
  installed.push(`${path.basename(dir)} ${version ? (version[1] ?? version[2]) : '실패'}`)
  console.log(`${path.basename(dir)}: ${r.out.split('\n').pop()}`)
}

// 다른 Claude 세션을 찾고 읽고 보내는 길: herdr TUI 는 herdr CLI, 데스크톱 앱(HC_TERMINAL_ID)은 hc.
const json = r => (r.ok ? JSON.parse(r.out) : null)
const host = process.env.HERDR_ENV === '1' ? {
  me: process.env.HERDR_PANE_ID,
  list: () => (json(run('herdr', ['agent', 'list']))?.result.agents ?? []).filter(a => a.agent === 'claude').map(a => ({ id: a.pane_id, status: a.agent_status })),
  read: id => run('herdr', ['agent', 'read', id, '--source', 'visible', '--lines', '60']).out,
  send: id => run('herdr', ['agent', 'prompt', id, '/reload-plugins', '--wait', '--timeout', '30000']).ok,
} : process.env.HC_TERMINAL_ID ? {
  me: process.env.HC_TERMINAL_ID,
  list: () => (json(run('hc', ['ls', '--json']))?.terminals ?? []).filter(t => t.agent === 'claude-code').map(t => ({ id: t.address, status: t.status })),
  read: id => run('hc', ['read', id]).out,
  send: id => run('hc', ['send', id, '/reload-plugins']).ok,
} : null

const reloaded = []
const skipped = []
for (const a of host?.list() ?? []) {
  if (a.id === host.me) continue
  if (!['idle', 'done'].includes(a.status)) {
    skipped.push(`${a.id}(작업 중)`)
    continue
  }
  // 입력창(❯)에 쓰다 만 글이 있으면 건너뛴다 — 보내면 그 글 뒤에 붙는다(hc send 는 그 글이 끝나길 기다린다).
  if (/❯\s*\S/.test(host.read(a.id).split('\n').filter(l => l.includes('❯')).pop() ?? '')) {
    skipped.push(`${a.id}(입력 중)`)
    continue
  }
  if (host.send(a.id)) reloaded.push(a.id)
  else skipped.push(`${a.id}(실패)`)
}

console.log(`${plugin} 설치: ${installed.join(' · ')} — 세션 리로드 ${reloaded.length}${skipped.length ? `, 건너뜀 ${skipped.join(' ')}` : ''}. 이 세션은 /reload-plugins`)
