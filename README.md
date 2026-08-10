# dotfiles

개인 설정 저장소. 새 PC에서 이걸 clone하면 내 스킬과 자주 쓰는 외부 스킬이 한 번에 세팅되는 것이 목적이다. 내용의 대부분은 Claude Code 설정(스킬·에이전트·훅)이고, 나머지는 터미널/에디터/윈도우 매니저 설정이다.

## 구조

```
.
├── claude/                  # Claude Code 설정 — ~/.claude 로 심링크
│   ├── skills/              #   스킬 (직접 만든 14개 + gstack submodule)
│   ├── agents/              #   서브에이전트 정의
│   ├── hooks/notify.sh      #   작업 완료 시 tmux + OS 알림
│   ├── telegram/            #   텔레그램 연동 설정 — ~/.claude/channels/telegram 로 심링크
│   ├── statusline.sh        #   상태줄 렌더러 (아래 참고)
│   └── settings.json        #   전역 설정 — 훅, 플러그인 목록, 취향
├── personal-harness-agent/  # Planner→Dev→QE→Ops harness — 세팅은 personal-harness-agent/SETUP.md
├── aerospace/               # AeroSpace 윈도우 매니저
├── tmux/                    # tmux
└── vscode/                  # VS Code
```

## 새 PC 세팅

repo 위치는 어디든 상관없다 — 아래 `D`만 맞추면 된다.

```bash
git clone --recurse-submodules git@github.com:JongDeug/dotfiles.git ~/Documents/dotfiles

D=~/Documents/dotfiles
mkdir -p ~/.claude/channels
for n in skills agents hooks settings.json statusline.sh; do
  ln -sfn "$D/claude/$n" ~/.claude/$n
done
ln -sfn "$D/personal-harness-agent/commands" ~/.claude/commands
ln -sfn "$D/claude/telegram" ~/.claude/channels/telegram   # 텔레그램 봇을 돌리는 머신에서만
```

끝이다. gstack 노출 심링크는 상대경로로 커밋돼 있어 clone과 동시에 살아난다 — 별도 재생성 단계가 없다.

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
| 직접 만든 14개 | `claude/skills/<name>/` 실파일 | clone하면 바로 |
| 외부 플러그인 12개 | `settings.json`의 `enabledPlugins` | Claude Code가 자동 설치 |
| gstack 4개 | `claude/skills/<name>/SKILL.md` → submodule 심링크 | clone하면 바로 |

### gstack

`claude/skills/gstack`은 submodule이고 안에 54개 스킬이 들어있지만, 그중 **실제로 노출한 건 4개**다 — `browse` · `design-review` · `office-hours` · `plan-eng-review`. 노출 방식은 `claude/skills/<name>/SKILL.md`가 submodule 내부를 가리키는 심링크다.

```
claude/skills/browse/SKILL.md -> ../gstack/browse/SKILL.md
```

타깃이 **상대경로**라 repo를 어디에 두든, 어느 머신이든 깨지지 않는다. 그래서 그냥 git에 커밋돼 있고, clone하면 바로 살아난다.

업데이트는 submodule을 당기면 끝이다:

```bash
git submodule update --remote claude/skills/gstack
git add claude/skills/gstack && git commit -m "chore: gstack 업데이트"
```

> ⚠️ gstack의 `setup`(= `/gstack-upgrade`)은 **돌리지 않는다.** 그건 54개를 전부 절대경로 심링크로 노출하는 도구라, 돌리면 안 쓰는 50개가 되살아나고 위 4개도 절대경로로 덮인다. 노출할 스킬을 늘리고 싶으면 심링크를 직접 하나 만들면 된다:
> ```bash
> mkdir -p claude/skills/<name> && ln -s ../gstack/<name>/SKILL.md claude/skills/<name>/SKILL.md
> ```
> (스킬이 `sections/` 같은 보조 디렉토리를 쓰면 그것도 같은 방식으로 링크한다.)

## clone 시 참고

심링크가 다수 포함돼 있다. Windows에서는 개발자 모드를 켜고 `git config --global core.symlinks true` 후 clone한다.
