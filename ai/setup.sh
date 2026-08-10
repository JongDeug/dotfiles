#!/usr/bin/env bash
# ai/setup.sh — ~/.claude 를 이 repo 에 연결한다.
#
# 몇 번 돌려도 안전하다(멱등). 스킬·에이전트를 새로 만들었으면 그냥 다시 돌리면 된다.
# 갯수를 세거나 이름을 나열하지 않는다 — 있는 것을 전부 링크한다.
#
#   ./ai/setup.sh          연결 + 결과 확인
#   ./ai/setup.sh --check  연결하지 않고 현재 상태만 점검

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE="$HOME/.claude"
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

linked=0 skipped=0 refused=0

# link <실체> <노출될 경로> — 심링크가 아닌 실물이 있으면 절대 건드리지 않는다.
link() {
  local src="$1" dst="$2"
  if [ -L "$dst" ]; then
    [ "$(readlink "$dst")" = "$src" ] && { skipped=$((skipped + 1)); return 0; }
    [ "$CHECK_ONLY" = 1 ] && { echo "  ~ $dst → 다른 곳을 가리킴"; refused=$((refused + 1)); return 0; }
    rm "$dst"
  elif [ -e "$dst" ]; then
    echo "  ! $dst 가 심링크가 아닌 실물입니다 — 건너뜁니다. 내용 확인 후 직접 치우세요." >&2
    refused=$((refused + 1))
    return 0
  elif [ "$CHECK_ONLY" = 1 ]; then
    echo "  - $dst 없음"
    refused=$((refused + 1))
    return 0
  fi
  ln -sfn "$src" "$dst"
  linked=$((linked + 1))
}

# 통심링크였던 자리를 실제 디렉토리로 바꾼다. skills 는 외부 스킬(gstack 등)이
# 자기 것을 설치하는 곳이라 repo 를 그대로 걸면 설치물이 repo 로 샌다.
# agents 는 실체가 ai/claude 와 ai/shared 두 곳에 나뉘어 살아서 한 곳을 걸 수 없다.
as_real_dir() {
  [ "$CHECK_ONLY" = 1 ] && return 0
  [ -L "$1" ] && rm "$1"
  mkdir -p "$1"
}

[ "$CHECK_ONLY" = 1 ] || mkdir -p "$CLAUDE" "$CLAUDE/channels"
as_real_dir "$CLAUDE/skills"
as_real_dir "$CLAUDE/agents"

# 통째로 걸어도 되는 것
for n in hooks settings.json statusline.sh; do
  link "$REPO/ai/claude/$n" "$CLAUDE/$n"
done
link "$REPO/ai/shared/harness/commands" "$CLAUDE/commands"
link "$REPO/ai/claude/telegram" "$CLAUDE/channels/telegram"

# 하나씩 걸어야 하는 것 — 있는 만큼 전부
for d in "$REPO"/ai/claude/skills/*/; do
  [ -d "$d" ] || continue
  link "$d" "$CLAUDE/skills/$(basename "$d")"
done
for f in "$REPO"/ai/claude/agents/*.md "$REPO"/ai/shared/harness/agents/*.md; do
  [ -f "$f" ] || continue
  link "$f" "$CLAUDE/agents/$(basename "$f")"
done

# 우리가 건 링크 중 실제로 도달하지 못하는 것
broken=0
while IFS= read -r l; do
  [ -e "$l" ] || { echo "  ✗ 깨진 링크: $l → $(readlink "$l")" >&2; broken=$((broken + 1)); }
done < <(find "$CLAUDE" -maxdepth 2 -type l 2>/dev/null | grep -Ev "$CLAUDE/(debug|plugins|projects|sessions|tasks|teams)/")

if [ "$CHECK_ONLY" = 1 ]; then
  echo "점검: 연결됨 $skipped · 미연결/불일치 $refused · 깨짐 $broken"
else
  echo "연결 $linked · 이미 맞음 $skipped${refused:+ · 건너뜀 $refused} · 깨짐 $broken"
  echo "스킬 $(find "$CLAUDE/skills" -maxdepth 1 -mindepth 1 | wc -l | tr -d ' ')개 · 에이전트 $(find "$CLAUDE/agents" -maxdepth 1 -mindepth 1 | wc -l | tr -d ' ')개 노출"
fi

[ "$broken" -eq 0 ] && [ "$refused" -eq 0 ] || exit 1
echo "완료. 새 Claude Code 세션을 열면 반영된다."
