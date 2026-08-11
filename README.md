# dotfiles

개인 설정 저장소. 새 PC에서 이걸 clone하면 내 Claude Code 설정이 한 번에 서는 것이 목적이다. 내용의 대부분은 Claude Code 설정(스킬·에이전트·훅)이고, 나머지는 터미널/에디터/윈도우 매니저 설정이다.

**여기 담기는 건 내가 쓴 것만이다.** 외부 스킬 묶음(gstack)이나 플러그인은 repo에 벤더링하지 않고, 각 머신에서 설치하는 방법만 문서로 남긴다.

## 구조

```
.
├── ai/                          # AI 도구 설정 전부
│   ├── setup.sh                 #   ← 세팅은 이거 하나 돌리면 끝 (멱등)
│   ├── SETUP.md                 #   그 절차의 설명·선택 항목
│   ├── claude/                  #   Claude Code 전용 배선
│   │   ├── skills/              #     직접 만든 스킬
│   │   ├── agents/              #     Claude 종속 에이전트 (chaos-blog-team — Agent Teams)
│   │   ├── hooks/notify.sh      #     작업 완료 시 tmux + OS 알림
│   │   ├── telegram/            #     텔레그램 연동 설정
│   │   ├── statusline.sh        #     상태줄 렌더러 (아래 참고)
│   │   └── settings.json        #     전역 설정 — 훅, 플러그인 목록, 취향
│   └── shared/                  #   호스트 무관 — 다른 AI 도구에도 그대로 쓸 것
│       └── harness/             #     Planner→Dev→QE→Ops (역할 프롬프트·커맨드·spec)
├── aerospace/                   # AeroSpace 윈도우 매니저
├── herdr/                       # Herdr (터미널 워크스페이스 — 키바인딩을 tmux 에 맞춤)
├── tmux/                        # tmux
└── vscode/                      # VS Code
```

**`ai/claude` vs `ai/shared` 기준:** 그 도구가 없으면 의미가 없는 것은 `claude/`(훅·statusline·settings, Agent Teams 의존인 chaos-blog-team), 역할 프롬프트처럼 호스트를 갈아끼워도 살아남는 것은 `shared/`. Codex·Cursor 등을 쓰게 되면 `ai/codex/` 를 형제로 추가하고 `shared/` 를 양쪽에서 노출한다 — **쓰기 전까지는 만들지 않는다.**

파일은 전부 **실체 하나씩만** 있다. `~/.claude`로 노출하는 심링크는 repo에 커밋하지 않고 세팅할 때 만든다.

## 새 PC 세팅

```bash
git clone git@github.com:JongDeug/dotfiles.git ~/어디든
~/어디든/ai/setup.sh
```

clone 위치는 상관없다 — 스크립트가 자기 위치로 repo를 찾는다.

**스킬이나 에이전트를 새로 만들면 `ai/setup.sh`를 다시 돌리면 된다.** 몇 번 돌려도 안전하고(멱등), 갯수를 세지 않고 있는 것을 전부 링크하므로 뭘 추가해도 문서나 스크립트를 고칠 일이 없다. `--check`를 붙이면 손대지 않고 상태만 본다.

심링크가 아닌 실물이 이미 자리에 있으면 건너뛰고 경고한다 — 남의 파일을 지우지 않는다.

자세한 연결 표와 선택 항목(gstack·텔레그램)은 [ai/SETUP.md](ai/SETUP.md).

나머지 설정은 각 도구의 설정 경로에 심링크한다 (`tmux` → `~/.config/tmux` 등).

### settings.json

`~/.claude/settings.json`은 이 repo의 `claude/settings.json`을 가리키는 심링크다. 따라서 Claude Code에서 설정을 바꾸면 이 repo 파일이 직접 수정되고, `git status`에 잡힌다 — 커밋하면 그대로 다음 PC로 넘어간다.

여기 담긴 것 중 손으로 복원하기 어려운 것:

- `enabledPlugins` — 설치해둔 외부 플러그인 목록 (ponytail, humanize-korean, karpathy-skills 등)
- `extraKnownMarketplaces` — 그 플러그인들을 받아오는 마켓플레이스 URL
- `hooks` — `PostToolUse`(sync-readme), `Notification`/`Stop`(notify.sh)

훅 커맨드는 전부 `~/.claude/...` 를 경유한다(`bash ~/.claude/hooks/notify.sh`). repo 경로가 들어있지 않으므로 repo를 어디에 두든 그대로 동작한다.

## 상태줄 (statusline)

`claude/statusline.sh`는 Claude Code가 넘겨주는 JSON에서 프로젝트·브랜치·모델·컨텍스트·비용과 `rate_limits`(5시간/7일 사용률, 리셋 시각)를 뽑아 한 줄로 렌더링한다.

```
📁 chaos 🌿 develop*2 · Opus 5 1M(xhigh) · 🧠 6% 62k/1M · 💰 $1.03 · 5h █░░░░░░░░░ 11%(16m) · 7d █████████░ 91%(67h 46m)
```

게이지 색은 사용률에 따라 바뀐다 (`<50%` 초록 → `50~74%` 노랑 → `75~89%` 주황 → `≥90%` 빨강). 브랜치 뒤 `*2`는 커밋되지 않은 변경 파일 수, 괄호 안은 리밋 리셋까지 남은 시간.

스타일은 `~/.claude/statusline.style`에 한 단어를 넣어 전환한다 (기본 `full`).

| 스타일 | 구성 |
|--------|------|
| `full` | 위 예시 — 컨텍스트·비용 포함 1줄 |
| `classic` | 프로젝트·브랜치·모델·5h·7d 만 |
| `two` | 2줄 (아래줄에 12칸 게이지 + diff 라인수) |
| `minimal` | 5칸 게이지 초압축 1줄 |

## 스킬

목록은 Claude Code에서 `/skills`로 조회한다. 스킬은 세 경로로 들어온다.

| 출처 | 어디에 있나 | 새 PC에서 |
|---|---|---|
| 직접 만든 것 | `ai/claude/skills/<name>/` — 이 repo | `ai/setup.sh` |
| 외부 플러그인 | `settings.json`의 `enabledPlugins` | Claude Code가 자동 설치 |
| gstack | `~/.claude/skills/gstack` — repo 밖 | 아래 절차 (선택) |

### gstack (repo에 넣지 않는다)

[gstack](https://github.com/garrytan/gstack)은 marketplace 배포가 없어서 `enabledPlugins`로 못 받는다. 그렇다고 submodule로 벤더링하지도 않는다 — 내 설정이 아니고, `browse`의 실행 바이너리(`browse/dist`)는 어차피 추적 대상이 아니라 벤더링해도 각 머신에서 `setup`을 돌려야 하기 때문이다. 그래서 **repo 밖에 직접 clone**한다.

```bash
git clone https://github.com/garrytan/gstack ~/.claude/skills/gstack
~/.claude/skills/gstack/setup       # bun 필요
```

`setup`은 자기 부모 디렉토리(`~/.claude/skills/`)에 `gstack-*` 디렉토리를 만들어 스킬을 노출한다. `~/.claude/skills`가 실제 디렉토리라서(위 세팅 참고) 설치물이 이 repo로 새지 않는다.

업데이트는 그 자리에서:

```bash
cd ~/.claude/skills/gstack && git pull && ./setup
```

`/skills` 목록이 길어지는 게 싫으면 안 쓰는 `gstack-*` 디렉토리를 지운다 (`setup`을 다시 돌리면 되살아난다). 실사용은 `gstack-browse` · `gstack-design-review` · `gstack-office-hours` · `gstack-plan-eng-review` 정도.

gstack을 안 깐 머신에서도 나머지 설정은 전부 정상 동작한다.

## clone 시 참고

심링크가 다수 포함돼 있다. Windows에서는 개발자 모드를 켜고 `git config --global core.symlinks true` 후 clone한다.
