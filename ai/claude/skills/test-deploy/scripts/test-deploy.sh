#!/bin/bash

# ── Usage ─────────────────────────────────────────────────────────────────
# ./test-deploy.sh <recipient> [version] [--back] [--front]
#
# Examples:
#   ./test-deploy.sh user@email.com                    # 백/프론트 모두 (기본)
#   ./test-deploy.sh user@email.com --back               # 백엔드만
#   ./test-deploy.sh user@email.com --front              # 프론트만
#   ./test-deploy.sh user@email.com --back --front       # 둘 다 (명시적)
#   ./test-deploy.sh user@email.com v1.2.0 --back        # 버전 지정

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(pwd)"

# ── 인자 파싱 ─────────────────────────────────────────────────────────────
RECIPIENT=""
VERSION=""
RUN_BACK=false
RUN_FRONT=false

for arg in "$@"; do
  case "$arg" in
    --back)  RUN_BACK=true ;;
    --front) RUN_FRONT=true ;;
    *@*)     RECIPIENT="$arg" ;;
    *)       VERSION="$arg" ;;
  esac
done

# 플래그 생략 시 백/프론트 모두 실행
if [ "$RUN_BACK" = false ] && [ "$RUN_FRONT" = false ]; then
  RUN_BACK=true
  RUN_FRONT=true
fi

if [ -z "$RECIPIENT" ]; then
  echo "Usage: $0 <recipient@email.com> [version] [--back] [--front]"
  exit 1
fi

# ── .env 확인 ─────────────────────────────────────────────────────────────
if ! grep -qE "MAIL_USER|MAIL_PASS" "$SKILL_DIR/.env" 2>/dev/null; then
  echo "❌ $SKILL_DIR/.env에 MAIL_USER, MAIL_PASS를 설정해주세요."
  exit 1
fi

# ── 버전 감지 ─────────────────────────────────────────────────────────────
if [ -z "$VERSION" ]; then
  VERSION=$(git describe --tags --abbrev=0 2>/dev/null)
fi
if [ -z "$VERSION" ]; then
  echo "❌ git 태그가 없습니다. 버전을 직접 지정해주세요."
  exit 1
fi

# ── 태그 체크아웃 ─────────────────────────────────────────────────────────
ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "📌 태그 $VERSION 체크아웃..."
if ! git checkout "$VERSION" 2>/dev/null; then
  echo "❌ 태그 '$VERSION'을 찾을 수 없습니다. git fetch --tags 후 다시 시도해주세요."
  exit 1
fi

# ── 패키지 매니저 감지 함수 ───────────────────────────────────────────────
detect_pm() {
  if [ -f "pnpm-lock.yaml" ]; then echo "pnpm"
  elif [ -f "yarn.lock" ]; then echo "yarn"
  else echo "npm"; fi
}

# ── package.json version 읽기 함수 ───────────────────────────────────────
read_pkg_version() {
  node -e "console.log(require('./package.json').version || 'unknown')" 2>/dev/null || echo "unknown"
}

# ── 백엔드 테스트 ─────────────────────────────────────────────────────────
BACK_TMPFILE=""
BACK_VERSION=""
if [ "$RUN_BACK" = true ]; then
  echo ""
  echo "🔧 Backend 테스트 실행 중..."
  BACK_VERSION=$(read_pkg_version)
  PM=$(detect_pm)
  BACK_TMPFILE=$(node -e "const os=require('os'),path=require('path'),p=require('./package.json');console.log(path.join(os.tmpdir(),'coverage-back-'+(p.name||'project')+'.txt'))")
  $PM run test:cov 2>&1 | tee "$BACK_TMPFILE" || npx jest --coverage 2>&1 | tee "$BACK_TMPFILE" || true
fi

# ── 프론트엔드 테스트 ─────────────────────────────────────────────────────
FRONT_TMPFILE=""
FRONT_VERSION=""
if [ "$RUN_FRONT" = true ]; then
  echo ""
  echo "🎨 Frontend 디렉토리 감지 중..."
  FRONT_DIR=""
  for dir in *-front frontend client web app; do
    if [ -d "$dir" ] && [ -f "$dir/package.json" ]; then
      FRONT_DIR="$dir"
      break
    fi
  done

  # submodule인 경우 초기화
  if [ -z "$FRONT_DIR" ]; then
    for dir in *-front frontend client web app; do
      if [ -d "$dir" ] && git submodule status "$dir" &>/dev/null; then
        echo "   → submodule '$dir' 초기화 중..."
        git submodule update --init "$dir"
        if [ -f "$dir/package.json" ]; then
          FRONT_DIR="$dir"
          break
        fi
      fi
    done
  fi

  if [ -z "$FRONT_DIR" ]; then
    for dir in */; do
      if [ -f "${dir}package.json" ] && grep -qE '"react"|"vue"|"vite"|"next"|"nuxt"' "${dir}package.json" 2>/dev/null; then
        FRONT_DIR="${dir%/}"
        break
      fi
    done
  fi

  if [ -z "$FRONT_DIR" ]; then
    echo "❌ 프론트엔드 디렉토리를 찾을 수 없습니다."
    git checkout "$ORIGINAL_BRANCH"
    exit 1
  fi

  echo "   → $FRONT_DIR 감지됨"
  echo "🎨 Frontend 테스트 실행 중..."
  cd "$PROJECT_ROOT/$FRONT_DIR"
  FRONT_VERSION=$(read_pkg_version)
  PM=$(detect_pm)
  if [ ! -d "node_modules" ]; then
    $PM install
  fi
  FRONT_TMPFILE=$(node -e "const os=require('os'),path=require('path'),p=require('./package.json');console.log(path.join(os.tmpdir(),'coverage-front-'+(p.name||'project')+'.txt'))")

  if grep -q '"test:coverage"' package.json 2>/dev/null; then
    $PM run test:coverage 2>&1 | tee "$FRONT_TMPFILE" || true
  elif grep -q '"test:cov"' package.json 2>/dev/null; then
    $PM run test:cov 2>&1 | tee "$FRONT_TMPFILE" || true
  else
    npx vitest run --coverage 2>&1 | tee "$FRONT_TMPFILE" || npx jest --coverage 2>&1 | tee "$FRONT_TMPFILE" || true
  fi
  cd "$PROJECT_ROOT"
fi

# ── 원래 브랜치 복귀 ─────────────────────────────────────────────────────
echo ""
echo "🔄 원래 브랜치($ORIGINAL_BRANCH)로 복귀..."
git checkout "$ORIGINAL_BRANCH"

# ── 이메일 발송 ──────────────────────────────────────────────────────────
PROJECT_NAME=$(node -e "const p=require('./package.json');console.log(p.name||'project')" 2>/dev/null || basename "$PROJECT_ROOT")

MAIL_CMD="node \"$SKILL_DIR/scripts/send-coverage-mail.mjs\" --to \"$RECIPIENT\" --project \"$PROJECT_NAME\" --version \"$VERSION\""
[ -n "$BACK_TMPFILE" ] && MAIL_CMD="$MAIL_CMD --back \"$BACK_TMPFILE\" --back-version \"$BACK_VERSION\""
[ -n "$FRONT_TMPFILE" ] && MAIL_CMD="$MAIL_CMD --front \"$FRONT_TMPFILE\" --front-version \"$FRONT_VERSION\""

echo "📧 이메일 발송 중..."
eval $MAIL_CMD
