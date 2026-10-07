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
| `cell_aspect` | `2.2` | 칸 높이÷너비. 그림이 길쭉하면 줄이고 납작하면 키운다 |

**herdr 안이면 `auto` 가 못 알아본다.** herdr 패널은 서버를 띄운 터미널의 환경 변수를 물려받아서, kitty 로 보고 있어도 iTerm2 로 보일 수 있다. kitty 에서 herdr 를 쓰면 `mode` 를 `on` 으로 (herdr `[experimental] kitty_graphics = true` 필요).

## 개발

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .      # 이 폴더를 한 세션만 불러온다 (먼저 npm install)
```

다른 mermaid mod([mermaid-inline](https://github.com/dazebug/mermaid-inline) 등)를 참고했다. 이건 글꼴 측정·터미널 색 탐지를 빼고, 한글 칸 맞춤을 넣은 작은 판.
