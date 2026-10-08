# mermaid

Claude 답변 속 ```` ```mermaid ```` 블록을 그 자리에서 다이어그램으로 바꿔 그리는 Claude Code mod.

- **kitty·Ghostty** — 그림(PNG, kitty 그래픽). 배경 투명이라 터미널 테마가 비친다.
- **그 밖(iTerm2, tmux 안)** — 선 문자 도형.
- **크게 보기** — 다이어그램에 포인터를 올리면 밑에 `⤢ 크게 보기`(최대 3배). 못 그리면 코드 밑에 이유를 흐리게 단다.
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
| `scale` | `1` | 그림 크기 (0.5~2). 1 이면 라벨이 터미널 글자 크기. 창 폭은 넘지 않는다 |
| `style` | `clean` | `sketch` 면 excalidraw 처럼 손으로 그린 선(rough.js)과 손글씨체(Gaegu, `fonts/OFL.txt`) |

그림 · 선 도형은 터미널을 보고 고른다 — kitty · Ghostty 면 그림, 아니면 선 도형. **herdr 안에서는 바깥 터미널을 알 수 없어서** `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`(settings 의 env)을 보고 그림으로 그린다(herdr `[experimental] kitty_graphics = true` 필요). 색은 herdr 테마에 맞춘 gruvbox dark(`bin/render.mjs` 의 `OWN_THEMES`).

## 개발

```
claude plugin validate .
claude plugin test .
node bin/check.mjs      # 렌더러 글꼴 점검 (npm ci 뒤)
claude --plugin-dir .      # 이 폴더를 한 세션만 불러온다 (먼저 npm install)
```

다른 mermaid mod([mermaid-inline](https://github.com/dazebug/mermaid-inline) 등)를 참고했다. 이건 글꼴 측정·터미널 색 탐지를 빼고, 한글 칸 맞춤을 넣은 작은 판.
