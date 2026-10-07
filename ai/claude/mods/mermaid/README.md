# mermaid

Claude 답변 속 ```` ```mermaid ```` 블록을 그 자리에서 다이어그램으로 바꿔 그리는 Claude Code mod.

- **kitty·Ghostty** — 그림(PNG, kitty 그래픽). 배경 투명이라 터미널 테마가 비친다.
- **그 밖(iTerm2, tmux 안)** — 선 문자 도형.
- **한글 라벨** — 선 도형에서 한글이 2칸이라 칸이 틀어지는 걸 맞춘다. 그림은 Apple SD Gothic Neo.

레이아웃은 [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid), PNG 는 resvg. 훅 모듈엔 Node 가 없어서 `bin/render.mjs` 를 `node` 로 띄워 그린다 — `node` 가 PATH 에 있어야 한다.

## 설치

```
/plugin marketplace add JongDeug/dotfiles
/plugin install mermaid@jongdeug
```

Claude Code 가 설치하면서 `package-lock.json` 대로 npm 의존성을 받는다.

## 설정 (`/plugin` → mermaid → configure)

| 키 | 기본 | |
|---|---|---|
| `mode` | `auto` | `auto` kitty·Ghostty 면 그림 · `on` 항상 그림 · `text` 선 도형 · `off` 코드 그대로 |
| `theme` | `catppuccin-mocha` | 그림 색 (beautiful-mermaid 테마) |
| `scale` | `1` | 그림 크기 (0.5~2). 1 이면 라벨이 터미널 글자 크기. 창 폭은 넘지 않는다 |
| `cell_aspect` | `2.2` | 칸 높이÷너비. 그림이 길쭉하면 줄이고 납작하면 키운다 |

**herdr 안.** herdr 패널은 서버를 띄운 터미널의 환경 변수를 물려받아 TERM 으로는 바깥 터미널을 모른다. 게다가 Claude Code 는 터미널 이름이 kitty·ghostty 일 때만 그림을 띄우는데 herdr 는 `libghostty` 라고 답해 막힌다. `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` 이 그 확인을 건너뛴다 — dotfiles `zshrc` 가 herdr 안에서 켜고, 이 mod 의 `auto` 도 그걸 보고 그림으로 간다 (herdr `[experimental] kitty_graphics = true` 필요).

## 개발

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .      # 이 폴더를 한 세션만 불러온다 (먼저 npm install)
```

다른 mermaid mod([mermaid-inline](https://github.com/dazebug/mermaid-inline) 등)를 참고했다. 이건 글꼴 측정·터미널 색 탐지를 빼고, 한글 칸 맞춤을 넣은 작은 판.
