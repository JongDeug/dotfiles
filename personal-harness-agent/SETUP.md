# SETUP

이 폴더 하나에 harness(Planner→Dev→QE→Ops) 파이프라인의 전부가 들어있다. 전역으로 쓰려면(어떤 프로젝트에서든 `/harness`를 칠 수 있게) 아래 심링크 두 블록만 실행하면 된다.

## 전제 조건

- `dotfiles` repo가 clone돼 있고, 기존 심링크(`~/.claude/skills`, `~/.claude/agents` 등)가 이미 잡혀 있는 상태. dotfiles 자체 설치는 `../README.md` 참고.
- `~/.claude/agents`가 `dotfiles/claude/agents`를 가리키는 심링크여야 한다(이미 그렇다면 아래 블록 1은 그 안에 개별 파일 심링크를 놓는 것뿐).

## 1. 에이전트 4개 전역 노출

`~/.claude/agents`는 이미 `dotfiles/claude/agents`(다른 에이전트도 들어있는 실제 디렉토리)를 가리키므로, 통째로 다시 가리킬 수 없다. 그 안에 이 폴더의 파일을 가리키는 **개별 심링크**를 relative 경로로 놓는다:

```bash
cd ~/Documents/dotfiles/claude/agents
for f in harness-planner harness-dev harness-qe harness-ops; do
  ln -sfn ../../personal-harness-agent/agents/$f.md $f.md
done
```

## 2. `/harness` 커맨드 전역 노출

`~/.claude/commands`는 아직 아무것도 가리키지 않는 빈 슬롯이므로 통째로 한 번에 심링크한다:

```bash
ln -sfn ~/Documents/dotfiles/personal-harness-agent/commands ~/.claude/commands
```

## 확인

**새 Claude Code 세션**을 열고(기존 세션은 에이전트/커맨드 목록을 세션 시작 시 로드하므로 재시작 필요):

- 슬래시 커맨드 목록에 `/harness`가 보이는지
- 서브에이전트로 `harness-planner`/`harness-dev`/`harness-qe`/`harness-ops` 4개가 보이는지

dotfiles 바깥 아무 디렉토리(`~`, 다른 프로젝트 등)에서 확인해도 똑같이 보여야 한다 — cwd와 무관하게 전역이다.

## 첫 실행

```
/harness personal-harness-agent/specs/hello-world-api.md
```

toy 앱(`hello-world-api/`)이 아직 비어있으므로 이 첫 실행이 Dev가 spec대로 실제로 구현하는 과정을 그대로 보여준다. `LEARNING.md`와 `telemetry.jsonl`은 이때 자동으로 채워진다.
