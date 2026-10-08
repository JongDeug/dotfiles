import { expect, test } from 'claude-code/testing'
import { C, herdrTheme, mix, setTheme, soft } from './theme'

const toml = (theme: string) => `[ui]\nname = "nope"\n\n[theme]\n${theme}\n\n[remote]\nmanage_ssh_config = false\n`

test('herdr 설정의 [theme] name 을 읽고, auto_switch 면 라이트·다크 짝을 고른다', () => {
  expect(herdrTheme(toml('name = "catppuccin"\nauto_switch = false'), false)).toBe('catppuccin')
  expect(herdrTheme(toml('name = "gruvbox"\nauto_switch = true'), false)).toBe('gruvbox-light')
  expect(herdrTheme(toml('name = "gruvbox-light"\nauto_switch = true'), true)).toBe('gruvbox')
  expect(herdrTheme(toml('name = "dracula"\nauto_switch = true'), false)).toBe('dracula')
  expect(herdrTheme('[ui]\nname = "x"\n', true)).toBe('gruvbox')
})

test('setTheme 은 C 를 바꿔 끼우고, 모르는 테마는 gruvbox', () => {
  expect(setTheme('tokyo-night')).toBe(true)
  expect(C.base).toBe('#1a1b26')
  expect(setTheme('tokyo-night')).toBe(false)
  setTheme('one-light')
  expect(C.ink).toBe(C.text) // 밝은 테마: 색 알약 위 글자는 어두운 글자색
  setTheme('terminal')
  expect(C.name).toBe('gruvbox')
  expect(C.ink).toBe(C.base)
})

test('soft 는 바탕 쪽으로 35% 섞고 바탕 계열은 그대로', () => {
  setTheme('gruvbox')
  expect(soft(C.yellow)).toBe(mix(C.yellow, C.base, 0.35))
  expect(soft(C.yellow)).toBe('#b1892d') // 예전 SOFT 표(#b0892d)와 반올림만 다르다
  expect(soft(C.surface)).toBe(C.surface)
})
