# SETUP

새 PC에서 Claude Code 설정 전체(`~/.claude`)를 한 번에 세팅하는 가이드. 에이전트가 이 문서를 읽고 위에서 아래로 단계를 실행한다 — **이미 잡혀있는 것은 skip** (멱등). harness(Planner→Dev→QE→Ops) 파이프라인까지 포함.

모든 명령은 clone 위치에 무관하다 — `DOTFILES` 변수만 본인의 clone 경로로 맞춘다. macOS/Linux/Git Bash/WSL 어디서나 같은 명령.

## 전제 조건

- `dotfiles` repo가 clone돼 있고 **submodule까지 내려와 있어야 한다**: `git clone --recurse-submodules ...` (이미 clone했다면 `git submodule update --init --recursive`).
- **`ponytail` plugin**이 이 repo의 `settings.json`에 의해 자동 설치되지만, 첫 세팅 시엔 Claude Code가 플러그인을 받아오지 못한 상태일 수 있다. 확인 단계(아래)에서 검증하고, 빠져있으면 `/plugin` → Marketplaces → ponytail으로 수동 설치.

## 0. clone 경로 변수

```bash
DOTFILES="$HOME/Documents/dotfiles"   # ← clone 위치에 맞게 수정
```

## 1. `~/.claude` 심링크 (claude/ 전체)

`skills`, `agents`, `hooks`, `settings.json`, `statusline.sh`를 각각 `~/.claude/<이름>`으로 심링크. **이미 올바른 심링크면 skip**:

```bash
mkdir -p "$HOME/.claude"
for n in skills agents hooks statusline.sh; do
  target="$HOME/.claude/$n"
  [ -L "$target" ] && [ "$(readlink "$target")" = "$DOTFILES/claude/$n" ] && { echo "skip $n (이미 심링크)"; continue; }
  ln -sfn "$DOTFILES/claude/$n" "$target"
done
# settings.json (파일 단위)
[ -L "$HOME/.claude/settings.json" ] && [ "$(readlink "$HOME/.claude/settings.json")" = "$DOTFILES/claude/settings.json" ] || ln -sfn "$DOTFILES/claude/settings.json" "$HOME/.claude/settings.json"
```

> **Windows PowerShell**: `ln` 대신 `New-Item -ItemType SymbolicLink -Path "$HOME\.claude\<name>" -Target "$DOTFILES\claude\<name>"`. (관리자 권한 또는 Developer Mode 필요.)

## 2. gstack 스킬 — 할 일 없음

노출 심링크(`claude/skills/<name>/SKILL.md` → `../gstack/<name>/SKILL.md`)가 상대경로로 커밋돼 있어, 전제조건의 `--recurse-submodules` clone만 했으면 이미 살아있다. 세팅 단계가 없다.

> ⚠️ gstack의 `setup`(= `/gstack-upgrade`)은 **돌리지 않는다.** 54개를 전부 절대경로 심링크로 노출하는 도구라, 돌리면 안 쓰는 50개가 되살아나고 노출 중인 4개도 절대경로로 덮여 다른 머신에서 깨진다. 업데이트는 `git submodule update --remote claude/skills/gstack` 만으로 충분하다.

## 3. harness 에이전트 전역 노출

`~/.claude/agents`는 이미 `dotfiles/claude/agents`를 가리키므로(블록 1), 그 안에 harness 4개 파일을 relative 심링크로 놓는다. **이미 심링크면 skip**:

```bash
cd "$DOTFILES/claude/agents"
for f in harness-planner harness-dev harness-qe harness-ops; do
  [ -L "$f.md" ] && { echo "skip $f.md"; continue; }
  ln -sfn ../../personal-harness-agent/agents/$f.md $f.md
done
```

## 4. `/harness` 커맨드 전역 노출

`~/.claude/commands`를 harness 커맨드 디렉토리로 심링크. **이미 올바르면 skip**:

```bash
[ -L "$HOME/.claude/commands" ] && [ "$(readlink "$HOME/.claude/commands")" = "$DOTFILES/personal-harness-agent/commands" ] || ln -sfn "$DOTFILES/personal-harness-agent/commands" "$HOME/.claude/commands"
```

## 5. 텔레그램 연동 (봇을 돌리는 머신에서만)

`portfolio`·`returnskills` 스킬이 텔레그램 reply를 쓴다. 훅 3개가 `~/.claude/channels/telegram/scripts/`를 참조하므로 그 경로를 만들어준다:

```bash
mkdir -p "$HOME/.claude/channels"
[ -L "$HOME/.claude/channels/telegram" ] || ln -sfn "$DOTFILES/claude/telegram" "$HOME/.claude/channels/telegram"
```

> `portfolio` 스킬이 호출하는 `portfolio_masked.js`는 이 repo에 없다 — 봇 머신 로컬에만 있다. 다른 머신에서 `/portfolio`를 쓰려면 그 파일을 repo로 먼저 가져와야 한다.

텔레그램을 안 쓰는 머신은 이 단계를 건너뛴다. 나머지 스킬은 영향받지 않는다.

## 확인

**새 Claude Code 세션**을 열고(기존 세션은 에이전트/커맨드 목록을 세션 시작 시 로드하므로 재시작 필요):

- 슬래시 커맨드 목록에 `/harness`가 보이는지
- 서브에이전트로 `harness-planner`/`harness-dev`/`harness-qe`/`harness-ops` 4개가 보이는지
- `git-flow` 스킬과 `ponytail` 스킬 패밀리(`ponytail`/`-review`/`-audit`/`-debt`/`-gain`)가 스킬 목록에 보이는지 — ops·dev가 런타임에 불러 쓴다. ponytail이 안 보이면 전제조건의 수동 설치.
- gstack 스킬 4개(`browse`·`design-review`·`office-hours`·`plan-eng-review`)가 보이는지 — 안 보이면 submodule이 안 내려온 것이다(`git submodule update --init --recursive`).

## 스킬 출처 구조 (참고)

`/skills`에 뜨는 스킬은 네 출처가 섞인다:

| 출처 | 개수 | 어디에 | 새 PC에서 |
|---|---|---|---|
| 직접 만든 스킬 | 14 | `claude/skills/<name>/SKILL.md` (실파일) | clone하면 바로 |
| gstack 노출 | 4 | `claude/skills/<name>/SKILL.md` (상대경로 심링크) | clone하면 바로 |
| gstack 본체 | 1 | `claude/skills/gstack/` (submodule) | `--recurse-submodules` |
| 외부 plugin | 12 | `~/.claude/plugins/` | `settings.json`의 `enabledPlugins` |

dotfiles 바깥 아무 디렉토리(`~`, 다른 프로젝트 등)에서 확인해도 똑같이 보여야 한다 — cwd와 무관하게 전역이다.

## 첫 실행

```
/harness personal-harness-agent/specs/hello-world-api.md
```

toy 앱(`hello-world-api/`)이 아직 비어있으므로 이 첫 실행이 Dev가 spec대로 실제로 구현하는 과정을 그대로 보여준다. `LEARNING.md`와 `telemetry.jsonl`은 이때 자동으로 채워진다.
