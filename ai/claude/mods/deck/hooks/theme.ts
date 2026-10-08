// Flight Deck 의 색 — herdr 테마를 따른다. ~/.config/herdr/config.toml 의 [theme] name(auto_switch 면 맥 라이트·다크)을
// 읽어 setTheme 으로 C 를 그 테마 색으로 바꾼다. 계기판·안내·펫이 C 를 읽고, 렌더러(bin/)에는 그림 그릴 때 색을 넘긴다.

type Colors = {
  light: boolean // 밝은 바탕 테마
  base: string // 바탕
  surface: string // 알약 바탕
  overlay: string // 한 단 더 바탕 · 선
  text: string // 글자
  sub: string // 흐린 글자
  yellow: string
  teal: string
  peach: string
  green: string
  red: string
  blue: string
  mauve: string
}
export type Palette = Colors & { name: string; ink: string } // ink: 색 알약 위 글자(어두운 테마는 바탕색, 밝은 테마는 글자색)

// herdr 내장 테마 이름 그대로. 값은 각 테마의 공식 팔레트에서 같은 역할의 색.
const PALETTES: Record<string, Colors> = {
  gruvbox: { light: false, base: '#282828', surface: '#3c3836', overlay: '#504945', text: '#ebdbb2', sub: '#a89984', yellow: '#fabd2f', teal: '#8ec07c', peach: '#fe8019', green: '#b8bb26', red: '#fb4934', blue: '#83a598', mauve: '#d3869b' },
  'gruvbox-light': { light: true, base: '#fbf1c7', surface: '#ebdbb2', overlay: '#d5c4a1', text: '#3c3836', sub: '#7c6f64', yellow: '#b57614', teal: '#427b58', peach: '#af3a03', green: '#79740e', red: '#9d0006', blue: '#076678', mauve: '#8f3f71' },
  catppuccin: { light: false, base: '#1e1e2e', surface: '#313244', overlay: '#45475a', text: '#cdd6f4', sub: '#a6adc8', yellow: '#f9e2af', teal: '#94e2d5', peach: '#fab387', green: '#a6e3a1', red: '#f38ba8', blue: '#89b4fa', mauve: '#cba6f7' },
  'catppuccin-latte': { light: true, base: '#eff1f5', surface: '#ccd0da', overlay: '#bcc0cc', text: '#4c4f69', sub: '#6c6f85', yellow: '#df8e1d', teal: '#179299', peach: '#fe640b', green: '#40a02b', red: '#d20f39', blue: '#1e66f5', mauve: '#8839ef' },
  'tokyo-night': { light: false, base: '#1a1b26', surface: '#24283b', overlay: '#414868', text: '#c0caf5', sub: '#a9b1d6', yellow: '#e0af68', teal: '#73daca', peach: '#ff9e64', green: '#9ece6a', red: '#f7768e', blue: '#7aa2f7', mauve: '#bb9af7' },
  'tokyo-night-day': { light: true, base: '#e1e2e7', surface: '#d0d5e3', overlay: '#c4c8da', text: '#3760bf', sub: '#6172b0', yellow: '#8c6c3e', teal: '#118c74', peach: '#b15c00', green: '#587539', red: '#f52a65', blue: '#2e7de9', mauve: '#9854f1' },
  dracula: { light: false, base: '#282a36', surface: '#44475a', overlay: '#565a72', text: '#f8f8f2', sub: '#a4abcb', yellow: '#f1fa8c', teal: '#8be9fd', peach: '#ffb86c', green: '#50fa7b', red: '#ff5555', blue: '#8be9fd', mauve: '#bd93f9' },
  nord: { light: false, base: '#2e3440', surface: '#3b4252', overlay: '#434c5e', text: '#eceff4', sub: '#a5adba', yellow: '#ebcb8b', teal: '#8fbcbb', peach: '#d08770', green: '#a3be8c', red: '#bf616a', blue: '#81a1c1', mauve: '#b48ead' },
  'one-dark': { light: false, base: '#282c34', surface: '#31353f', overlay: '#3e4451', text: '#abb2bf', sub: '#7f848e', yellow: '#e5c07b', teal: '#56b6c2', peach: '#d19a66', green: '#98c379', red: '#e06c75', blue: '#61afef', mauve: '#c678dd' },
  'one-light': { light: true, base: '#fafafa', surface: '#e5e5e6', overlay: '#d3d3d4', text: '#383a42', sub: '#696c77', yellow: '#c18401', teal: '#0184bc', peach: '#986801', green: '#50a14f', red: '#e45649', blue: '#4078f2', mauve: '#a626a4' },
  solarized: { light: false, base: '#002b36', surface: '#073642', overlay: '#28505a', text: '#93a1a1', sub: '#839496', yellow: '#b58900', teal: '#2aa198', peach: '#cb4b16', green: '#859900', red: '#dc322f', blue: '#268bd2', mauve: '#d33682' },
  'solarized-light': { light: true, base: '#fdf6e3', surface: '#eee8d5', overlay: '#ddd6c1', text: '#586e75', sub: '#657b83', yellow: '#b58900', teal: '#2aa198', peach: '#cb4b16', green: '#859900', red: '#dc322f', blue: '#268bd2', mauve: '#d33682' },
  kanagawa: { light: false, base: '#1f1f28', surface: '#2a2a37', overlay: '#363646', text: '#dcd7ba', sub: '#a6a69c', yellow: '#e6c384', teal: '#7aa89f', peach: '#ffa066', green: '#98bb6c', red: '#e46876', blue: '#7e9cd8', mauve: '#957fb8' },
  'kanagawa-lotus': { light: true, base: '#f2ecbc', surface: '#e5ddb0', overlay: '#dcd5ac', text: '#545464', sub: '#716e61', yellow: '#77713f', teal: '#597b75', peach: '#cc6d00', green: '#6f894e', red: '#c84053', blue: '#4d699b', mauve: '#624c83' },
  'rose-pine': { light: false, base: '#191724', surface: '#26233a', overlay: '#403d52', text: '#e0def4', sub: '#908caa', yellow: '#f6c177', teal: '#9ccfd8', peach: '#ebbcba', green: '#31748f', red: '#eb6f92', blue: '#9ccfd8', mauve: '#c4a7e7' },
  'rose-pine-dawn': { light: true, base: '#faf4ed', surface: '#f2e9e1', overlay: '#dfdad9', text: '#575279', sub: '#797593', yellow: '#ea9d34', teal: '#56949f', peach: '#d7827e', green: '#286983', red: '#b4637a', blue: '#56949f', mauve: '#907aa9' },
  vesper: { light: false, base: '#101010', surface: '#1c1c1c', overlay: '#343434', text: '#ffffff', sub: '#a0a0a0', yellow: '#ffc799', teal: '#99ffe4', peach: '#ffc799', green: '#99ffe4', red: '#ff8080', blue: '#a0c4e8', mauve: '#d5b3f0' },
}
// auto_switch 때 라이트·다크 짝. 짝이 없는 테마는 그대로 둔다.
const PAIRS: [string, string][] = [
  ['gruvbox', 'gruvbox-light'], ['catppuccin', 'catppuccin-latte'], ['tokyo-night', 'tokyo-night-day'], ['one-dark', 'one-light'],
  ['solarized', 'solarized-light'], ['kanagawa', 'kanagawa-lotus'], ['rose-pine', 'rose-pine-dawn'],
]

const paint = (name: string): Palette => {
  const c = PALETTES[name] ?? PALETTES.gruvbox!
  return { ...c, name: PALETTES[name] ? name : 'gruvbox', ink: c.light ? c.text : c.base }
}

// 지금 테마 색. 필드를 바꿔 끼우므로 import 한 쪽은 늘 지금 색을 읽는다.
export const C: Palette = paint('gruvbox')

/** 테마를 바꾼다. 바뀌었으면 true. 모르는 이름(terminal 등)은 gruvbox. */
export function setTheme(name: string): boolean {
  const next = paint(name)
  if (next.name === C.name) return false
  Object.assign(C, next)
  return true
}

// herdr 설정 글에서 쓸 테마 이름. auto_switch 면 dark(맥이 다크 모드인지)에 따라 짝으로.
export function herdrTheme(toml: string, dark: boolean): string {
  let section = ''
  let inTheme = false
  for (const line of toml.split('\n')) {
    if (/^\s*\[/.test(line)) inTheme = /^\s*\[theme\]\s*$/.test(line)
    else if (inTheme) section += `${line}\n`
  }
  const name = /^\s*name\s*=\s*"([^"]+)"/m.exec(section)?.[1] ?? 'gruvbox'
  if (!/^\s*auto_switch\s*=\s*true/m.test(section)) return name
  for (const [d, l] of PAIRS) if (name === d || name === l) return dark ? d : l
  return name
}

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
/** a 를 b 쪽으로 t 만큼 섞는다(0 이면 a, 1 이면 b). */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b)
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`
}

/** 계기판 알약 바탕 — 색을 바탕 쪽으로 35% 누그러뜨린다. 바탕 계열(surface·overlay)은 그대로. */
export const soft = (c: string) => (c === C.surface || c === C.overlay ? c : mix(c, C.base, 0.35))
