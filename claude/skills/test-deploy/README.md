# test-deploy

테스트 커버리지를 실행하고 결과를 HTML 이메일로 발송하는 도구입니다.

---

## 실행 방법

### A. Claude Code 스킬

```
/test-deploy 수신자@email.com v1.0.0 --back --front
```

| 플래그 | 설명 |
|--------|------|
| `--back` | 백엔드(프로젝트 루트) 테스트만 실행 |
| `--front` | 프론트엔드(하위 디렉토리) 테스트만 실행 |
| `--back --front` | 둘 다 실행, 하나의 이메일로 발송 |
| (생략) | `--back --front`와 동일 (백/프론트 모두 실행) |

`version` 생략 시 최신 git 태그를 자동으로 사용합니다.

### B. 쉘에서 직접 실행

아래 순서를 따라주세요.

---

## 설치 (최초 1회)

### 1. 레포 클론

```bash
git clone https://github.com/JongDeug/dotfiles.git
```

> 이미 클론되어 있다면 생략합니다.

### 2. 의존성 설치

```bash
cd dotfiles/claude/skills/test-deploy
npm install
```

### 3. Gmail 앱 비밀번호 발급

1. [myaccount.google.com](https://myaccount.google.com) → **보안** → **2단계 인증** → **앱 비밀번호**
2. 앱 이름 입력 (예: `test-deploy`) → **만들기**
3. 생성된 16자리 비밀번호 복사

> 2단계 인증이 켜져 있어야 앱 비밀번호 메뉴가 표시됩니다.

### 4. `.env` 설정

**test-deploy 디렉토리** 안에 `.env` 파일을 생성합니다:

```bash
# dotfiles/claude/skills/test-deploy/.env
MAIL_USER=본인Gmail@gmail.com
MAIL_PASS=앱비밀번호16자리
```

---

## 쉘 실행

테스트할 **프로젝트 루트 디렉토리**에서 스크립트를 실행합니다.

```bash
# 둘 다 (기본 — 플래그 생략 시)
~/.claude/skills/test-deploy/scripts/test-deploy.sh user@email.com

# 백엔드만
~/.claude/skills/test-deploy/scripts/test-deploy.sh user@email.com --back

# 프론트만
~/.claude/skills/test-deploy/scripts/test-deploy.sh user@email.com --front

# 둘 다 (명시적)
~/.claude/skills/test-deploy/scripts/test-deploy.sh user@email.com --back --front

# 버전 직접 지정
~/.claude/skills/test-deploy/scripts/test-deploy.sh user@email.com v1.2.0 --back --front
```

> 인자 순서는 자유입니다. 플래그 생략 시 `--back --front`가 기본값입니다 (백/프론트 모두 실행).

---

## 메일 예시

| 항목 | 내용 |
|------|------|
| 제목 | `[project-name] v1.0.0 · ✅ Passed · 10/10 tests · 2026. 3. 24.` |
| 발신자 | `project-name CI <MAIL_USER>` |
| 본문 (단일) | 합산 Summary 카드 + Coverage 요약 (Stmts/Branch/Funcs/Lines) |
| 본문 (--back --front) | 합산 Summary 카드 + Backend 섹션(개별 버전+Coverage) + Frontend 섹션(개별 버전+Coverage) |

색상 기준: 🟢 >= 80% / 🟡 60-79% / 🔴 < 60%

---

## 주의사항

- 앱 비밀번호는 `.env`에만 저장하고 Git에 커밋하지 마세요
- 백엔드: `test:cov` 스크립트가 없으면 `npx jest --coverage`로 fallback
- 프론트엔드: `test:coverage` → `test:cov` → `npx vitest run --coverage` 순으로 fallback
