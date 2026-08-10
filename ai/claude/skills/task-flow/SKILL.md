---
name: task-flow
description: >
  Jira 티켓 생성부터 PR 생성까지 이어지는 개발 플로우 자동화 스킬.
  아래 커맨드 중 하나가 언급되거나 "새 티켓 만들고 작업 시작", "작업 플로우로 시작", "티켓부터 PR까지" 같은 요청 시 반드시 이 스킬을 사용한다.
  - /task {project-key} {summary} — 지정 프로젝트에 Jira 티켓 생성 → feature 브랜치 생성 → 작업 진행 → 커밋 전 검수 → PR 생성까지의 통합 플로우 시작
  - /task {summary} — project-key는 git config task.jiraProjectKey에서 읽음 (없으면 한 번 물어보고 저장)
  - /finish-task — 현재 feat/{issue-key} 브랜치에서 커밋 + /finish-feat 체이닝 (기 커밋된 상태라면 push + PR만)
owner: jongdeug
---

## 개요

흔한 개발 플로우:

```
Jira 티켓 생성
   ↓
git-flow /feat {issue-key}  (feature 브랜치 생성)
   ↓
코드 수정 + 테스트
   ↓
커밋 전 사용자 검수  ★ 이 단계가 중요
   ↓
승인 시 커밋
   ↓
git-flow /finish-feat {issue-key}  (push + develop 대상 PR)
```

이 스킬은 시작점(`/task`)과 마무리(`/finish-task`) 두 개 명령으로 플로우 전체를 감싸고, Claude가 자연스럽게 따라갈 수 있게 단계별 체크포인트를 제공한다.

## 전제

- 이 저장소가 git 저장소이고, `main`/`develop` 브랜치가 존재한다 (git-flow 스킬과 동일 전제)
- Jira MCP(`mcp__jira__*`)가 활성화되어 있어야 티켓 생성이 가능하다
- `git-flow` 스킬이 설치되어 있어야 `/feat`, `/finish-feat`을 체이닝할 수 있다

## 명령

### `/task [project-key] <summary>`

플로우 시작. Jira 티켓을 만들고 feature 브랜치로 분기한 뒤 작업에 진입한다.

**절차**:

1. **프로젝트 키 결정**:
   - 인자로 project-key가 주어지면 그대로 사용 (예: `CN`, `MC`, `PROJ`)
   - 안 주어졌으면:
     ```bash
     git config --get task.jiraProjectKey
     ```
     → 값 있으면 그걸 사용
     → 값 없으면 사용자에게 한 번 물어본 뒤
     ```bash
     git config task.jiraProjectKey <key>
     ```
     로 리포 로컬에 영구 저장
2. **Jira 티켓 생성** (`mcp__jira__jira_create_issue`):
   - `project_key`: 위에서 결정한 값
   - `summary`: 사용자가 제공한 요약 그대로
   - `issue_type`: `Task` (기본값. 사용자가 "버그" 맥락으로 말하면 `Bug`)
   - `assignee`: 현재 사용자 이메일 (`mcp__jira__jira_get_user_profile`로 조회 가능하거나 세션에 알려진 값)
   - `description`: **현재 대화 컨텍스트를 바탕으로 Claude가 자동 작성**한다. 포함 요소:
     - 배경/문제 상황
     - 목표
     - 작업 범위 (체크리스트)
     - 참고사항/운영 준비사항이 있으면 추가
   - description은 반드시 사용자에게 초안 보여준 뒤 수정/승인받아 생성한다
3. 생성된 이슈 키(예: `CN-25`) 확인 후 Jira URL과 함께 사용자에게 출력
4. **git-flow `/feat {issue-key}` 실행**:
   - git-flow 스킬의 `/feat` 절차를 그대로 수행
   - `fetch → checkout develop → pull → checkout -b feat/{issue-key}`
5. 작업 시작 안내:
   ```
   ✅ 티켓 {key} 생성 및 feat/{key} 브랜치 진입 완료
   이제 작업을 진행하세요. 완료되면 /finish-task 명령으로 커밋 검수 및 PR 생성을 시작합니다.
   ```
6. **TaskCreate로 내부 플로우 추적 작업 등록** (권장):
   - 티켓 생성 ✅
   - 브랜치 생성 ✅
   - 구현
   - 테스트
   - 커밋 전 검수
   - 커밋 + PR 생성

**예시**:

```
/task CN TOTP secret 암호화 저장
```

→ Jira CN 프로젝트에 티켓 생성 → `feat/CN-25` 브랜치 체크아웃 → 작업 시작

---

### `/finish-task`

플로우 마무리. 커밋 전 검수 단계를 거친 뒤 `/finish-feat {issue-key}`로 PR을 생성한다.

**절차**:

1. **현재 브랜치 확인**:
   ```bash
   git branch --show-current
   ```
   `feat/`로 시작하지 않으면 에러 후 중단. 이슈 키는 브랜치명에서 추출 (`feat/CN-25` → `CN-25`)
2. **변경사항 확인**:
   ```bash
   git status
   git diff --stat
   ```
   스테이징/언스테이징 모두 포함한 변경 내역 수집
3. **검수 단계 (필수)**:
   - 변경 파일 목록을 표 형태로 요약
   - 주요 변경사항을 파일별 한 줄 요약
   - 필요 시 핵심 파일의 `git diff` 주요부 출력
   - 테스트가 있는 프로젝트라면 `pnpm exec jest` 또는 해당 테스트 명령을 먼저 실행해 전원 통과 확인
   - 사용자에게 **명시적 승인 요청**: "이대로 커밋 후 PR 생성할까요?"
   - **사용자 승인 전까지 git add/commit 절대 금지**
4. **커밋** (승인 후):
   - 파일 별명이 아닌 **명시적 파일 경로**로 `git add` (사용자 선호: `git add -A`/`git add .` 지양)
   - 서브모듈 변경 등 의도하지 않은 파일은 스테이징에서 제외
   - 커밋 메시지 포맷: `[feat]: {요약} ({issue-key})`
     - 버그 수정이면 `[fix]:`, 리팩터면 `[refactor]:`, 기타는 `[chore]:`
   - 본문에 주요 변경사항 불릿 포함
   - HEREDOC로 `git commit -m "$(cat <<'EOF' ... EOF)"` 형식 사용
5. **git-flow `/finish-feat {issue-key}` 실행**:
   - push → develop 대상 PR 생성
   - `.github/PULL_REQUEST_TEMPLATE.md`가 있으면 그 형식을 따르고, 없으면 커밋 내역 기반 자유 양식
6. 생성된 PR URL을 사용자에게 출력

**중요 — 커밋 전 검수는 스킵 불가**:

사용자의 기존 피드백: "장기 작업은 중간 검토 없이 쭉 진행"이어도, **커밋만큼은 반드시 검수 받는다**. 코드 생성 → 테스트 통과까지는 멈추지 말고 진행하되, 커밋 시점에는 diff를 요약해 보여주고 승인을 기다릴 것.

---

## 동작 규칙 (Claude용)

이 스킬이 활성화되어 있는 동안 Claude는 다음을 지킨다:

1. **TaskCreate로 플로우 단계를 추적**한다. 각 단계를 `in_progress` → `completed`로 전환
2. **Jira description 작성 시 대화 컨텍스트 활용**:
   - 사용자와의 직전 토론 내용, 참고한 외부 서비스 코드, 결정된 마이그레이션 방침 등을 description에 자연스럽게 반영
   - 초안을 먼저 보여주고 승인받아 생성
3. **커밋 직전 반드시 멈춤**:
   - `git add` 전에 `git status` + `git diff --stat` 출력
   - 변경 내역 요약 + 승인 요청
   - 사용자가 "커밋해줘", "진행", "ok" 등 명시적 GO 신호를 준 이후에만 커밋
4. **서브모듈/무관 파일 스테이징 금지**:
   - 예: contact-center의 `contact-center-front` 서브모듈 변경은 이번 작업과 무관하면 제외
   - `git add <특정파일>` 식으로 명시적으로 추가
5. **테스트 우선**:
   - 커밋 전에 테스트가 통과하는지 `pnpm test` 등으로 확인
   - 실패하면 커밋 중단하고 사용자에게 보고
6. **Jira 프로젝트 키 관례**:
   - 프로젝트마다 키가 다르다 (contact-center=`CN`, MEDI-C=`MC` 등)
   - 한 번 `git config task.jiraProjectKey`에 저장하면 같은 리포에서 재사용

---

## 일반 플로우 예시

```
사용자: /task CN TOTP secret 암호화 저장
  ↓
Claude:
  1. Jira CN 프로젝트에 티켓 초안 생성 (description은 대화 컨텍스트 기반)
  2. 사용자 승인 후 티켓 생성 → CN-25 발급
  3. /feat CN-25 체이닝 → feat/CN-25 브랜치 진입
  4. TaskCreate로 플로우 추적 작업 등록
  5. "작업을 시작하세요" 안내
  ↓
사용자: (요청들)
Claude: (코드 수정, 테스트 실행 등)
  ↓
사용자: /finish-task
  ↓
Claude:
  1. 현재 브랜치 feat/CN-25 확인
  2. git status + diff --stat 출력
  3. 파일별 변경 요약, 테스트 결과 확인
  4. "이대로 커밋할까요?" 검수 요청
  ↓
사용자: ok
  ↓
Claude:
  1. 명시적 파일만 git add
  2. 관례에 맞는 커밋 메시지로 commit (HEREDOC)
  3. /finish-feat CN-25 체이닝 → push + PR 생성
  4. PR URL 출력
```

---

## 주의사항

- **이 스킬 자체가 Jira/GitHub에 자동으로 쓰지 않는다**: 티켓 description, 커밋 메시지, PR 본문은 반드시 사용자 승인 후에만 생성/게시
- **`/finish-task`는 되돌리기 어려움**: 커밋 → push는 이후 취소가 번거롭다. 검수 단계를 가볍게 여기지 말 것
- **`/task` 실행 중 에러**: Jira 티켓 생성 실패 시 브랜치 생성도 중단. 일관성을 위해 절대 반쪽짜리 상태로 두지 않음
- **이미 진행 중인 feat 브랜치가 있을 때 `/task` 호출**: 기존 브랜치에 커밋 안 된 변경이 있으면 경고 후 사용자 선택 대기. 임의로 checkout/stash 하지 않음
