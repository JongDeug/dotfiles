#!/usr/bin/env bash
# ai/setup.sh — ~/.claude 를 이 repo 에 연결한다.
#
# 이름을 나열하지 않는다. 규칙만 안다:
#
#   ai/**/skills/<name>/     →  ~/.claude/skills/<name>      (개별)
#   ai/**/agents/<name>.md   →  ~/.claude/agents/<name>.md   (개별)
#   ai/**/commands/<name>.md →  ~/.claude/commands/<name>.md (개별)
#   ai/claude/telegram       →  ~/.claude/channels/telegram  (이름만 다름)
#   ai/claude/<그 외>         →  ~/.claude/<같은 이름>          (통째로)
#
# 그래서 스킬·에이전트·커맨드를 추가하든, ai/claude 에 mcp.json 같은 걸 새로 넣든
# 이 파일도 문서도 고칠 필요가 없다. 그냥 다시 돌리면 된다.
#
#   ./ai/setup.sh          연결 + 결과 요약
#   ./ai/setup.sh --check  연결하지 않고 현재 상태만 점검

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AI="$REPO/ai"
CLAUDE="$HOME/.claude"
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

linked=0 skipped=0 refused=0

# link <실체> <노출될 경로> — 심링크가 아닌 실물은 절대 건드리지 않는다.
link() {
  local src="$1" dst="$2"
  if [ -L "$dst" ]; then
    [ "$(readlink "$dst")" = "$src" ] && { skipped=$((skipped + 1)); return 0; }
    [ "$CHECK_ONLY" = 1 ] && { echo "  ~ ${dst#"$HOME"/} → 다른 곳을 가리킴"; refused=$((refused + 1)); return 0; }
    rm "$dst"
  elif [ -e "$dst" ]; then
    echo "  ! ${dst#"$HOME"/} 가 심링크가 아닌 실물입니다 — 건너뜁니다. 확인 후 직접 치우세요." >&2
    refused=$((refused + 1)); return 0
  elif [ "$CHECK_ONLY" = 1 ]; then
    echo "  - ${dst#"$HOME"/} 없음"; refused=$((refused + 1)); return 0
  fi
  ln -sfn "$src" "$dst"
  linked=$((linked + 1))
}

# 여러 출처가 한 곳으로 모이는 자리는 실제 디렉토리여야 한다.
# skills 는 외부 스킬(gstack 등)이 자기 것을 설치하는 곳이기도 해서, repo 를
# 통째로 걸면 설치물이 repo 로 샌다.
as_real_dir() {
  [ "$CHECK_ONLY" = 1 ] && return 0
  [ -L "$1" ] && rm "$1"
  mkdir -p "$1"
}

[ "$CHECK_ONLY" = 1 ] || mkdir -p "$CLAUDE" "$CLAUDE/channels"
for bucket in skills agents commands; do as_real_dir "$CLAUDE/$bucket"; done

# ── 규칙 1: ai/ 아래 어디에 있든 skills/·agents/·commands/ 의 내용물을 모은다.
#
# 단, 스킬 디렉토리 안으로는 내려가지 않는다. 스킬이 자기 자산으로 agents/ 나
# commands/ 를 갖는 경우가 있고(upbit-openapi-skill/agents/openai.yaml),
# 그건 그 스킬의 사정이지 Claude 에게 노출할 에이전트가 아니다.
skill_roots() { find "$AI" -type d -name skills -prune -print 2>/dev/null; }
bucket_roots() { find "$AI" -type d -name skills -prune -o -type d -name "$1" -print 2>/dev/null; }

collect() {  # collect <버킷> <d|f> <이름패턴>
  local bucket="$1" kind="$2" pat="$3" root src
  while IFS= read -r root; do
    [ -d "$root" ] || continue
    while IFS= read -r src; do
      [ -e "$src" ] || continue
      link "$src" "$CLAUDE/$bucket/$(basename "$src")"
    done < <(find "$root" -mindepth 1 -maxdepth 1 -type "$kind" -name "$pat" 2>/dev/null | sort)
  done < <(if [ "$bucket" = skills ]; then skill_roots; else bucket_roots "$bucket"; fi)
}
collect skills   d '*'
collect agents   f '*.md'
collect commands f '*.md'

# ── 규칙 2: ai/claude 의 나머지는 이름 그대로 ~/.claude 로
for p in "$AI"/claude/*; do
  [ -e "$p" ] || continue
  case "$(basename "$p")" in
    skills|agents|commands) ;;                                  # 규칙 1이 처리함
    telegram) link "$p" "$CLAUDE/channels/telegram" ;;          # 이름만 다른 유일한 예외
    *) link "$p" "$CLAUDE/$(basename "$p")" ;;
  esac
done

# ── repo 에서 사라진 것의 노출도 걷어낸다. 스킬을 지웠으면 ~/.claude 에서도
# 사라져야 한다. 우리가 건 링크(= repo 를 가리키는 것)만 손대므로 gstack 처럼
# 밖에서 설치된 것은 건드리지 않는다.
pruned=0
for bucket in skills agents commands; do
  for l in "$CLAUDE/$bucket"/*; do
    [ -L "$l" ] || continue
    case "$(readlink "$l")" in "$REPO"/*) ;; *) continue ;; esac
    [ -e "$l" ] && continue
    if [ "$CHECK_ONLY" = 1 ]; then
      echo "  - ${l#"$HOME"/} 실체가 repo 에서 사라짐"; refused=$((refused + 1))
    else
      rm "$l"; pruned=$((pruned + 1))
    fi
  done
done

# 도달하지 못하는 링크가 남았는지
broken=0
while IFS= read -r l; do
  [ -e "$l" ] || { echo "  ✗ 깨진 링크: ${l#"$HOME"/} → $(readlink "$l")" >&2; broken=$((broken + 1)); }
done < <(find "$CLAUDE" -maxdepth 2 -type l 2>/dev/null | grep -Ev "$CLAUDE/(debug|plugins|projects|sessions|tasks|teams)/" || true)

count() { find "$CLAUDE/$1" -maxdepth 1 -mindepth 1 2>/dev/null | wc -l | tr -d ' '; }
if [ "$CHECK_ONLY" = 1 ]; then
  echo "점검: 연결됨 $skipped · 미연결/불일치 $refused · 깨짐 $broken"
else
  echo "연결 $linked · 이미 맞음 $skipped · 정리 $pruned · 건너뜀 $refused · 깨짐 $broken"
  echo "노출: 스킬 $(count skills) · 에이전트 $(count agents) · 커맨드 $(count commands)"
fi

[ "$broken" -eq 0 ] && [ "$refused" -eq 0 ] || exit 1
echo "완료. 새 Claude Code 세션을 열면 반영된다."
