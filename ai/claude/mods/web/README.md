# web

Claude Code 안 pane 에 브라우저를 띄우는 mod. herdr 창을 나누지 않고, Claude 창을 zoom 한 채로 대화 옆에서 웹을 본다.

```
/web github.com     # pane 을 열고 연다 (주소만 쓰면 https://, 낱말이면 DuckDuckGo 검색)
/web                # 빈 브라우저
/web close          # 닫는다 — pane 을 닫아도 꺼진다
/web debug          # 상태 (그림이 안 나올 때)
```

- **화면** — 헤드리스 Chrome 화면을 2배(레티나) PNG 로 찍어 pane 의 그림(kitty 그래픽)을 바꿔 끼운다. 바뀔 때만 찍는다.
- **조작** — 위 줄 `‹ › ↻` 와 주소칸(불러오는 중엔 `↻` 가 `×` 멈춤), 아래 줄은 제목·호스트·로딩. 휠은 페이지 스크롤, 그림을 클릭하면 페이지 클릭 + 키 입력이 페이지로 간다(Esc 로 돌아옴).
- **검색** — 주소칸에 낱말을 넣으면 DuckDuckGo. 구글은 헤드리스 Chrome 을 로봇 확인 페이지로 막는다.
- **Claude 도 같은 탭을** — 떠 있는 동안 시스템 프롬프트에 CDP 포트가 들어가서, Claude 가 `agent-browser --cdp <포트>` 로 그 탭을 읽고 누른다. 비밀번호 입력은 사람이 한다.
- **로그인 유지** — 프로필이 `~/.cache/claude-web/profile` 에 남는다. 다른 세션이 이미 쓰고 있으면 그 세션만 임시 프로필(로그인 없음)로 뜨고, 끄면 지운다.

## 필요한 것

- Google Chrome (`/Applications/Google Chrome.app`), `node`
- 그림이 되는 터미널 — kitty·Ghostty. **herdr 안이면 `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`** (dotfiles `zshrc` 가 켠다). Claude Code 는 터미널 이름이 kitty·ghostty 일 때만 그림을 띄우는데 herdr 는 `libghostty` 라고 답해서, 이게 없으면 그림 자리에 페이지 제목만 흐리게 나온다 (`/web debug` 의 `blit:` 줄이 그 이유를 말한다).
- Claude 조작용 agent-browser — PATH 에 없으면 terminal-browser 에 든 것을 찾아 쓴다.

## 설정 (`/plugin` → web → configure)

| 키 | 기본 | |
|---|---|---|
| `cell_aspect` | `2.2` | 칸 높이÷너비. 페이지가 길쭉하면 줄이고 납작하면 키운다 |
| `px_per_column` | `9` | 한 칸당 CSS 픽셀. 키우면 페이지가 넓게(작게) 보인다 |

## 구조

`bin/browser.mjs` (Node) 가 Chrome 을 띄워 CDP 로 붙들고, 화면 PNG 와 상태를 stdout 한 줄 JSON 으로 낸다. 명령(navigate·click·wheel·key·resize·quit)은 `/tmp/claude-web-<pid>.sock` 로 받는다. 훅 모듈(`hooks/register.tsx`)은 Node 가 없어서 이 프로세스를 `$.process.spawn` 으로 띄우고 `$.http.fetch` 로 부린다. 그림 위 클릭·키는 겹친 `Client` 영역(`hooks/input.tsx`)이 받는다.
