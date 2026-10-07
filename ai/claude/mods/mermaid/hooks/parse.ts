export type Segment = { kind: 'text'; text: string } | { kind: 'mermaid'; source: string; raw: string }

// 줄 맨 앞에서 열고 닫힌 ```mermaid 블록만. 스트리밍 중 아직 안 닫힌 블록은 글로 남는다.
// 들여쓴 블록(리스트 안)은 건드리지 않는다 — 거기서 자르면 리스트가 끊긴다.
const FENCE = /^(`{3,}|~{3,})mermaid[^\n`]*\n([\s\S]*?)\n\1[ \t]*$/gm

export function splitReply(text: string): Segment[] {
  const out: Segment[] = []
  let at = 0
  const pushText = (s: string) => {
    if (s.trim()) out.push({ kind: 'text', text: s.replace(/^\n+|\n+$/g, '') })
  }
  for (const m of text.matchAll(FENCE)) {
    pushText(text.slice(at, m.index))
    out.push({ kind: 'mermaid', source: m[2] ?? '', raw: m[0] })
    at = (m.index ?? 0) + m[0].length
  }
  pushText(text.slice(at))
  return out
}

export type Mode = 'pictures' | 'text' | 'off'

// auto: kitty·Ghostty 면 그림, 아니면 선 도형. tmux 는 그림을 못 넘긴다.
// herdr 안에서는 바깥 터미널을 알 길이 없어(서버를 띄운 터미널의 env 를 물려받는다) TERM 으로는
// 못 고른다. 대신 Claude Code 가 그림을 억지로 켜는 CLAUDE_CODE_FORCE_TERMINAL_IMAGES 를 따른다
// (zshrc 가 herdr 안에서 켠다).
export function pickMode(mode: string, env: Record<string, string | undefined>): Mode {
  if (mode === 'off' || mode === 'text') return mode
  if (mode === 'on') return 'pictures'
  if (env.CLAUDE_CODE_FORCE_TERMINAL_IMAGES) return 'pictures'
  if (env.TMUX) return 'text'
  const kitty = env.TERM === 'xterm-kitty' || Boolean(env.KITTY_WINDOW_ID)
  const ghostty = env.TERM_PROGRAM === 'ghostty' || env.TERM === 'xterm-ghostty'
  return kitty || ghostty ? 'pictures' : 'text'
}
