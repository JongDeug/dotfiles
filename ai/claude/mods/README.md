# Claude Code mods

직접 만든 Claude Code mod(함수 훅 플러그인). 이 저장소 루트의 `.claude-plugin/marketplace.json` 이 마켓플레이스(`jongdeug`)다.

| mod | 하는 일 | 상태 |
|---|---|---|
| [board](board/) | 입력창 위 두 줄 계기판 — statusline 대체. 프롬프트 캐시 keepwarm·식은 채 보내기 경고 포함([cache-tax](https://github.com/karanb192/claude-code-mods) 포크) | 사용 |
| [mermaid](mermaid/) | 답 속 ```` ```mermaid ```` 를 다이어그램 그림으로 | 사용 |
| [chart](chart/) | 답 속 ```` ```chart ```` (Vega-Lite JSON) 를 그래프 그림으로 | 사용 |
| [img](img/) | 이미지·영상 경로를 대화 안에 그림으로 | 사용 |
| [web](web/) | pane 안 헤드리스 Chrome | 꺼 둠 — 공식 terminal-browser 플러그인(`/browser`)으로 대체 |

```
/plugin marketplace add JongDeug/dotfiles
/plugin install mermaid@jongdeug     # chart · img 도 같다
```

## 셋이 같이 쓰는 모양

- **그림은 PNG** — Claude Code 의 `Image` 요소는 PNG 나 날것 RGB(A) 만 받는다. SVG 는 resvg 로, 사진은 macOS `sips` 로, 영상은 `ffmpeg` 로 PNG 를 만든다.
- **렌더는 `node bin/*.mjs`** — 훅 모듈 안엔 Node 가 없어서, 쌓인 것을 한 번에 stdin 으로 넘기고 stdout JSON 으로 받는다. `node` 가 PATH 에 있어야 한다.
- **답을 조각낸다** — 답 글에서 블록·이미지 줄만 떼어 그림으로 바꾸고, 나머지는 `next()` 로 엔진이 그리게 한다. 엔진은 첫 조각에만 거터(⏺)를 붙이니 이어지는 조각은 2칸 띄운다.
- **버튼은 숨긴다** — 그림을 `hover={{ scope }}` Box 로 감싸고, 밑 줄의 `display="none"` Box 가 같은 scope 로 드러난다. 포인터를 올리면 `⤢ 크게 보기`(chart 는 `↓ PNG 저장` 도).
- **크게 보기** — `$.ui.open({ rows: 40 })` 로 입력창 위 넓은 pane. 제목 줄 + 가운데 그림, Esc 로 닫힌다.
- **herdr 안** — Claude Code 는 터미널이 kitty·ghostty 라고 답할 때만 그림을 띄운다. herdr 는 `libghostty` 라 settings env 에 `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` 이 있어야 한다.

## 고치고 내보내기

```
# 1. 고친다 (이 폴더)
claude plugin validate ai/claude/mods/<mod>
claude plugin test ai/claude/mods/<mod>
# 2. .claude-plugin/plugin.json 의 version 을 올린다 — 캐시가 버전 폴더라 안 올리면 안 바뀐다
# 3. 커밋·푸시 후 설정 폴더마다
for d in ~/.claude ~/.claude-work; do
  CLAUDE_CONFIG_DIR=$d claude plugin marketplace update jongdeug
  CLAUDE_CONFIG_DIR=$d claude plugin update <mod>@jongdeug
done
# 4. 각 세션에서 /reload-plugins — 그리고 화면에서 그림이 뜨는지 본다
```

타입 검사는 plugin-authoring 스킬이 깔아 주는 `claude-code.d.ts` 를 include 한 tsconfig 로 `tsc -p`.

`/plugin` 의 enable·disable 은 설정 폴더 단위라 **모든 세션에 한꺼번에** 걸린다. 개발 사본(dev-mods, `--plugin-dir`)을 쓰려고 설치본을 끄면 다른 세션에선 그 mod 가 사라진다 — 위처럼 버전을 올려 바로 내보내는 편이 덜 번거롭다.

## 함정 (겪은 것)

정적 검사(validate·tsc·test)로는 안 잡히고 화면에서만 드러난 것들.

- **`/reload-plugins` 뒤엔 `session.start` 가 다시 안 온다.** 거기서 타이머를 켜면 리로드 뒤 영영 안 그린다. 그릴 것이 쌓일 때 렌더를 깨우고, 끝나면 그 사이 쌓인 것을 한 번 더 돈다. 모듈 변수도 리로드 때 비워진다.
- **Button 의 `hover` 는 키(`key`) 있는 Box 안에서만.** 아니면 엔진이 트리를 통째로 거부하고 원래 글로 그린다(`ui.render (AssistantMessage) refused: Button "…" hover has no Box with a key around it`). 버튼은 포인터 아래서 원래 반전되니 대개 필요 없다.
- **한 플러그인에 훅 모듈은 하나, 같은 이벤트 훅도 하나.** `hooks.json` 의 `modules` 에 두 번째를 넣으면 거부되고, 한 모듈 안에서 같은 이벤트(매처 없이)를 두 번 걸어도 거부된다. `$` 는 같은 파일에 선언된 함수로만 넘길 수 있다(import 한 함수로는 안 됨) — 다른 mod 를 합칠 땐 `$` 를 쓰는 부분은 한 파일로, 순수 계산만 import 로.
- **경로 정규식** — macOS 경로엔 공백이 흔하다(`/System/Library/Desktop Pictures/…`). `[^)\s]` 말고 닫는 괄호까지.
- **트리가 거부되면** 대화에 흐린 줄 `<plugin>: ui.render (…) refused: …` 이 남는다. 안 뜨면 이 줄부터 본다.
