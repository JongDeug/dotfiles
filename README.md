# dotfiles

개인 설정 저장소. 내용의 대부분은 Claude Code 설정(스킬·에이전트·훅)이고, 나머지는 터미널/에디터/윈도우 매니저 설정이다.

## 구조

```
.
├── claude/                  # Claude Code 설정 — ~/.claude 로 심링크
│   ├── skills/              #   스킬 (gstack은 submodule, 그 안의 스킬은 SKILL.md 심링크로 노출)
│   ├── agents/              #   서브에이전트 정의
│   ├── hooks/notify.sh      #   작업 완료 시 tmux + OS 알림
│   ├── scripts/             #   스킬이 호출하는 보조 스크립트
│   ├── telegram/            #   텔레그램 연동 설정
│   ├── statusline.sh        #   상태줄 렌더러 (아래 참고)
│   └── settings.json        #   ⚠️ ~/.claude/settings.json 과 별도 파일 — 자동 동기화 안 됨
├── aerospace/               # AeroSpace 윈도우 매니저
├── nvim/                    # Neovim
├── tmux/                    # tmux
├── vscode/                  # VS Code
└── docs/                    # 대부분 2026-03 작성 후 방치. specs/ 만 실제 산출물
```

## 설치

`claude/` 하위 디렉토리를 `~/.claude`에 심링크한다.

```bash
D=~/Documents/dotfiles
for n in skills agents hooks scripts; do ln -sfn "$D/claude/$n" ~/.claude/$n; done
```

나머지 설정은 각 도구의 설정 경로에 심링크한다 (`nvim` → `~/.config/nvim` 등).

### settings.json 은 심링크가 아니다

`~/.claude/settings.json`은 이 repo의 `claude/settings.json`과 **별개 실제 파일**이다. 한쪽을 고쳐도 다른 쪽에 반영되지 않으므로, 설정을 바꿨으면 양쪽을 맞춰야 한다. 현재 두 파일은 `statusLine`·`model`·`enabledPlugins`·`extraKnownMarketplaces` 값이 갈라져 있다.

경로가 하드코딩된 항목도 있다 (`hooks/notify.sh`를 부르는 `Stop`/`Notification` 훅). repo 디렉토리를 옮기면 이 경로를 함께 고쳐야 한다.

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

**현재 미적용 상태.** `~/.claude/statusline.sh` 심링크가 없고, `~/.claude/settings.json`의 `statusLine`이 렌더러 대신 `cat > /tmp/claude-rate-limits.json`(입력 덤프)을 실행하도록 되어 있다. 켜려면:

```bash
ln -sfn ~/Documents/dotfiles/claude/statusline.sh ~/.claude/statusline.sh
# settings.json 의 statusLine.command 를 "bash ~/.claude/statusline.sh" 로 되돌린다
```

## 스킬

목록은 Claude Code에서 `/skills`로 조회한다. `claude/skills/gstack`은 submodule이고, gstack 스킬들은 `claude/skills/<name>/SKILL.md`가 submodule 내부를 가리키는 심링크로 노출된다. 이 심링크는 **절대경로**라서 repo를 다른 경로에 두면 깨진다 — `gstack-upgrade`가 재생성한다.

## clone 시 참고

심링크가 다수 포함돼 있다. Windows에서는 개발자 모드를 켜고 `git config --global core.symlinks true` 후 clone한다.

```bash
git clone --recurse-submodules git@github.com:JongDeug/dotfiles.git
```
