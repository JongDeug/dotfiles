# SETUP

새 PC에서 Claude Code 설정 전체(`~/.claude`)를 한 번에 세팅하는 가이드. 에이전트가 이 문서를 읽고 위에서 아래로 단계를 실행한다 — **이미 잡혀있는 것은 skip** (멱등). harness(Planner→Dev→QE→Ops) 파이프라인까지 포함.

모든 명령은 clone 위치에 무관하다 — `DOTFILES` 변수만 본인의 clone 경로로 맞춘다. macOS/Linux/Git Bash/WSL 어디서나 같은 명령.

## 전제 조건

- `dotfiles` repo가 clone돼 있어야 한다. submodule은 없으므로 평범한 `git clone`이면 된다.
- **`ponytail` plugin**이 이 repo의 `settings.json`에 의해 자동 설치되지만, 첫 세팅 시엔 Claude Code가 플러그인을 받아오지 못한 상태일 수 있다. 확인 단계(아래)에서 검증하고, 빠져있으면 `/plugin` → Marketplaces → ponytail으로 수동 설치.

## 0. clone 경로 변수

```bash
DOTFILES="$HOME/Documents/dotfiles"   # ← clone 위치에 맞게 수정
```

## 1. `~/.claude` 심링크 (claude/ 전체)

`agents`, `hooks`, `settings.json`, `statusline.sh`를 각각 `~/.claude/<이름>`으로 심링크. **이미 올바른 심링크면 skip**:

```bash
mkdir -p "$HOME/.claude"
for n in agents hooks statusline.sh; do
  target="$HOME/.claude/$n"
  [ -L "$target" ] && [ "$(readlink "$target")" = "$DOTFILES/claude/$n" ] && { echo "skip $n (이미 심링크)"; continue; }
  ln -sfn "$DOTFILES/claude/$n" "$target"
done
# settings.json (파일 단위)
[ -L "$HOME/.claude/settings.json" ] && [ "$(readlink "$HOME/.claude/settings.json")" = "$DOTFILES/claude/settings.json" ] || ln -sfn "$DOTFILES/claude/settings.json" "$HOME/.claude/settings.json"
```

> **Windows PowerShell**: `ln` 대신 `New-Item -ItemType SymbolicLink -Path "$HOME\.claude\<name>" -Target "$DOTFILES\claude\<name>"`. (관리자 권한 또는 Developer Mode 필요.)

## 2. 스킬 심링크 (`~/.claude/skills`는 실제 디렉토리)

`skills`만 통심링크가 **아니다.** `~/.claude/skills`를 실제 디렉토리로 두고 자작 스킬을 하나씩 심링크한다. 외부 스킬(gstack 등)이 `~/.claude/skills/` 안에 자기 것을 설치해도 이 repo가 오염되지 않게 하려는 것이다.

```bash
# 과거에 통심링크였다면 먼저 걷어낸다 (심링크만 지우므로 repo 는 안전)
[ -L "$HOME/.claude/skills" ] && rm "$HOME/.claude/skills"

mkdir -p "$HOME/.claude/skills"
for d in "$DOTFILES"/claude/skills/*/; do
  name="$(basename "$d")"
  target="$HOME/.claude/skills/$name"
  [ -L "$target" ] && [ "$(readlink "$target")" = "$d" ] && { echo "skip $name"; continue; }
  ln -sfn "$d" "$target"
done
```

스킬을 새로 만들 때마다 이 루프만 다시 돌리면 된다 (멱등).

## 2-1. gstack (선택 — 이 repo에 들어있지 않다)

[gstack](https://github.com/garrytan/gstack)은 marketplace 배포가 없어 `enabledPlugins`로 못 받고, 벤더링도 하지 않는다 — 내 설정이 아닌 데다 `browse`의 실행 바이너리는 어차피 각 머신에서 빌드해야 한다. 쓰고 싶은 머신에서만 직접 설치한다:

```bash
git clone https://github.com/garrytan/gstack "$HOME/.claude/skills/gstack"
"$HOME/.claude/skills/gstack/setup"      # bun 필요
```

`setup`은 `INSTALL_SKILLS_DIR="$(dirname "$INSTALL_GSTACK_DIR")"` — 자기 부모인 `~/.claude/skills/`에 `gstack-*` 디렉토리를 만든다. 블록 2에서 그 경로를 실제 디렉토리로 만들어뒀으므로 설치물이 dotfiles repo로 새지 않는다.

업데이트: `cd ~/.claude/skills/gstack && git pull && ./setup`

`/skills` 목록이 길면 안 쓰는 `gstack-*`를 지운다(`setup` 재실행 시 되살아남). 실사용은 `gstack-browse`·`gstack-design-review`·`gstack-office-hours`·`gstack-plan-eng-review` 정도. **gstack을 안 깔아도 나머지는 전부 정상 동작한다.**

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
- 자작 스킬 14개가 보이는지 — 안 보이면 블록 2의 루프 미실행.
- (gstack을 깐 머신이면) `gstack-*`가 보이는지.

## 스킬 출처 구조 (참고)

`/skills`에 뜨는 스킬은 세 출처가 섞인다. **이 repo가 들고 있는 건 첫 줄뿐이다.**

| 출처 | 개수 | 실체 위치 | 새 PC에서 |
|---|---|---|---|
| 직접 만든 스킬 | 14 | `claude/skills/<name>/` — 이 repo | clone + 블록 2 루프 |
| 외부 plugin | 12 | `~/.claude/plugins/` | `settings.json`의 `enabledPlugins`로 자동 |
| gstack | 선택 | `~/.claude/skills/gstack` — repo 밖 | 블록 2-1 (안 깔아도 됨) |

dotfiles 바깥 아무 디렉토리(`~`, 다른 프로젝트 등)에서 확인해도 똑같이 보여야 한다 — cwd와 무관하게 전역이다.

## 첫 실행

```
/harness personal-harness-agent/specs/hello-world-api.md
```

toy 앱(`hello-world-api/`)이 아직 비어있으므로 이 첫 실행이 Dev가 spec대로 실제로 구현하는 과정을 그대로 보여준다. `LEARNING.md`와 `telemetry.jsonl`은 이때 자동으로 채워진다.
