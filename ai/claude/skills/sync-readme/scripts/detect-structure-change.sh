#!/usr/bin/env bash
# detect-structure-change.sh
# PostToolUse 훅에서 호출. 파일 생성/삭제/이동이 감지되면
# Claude에게 README.md 구조 섹션 업데이트를 지시한다.

set -euo pipefail

# stdin으로 훅 컨텍스트(JSON) 수신
INPUT=$(cat)

# 도구 이름 추출 (jq 없이 순수 bash)
TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name"\s*:\s*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')  || true

# Write, Edit, Bash 도구만 처리
case "$TOOL_NAME" in
  Write|Edit|Bash) ;;
  *) exit 0 ;;
esac

# 프로젝트 루트의 README.md 확인
README="$(git rev-parse --show-toplevel 2>/dev/null || true)/README.md"
[ -f "$README" ] || exit 0

# README에 구조 섹션이 있는지 확인 (## 구조, ## Structure, ## Project Structure 등)
if ! grep -qiE '^#{1,3}\s*(구조|structure|project\s+structure|디렉토리|directory)' "$README"; then
  exit 0
fi

# git status로 구조 변경 감지 (새 파일, 삭제된 파일, 이름 변경)
STRUCT_CHANGES=$(git status --porcelain 2>/dev/null | grep -E '^\?\?|^A |^D |^R |^ D|^AD' | head -20) || true

if [ -z "$STRUCT_CHANGES" ]; then
  exit 0
fi

# Claude에게 업데이트 지시 출력
cat <<'MSG'
[sync-readme] 파일 생성/삭제가 감지되었습니다. README.md의 구조 섹션이 현재 디렉토리 구조와 일치하지 않을 수 있습니다.
현재 작업이 모두 완료된 후, README.md의 구조 섹션을 실제 디렉토리 구조에 맞게 업데이트하세요.
MSG
