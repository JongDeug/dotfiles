---
name: test-deploy
description: >
  JS/TS 프로젝트(Jest, Vitest)의 테스트 커버리지를 실행하고 결과를 HTML 이메일로 발송하는 스킬.
  /test-deploy 명령어 또는 "테스트 결과 메일로 보내줘", "coverage 이메일 발송",
  "test:cov 결과 공유" 등의 요청 시 반드시 이 스킬을 사용한다.
  pnpm, npm, yarn 등 패키지 매니저를 자동 감지하며, Jest/Vitest 출력을 파싱한다.
  수신자 이메일을 인자로 받아 Gmail SMTP로 발송하며, 어떤 JS/TS 프로젝트에서도 동작한다.
owner: jongdeug
---

## 사용법

```
/test-deploy {recipient@email.com} [version] [--back] [--front]
```

- `version`: 배포 버전 또는 태그 (예: `v1.2.0`, `rc-3`). 생략 시 최신 git 태그를 자동으로 사용한다.
- `--back`: 백엔드(프로젝트 루트) 테스트만 실행
- `--front`: 프론트엔드(하위 프론트 디렉토리) 테스트만 실행
- `--back --front`: 둘 다 실행하여 하나의 이메일로 발송
- **플래그 생략 시**: `--back --front`와 동일 (백/프론트 모두 실행)

## 사전 요건

SMTP 인증 정보는 **스킬 디렉토리**의 `.env`에 저장한다 (프로젝트 루트가 아님):

```
/home/jongdeug/.claude/skills/test-deploy/.env
```

```bash
MAIL_USER=본인Gmail@gmail.com
MAIL_PASS=앱비밀번호16자리  # Google 계정 → 보안 → 앱 비밀번호
```

> `send-coverage-mail.mjs`가 `dotenv.config({ path: resolve(skillDir, '.env') })`로 스킬 디렉토리의 `.env`를 명시적으로 로드한다. 프로젝트마다 설정할 필요 없이 한 번만 세팅하면 어느 프로젝트에서도 동작한다.

**Gmail 앱 비밀번호 발급**: myaccount.google.com → 보안 → 2단계 인증 → 앱 비밀번호

## 실행 절차

### 1. 사전 확인

```bash
# 스킬 디렉토리의 .env에 MAIL_USER, MAIL_PASS 존재 여부 확인
grep -E "MAIL_USER|MAIL_PASS" /home/jongdeug/.claude/skills/test-deploy/.env 2>/dev/null
```

키가 없으면 스킬 디렉토리의 `.env` 파일에 추가하도록 안내 후 중단한다.

### 2. 태그 체크아웃

```bash
VERSION={version}  # 인자가 없으면 아래 fallback
if [ -z "$VERSION" ]; then
  VERSION=$(git describe --tags --abbrev=0 2>/dev/null)
fi

if [ -z "$VERSION" ]; then
  echo "❌ git 태그가 존재하지 않습니다. 버전을 직접 지정해주세요: /test-deploy email version"
  # 중단
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git checkout "$VERSION"
```

태그가 존재하지 않으면 안내 후 중단한다.

### 3. 프론트엔드 디렉토리 감지 (`--front` 플래그 사용 시)

프론트엔드 하위 디렉토리를 자동 감지한다. 아래 순서로 탐색:

1. `*-front`, `frontend`, `client`, `web`, `app` 이름의 하위 디렉토리 중 `package.json`이 있는 것
2. 위에서 못 찾으면 하위 디렉토리의 `package.json`에서 `react`, `vue`, `vite`, `next`, `nuxt` 의존성이 있는 디렉토리

감지 실패 시 사용자에게 프론트엔드 디렉토리 경로를 물어본다.

### 4. 패키지 매니저 감지 (디렉토리별)

`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, 그 외 → npm

### 5. 테스트 실행 및 coverage 캡처

**`--back` 실행 시** (프로젝트 루트):

```bash
# 백엔드 package.json에서 버전 읽기
BACK_VERSION=$(node -e "console.log(require('./package.json').version || 'unknown')")

BACK_TMPFILE=$(node -e "const os=require('os'),path=require('path'),p=require('./package.json');console.log(path.join(os.tmpdir(),'coverage-back-'+(p.name||'project')+'.txt'))")
$PM run test:cov 2>&1 | tee "$BACK_TMPFILE" || npx jest --coverage 2>&1 | tee "$BACK_TMPFILE"
```

**`--front` 실행 시** (프론트엔드 디렉토리):

```bash
cd "$FRONT_DIR"

# 프론트엔드 package.json에서 버전 읽기
FRONT_VERSION=$(node -e "console.log(require('./package.json').version || 'unknown')")

# 의존성 설치 (node_modules 없을 경우)
if [ ! -d "node_modules" ]; then
  $PM install
fi

FRONT_TMPFILE=$(node -e "const os=require('os'),path=require('path'),p=require('./package.json');console.log(path.join(os.tmpdir(),'coverage-front-'+(p.name||'project')+'.txt'))")

# test:coverage → test:cov → npx vitest → npx jest 순으로 fallback
if grep -q '"test:coverage"' package.json; then $PM run test:coverage 2>&1 | tee "$FRONT_TMPFILE"
elif grep -q '"test:cov"' package.json; then $PM run test:cov 2>&1 | tee "$FRONT_TMPFILE"
else npx vitest run --coverage 2>&1 | tee "$FRONT_TMPFILE" || npx jest --coverage 2>&1 | tee "$FRONT_TMPFILE"; fi

cd ..  # 프로젝트 루트로 복귀
```

테스트가 실패해도 계속 진행한다 (coverage 결과는 생성됨).

### 6. 원래 브랜치 복귀

```bash
git checkout "$ORIGINAL_BRANCH"
```

테스트 실행 후 반드시 원래 브랜치로 돌아온다.

### 7. 이메일 발송

스킬 디렉토리의 헬퍼 스크립트를 사용한다. `SKILL_DIR`은 이 SKILL.md가 위치한 디렉토리이다.

```bash
PROJECT_NAME=$(node -e "const p=require('./package.json');console.log(p.name||'project')" 2>/dev/null || basename $(pwd))

# --back만
node {SKILL_DIR}/scripts/send-coverage-mail.mjs \
  --to {recipient} --project "$PROJECT_NAME" --version "$VERSION" \
  --back "$BACK_TMPFILE" --back-version "$BACK_VERSION"

# --front만
node {SKILL_DIR}/scripts/send-coverage-mail.mjs \
  --to {recipient} --project "$PROJECT_NAME" --version "$VERSION" \
  --front "$FRONT_TMPFILE" --front-version "$FRONT_VERSION"

# --back --front (둘 다)
node {SKILL_DIR}/scripts/send-coverage-mail.mjs \
  --to {recipient} --project "$PROJECT_NAME" --version "$VERSION" \
  --back "$BACK_TMPFILE" --back-version "$BACK_VERSION" \
  --front "$FRONT_TMPFILE" --front-version "$FRONT_VERSION"
```

`{SKILL_DIR}`은 이 파일의 실제 절대 경로로 대체한다:
`/home/jongdeug/.claude/skills/test-deploy`

### 8. 완료 메시지 출력

발송 성공 시:
```
✅ Coverage 리포트 발송 완료 → recipient@email.com (태그: {version})
```

## 오류 처리

| 상황 | 대응 |
|------|------|
| MAIL_USER/MAIL_PASS 없음 | 설정 방법 안내 후 중단 |
| 태그가 존재하지 않음 | 버전 직접 지정 안내 후 중단 |
| 태그 체크아웃 실패 | 오류 안내 후 중단 (원래 브랜치 유지) |
| 프론트엔드 디렉토리 감지 실패 | 사용자에게 경로 확인 후 재시도 |
| 테스트 실패 | 실패 사실 알리고 coverage는 계속 발송, 이후 원래 브랜치 복귀 |
| SMTP 인증 실패 | 앱 비밀번호 확인 안내 |
| coverage 파싱 실패 | 테스트 출력 형식 확인 안내 |

## 메일 내용

- **제목**: `[{project-name}] {version} · ✅ Passed · 10/10 tests · {날짜}`
- **헤더**: 프로젝트명 + git 태그(전체 버전)
- **본문**:
  - 합산 Summary 카드 (Tests Passed, Test Suites, Duration)
  - 각 섹션(Backend/Frontend): 개별 package.json 버전 + 테스트 결과 + Coverage(Stmts/Branch/Funcs/Lines)
- **색상**: 녹색(>=80%), 노란색(60-79%), 빨간색(<60%)
