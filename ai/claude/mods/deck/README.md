# Flight Deck (`deck`)

`/deck` — 하는 일과 명령을 한 장으로 대화에 찍는다.
`/deck sync` — push 한 deck 을 `~/.claude`·`~/.claude-work` 에 깔고, herdr 안의 쉬는 Claude 세션에 `/reload-plugins` 를 보낸다(작업 중·입력 중·부른 세션은 건너뜀). 끝나면 알림으로 요약.

Claude Code 화면 한 벌. 입력창 위 계기판, 답 속 그림, 크게 보기 pane, 프롬프트 캐시 keepwarm 이 한 mod 다. 색은 herdr 테마(gruvbox dark) — `hooks/theme.ts` 하나에서 바꾼다.

```
/plugin marketplace add JongDeug/dotfiles
/plugin install deck@jongdeug
```

## 계기판 — 입력창 위 두 줄 (statusline 대체)

```
 📁 ~/…/com.m1ucs/detector   ⎇ develop ↑1   ◆ Opus 5.5  high   ● 1 +0 −0   CI ✓ build · 3분 전
 CTX ▰▰▰▰▰▱▱▱ 63%   5H ▱▱▱▱▱▱▱▱ 6% ⟲ 4h 46m   7D ▰▰▰▱▱▱▱▱ 40% ⟲ 2d 16h   $97.87 🔥 $2.0/h   ☕ 캐시 42m 남음      ⠹ 12s  Bash  도구 3
```

- **윗줄 — 어디서**: 경로(노랑), 브랜치(↑↓, 아쿠아), 모델·effort(주황), 바뀐 파일 수와 +/− 줄, CI(GitHub `gh` · GitLab `glab`, 현재 브랜치 마지막 실행). 변경 알약에 포인터를 올리면 파일 목록이 위로 펼쳐진다.
- **아랫줄 — 얼마나 남았나**: 컨텍스트(늘 초록)·5시간·7일을 같은 ▰▱ 8칸 게이지로(한도는 50%·80% 에서 초록 → 노랑 → 빨강, 초기화까지 남은 시간), 비용과 시간당 소모율, 프롬프트 캐시. 오른쪽 끝은 도는 동안 스피너·경과·지금 도구·도구/편집/에이전트 수, 끝나면 `지난 턴 …`.
- **좁은 pane** — 한 줄에 안 들어가면 덜 중요한 것부터 뺀다(지난 턴 → 깨끗 표시 → 🔥/h → 초기화 시각 → effort · 캐시 설명 → CI · 비용 → 7D …). 브랜치·경로·CTX 는 끝까지 남는다.
- 갱신: 도는 동안 0.25초(스피너), 컨텍스트·한도 5초, git 10초(명령·편집이 끝날 때도), CI 1분. 값은 `$.session.usage()`(statusline 과 같은 숫자), `$.session.model()`, git·gh·glab. effort 는 훅에 오지 않아서 설정 파일의 `effortLevel` 을 읽는다.

## 프롬프트 캐시 — keepwarm · 식은 채 보내기 경고

[cache-tax](https://github.com/karanb192/claude-code-mods) 2.2.1(Karan Bansal, MIT — `LICENSE-cache-tax`)을 합쳤다. 동작은 원본 그대로이고 그리기는 아랫줄 캐시 알약이 맡는다.

- `/keepwarm` — 쉬는 동안 캐시를 데워 둔다. 그냥 치면 6시간, `90m` 같은 시간, `always`(세션마다 자동), `off`, `status`. 마지막 요청 뒤 50분 쉬면 짧은 핑을 보낸다(토큰을 쓴다). 핑이 캐시를 다시 쓰면(이미 식었으면) 스스로 멈춘다.
- **식은 채 보내기 경고** — 컨텍스트가 5만 토큰을 넘는데 캐시가 식었으면 첫 메시지를 한 번 막고 다시 쓰는 값을 보인다. 다시 보내면 들어간다. `/cache guard warn` 이면 막지 않고 값만 보인다.
- `/cache` — 상태 카드: 식은 비용, keepwarm, 손익분기, 이 세션에 낸 식은 쓰기.
- 알약: `☕ 캐시 42m 남음 · keepwarm 5h12m · 핑 8m 뒤` → 식으면 `🧊 캐시 식음 · 다음 요청이 371k 다시 씀 ≈$3.71`, 멈추면 `⏸ keepwarm 멈춤 · 이유`.

## 답 속 그림

Claude 에게 "이 터미널은 그림을 그린다"는 안내를 붙여, 그림이 나은 곳에 아래 문법을 쓰게 한다. 그림 밑에 포인터를 올리면 `⤢ 크게 보기`(차트는 `↓ PNG 저장` 도) — 입력창 위 넓은 pane 하나에 꽉 차게, Esc 로 닫는다.

| 쓰는 것 | 그림 | 그리는 것 |
|---|---|---|
| ```` ```mermaid ```` | 다이어그램. 그림이 안 되는 터미널(iTerm2, tmux 안)이면 선 문자 도형 | `bin/mermaid.mjs` — [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) 레이아웃 + resvg. 한글 칸 맞춤, `style: sketch` 면 손그림(rough.js · Gaegu, `fonts/OFL.txt`) — 상자·마름모·원·실린더·선 모두, 작은 아이콘(시작·끝 점, ER 기호)과 화살촉은 반듯하게 |
| ```` ```chart ```` (Vega-Lite JSON) | 막대·선·도넛·나란히(`hconcat`) | `bin/chart.mjs` — vega-lite → vega → SVG → resvg PNG 2배. `style: sketch` 면 rough.js 로 흔들리는 모양(단색 채움)·손그림 선. 크게 보기는 pane 크기로 다시 그린다 |
| `![설명](/절대/경로.png)` 줄 | 그림(한 줄에 여러 개면 나란히), 영상은 프레임 6장 | `bin/convert.sh` — macOS `sips`, 영상은 `ffmpeg`. `~/.cache/claude-img` 에 둔다 |
| Read 로 읽은 이미지 | 그 도구 줄 아래 | 〃 |

그림 요소(kitty 그래픽)가 되는 터미널이 필요하다 — herdr 안이면 settings 의 env 에 `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`. 못 그리면 코드 그대로 두고 아래에 이유를 흐리게 단다.

## 커밋 검문

git-commit 스킬이 앞에서 쓰는 법을 이끌고, deck 은 실행 직전에 기계로 가를 수 있는 규칙만 한 번 더 본다. 걸리면 `git commit`·`git add` 를 실행하지 않고 고칠 곳(몇째 줄이 왜)을 짚어 돌려보낸다 — 모델이 고쳐 다시 한다.

- 원천 — `attribution.text`: 엔진이 커밋·PR 에 서명을 붙이라고 시키는 문구를 비운다. 모델이 처음부터 안 쓴다.
- 서명 줄: `Co-Authored-By: Claude…` · `Claude-Session:` · `🤖 Generated with [Claude Code]`. 사람 공동작성자 줄은 건드리지 않는다.
- 한꺼번에 담기: `git add -A` · `git add .` · `git commit -a`.
- 제목: `type(scope): 제목`, type 은 feat · fix · refactor · perf · test · docs · chore · style · build · ci · revert. Merge·Revert 기본 제목과 fixup! 은 넘긴다.
- 브랜치: `fix/…` 에선 `fix:` 처럼 브랜치 prefix 와 type 을 맞춘다.
- 본문: 60칸 넘는 줄이 문장부호 없이 끝나고 다음 줄이 이어지면(폭 맞춰 끊은 줄), 표(`|`), 공백 여러 칸으로 맞춘 열.
- 팀 레포만: develop · main · master 에 바로 커밋. 팀 레포 = 저장소 CLAUDE.md 가 `backend-llm-wiki/REPO-CLAUDE.md` 를 import 하는 곳.

명령 속 글만 읽으므로 `-F 파일` 로 넘긴 메시지와 편집기로 쓴 메시지는 못 본다. 따옴표 속 글·heredoc 은 명령으로 치지 않는다(글 속 "git commit" 에 속지 않는다).

## 펫 (슬라임 말랑이 · 드론 DECK-1)

계기판 오른쪽 끝에 펫이 산다(설정 `pet`: `slime` 기본 · `drone` · `off`, 100칸보다 좁으면 숨는다). 펫은 그림만 — 등급·상태는 `/pet` 카드에서 본다.

- 슬라임(21칸 × 4줄): 바닥에 앉은 반타원 젤리를 너비·높이·기울기·위치로 그때그때 계산해 찍는다(`slime.ts`). 쉬는 동안엔 깜빡이다 왼쪽을 힐끔 보고, 왼쪽으로 사르륵 녹아 흘러가 사라졌다가(바닥 자국이 말라 간다) 오른쪽 위에서 뚝 떨어져 뿅 하고 다시 선다.
- 드론(17칸 × 5줄): 손으로 찍은 탑뷰 쿼드콥터 판(`drone.ts`). 가드 링을 따라 날개 끝이 돌고 항법등이 깜빡인다.
- 상태는 둘이 같다: `ARMED` 일하는 중(슬라임은 콩콩 뛰며 땀), `HOVER` 쉬는 중, `RTB` 캐시 식음(슬라임은 웅덩이로 꾸벅), `DAMAGED` 커밋 검문·도구 오류 뒤 20초(시무룩), `LOW BAT` 5H 한도 80% 넘음(지쳐서 납작).
- 모든 세션이 함께 끝낸 턴 수(`$.store`)로 MK-I → MK-II(50) → MK-III(300). `/pet` 은 카드, `/pet off`·`on` 은 이 세션에서만 숨기기·띄우기.

## 설정 (`/plugin` → deck → configure)

| 키 | 기본 | |
|---|---|---|
| `cell_aspect` | `2.2` | 칸 높이÷너비. 그림이 길쭉하면 줄이고 납작하면 키운다 |
| `max_rows` | `30` | 답 속 이미지·mermaid 하나의 최대 높이(줄) |
| `scale` | `1` | 다이어그램 크기(0.5~2). 1 이면 라벨이 터미널 글자 크기 |
| `pet` | `slime` | `drone` 이면 탑뷰 드론, `off` 면 안 띄움 |
| `style` | `clean` | `sketch` 면 손그림 — 다이어그램은 rough 선·손글씨체, 차트는 흔들리는 모양을 단색으로 채우고 축·글자도 손그림 |

## 구조

훅 모듈은 플러그인마다 하나이고 `$` 는 import 한 함수로 넘길 수 없어서, 타이머·핑·저장·그리기·훅은 모두 `hooks/register.tsx` 에 있다. `$` 를 안 쓰는 것만 나눴다 — `theme.ts`(색), `blocks.ts`(답을 블록으로), `board.ts`(git·시간·칸 맞추기·서명 줄 찾기), `commit.ts`(커밋 검문), `drone.ts`(드론 픽셀·상태·등급), `slime.ts`(슬라임 모션), `help.ts`(/deck 안내), `cache.ts`·`cacheview.ts`(keepwarm 문구·캐시 알약), `images.ts`·`fences.ts`·`parse.ts`(이미지 줄·차트·mermaid 찾기). 렌더러는 `bin/` 의 node·sh 다(훅 모듈엔 Node 가 없다). 그린 그림은 `~/.cache/claude-deck/pictures/` 에 남겨(`diskcache.mjs`, 렌더러 소스까지 해시) 리로드·재시작해도 다시 그리지 않는다. `sync.mjs` 는 `/deck sync`.

```
claude plugin validate ai/claude/mods/deck
claude plugin test ai/claude/mods/deck     # 88개
node ai/claude/mods/deck/bin/check.mjs     # mermaid 글꼴 점검 (npm ci 뒤)
```
