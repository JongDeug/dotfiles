---
name: gitlab-mr
description: >
  GitLab에 develop 대상 MR을 올린다. 브랜치 생성 → 커밋 → push → glab로 MR 생성까지,
  커밋 직전과 MR 생성 직전에 각각 한 번씩 확인을 받는다.
  아래 요청이 나오면 이 스킬을 사용한다.
  - "MR 올려줘", "PR 올려줘", "머지 리퀘스트 만들어줘", "이거 올리자"
  - "feature 브랜치 따줘", "fix 브랜치 파서 작업하자"
  - "MR 본문 써줘", "MR 설명 좀 채워줘"
  브랜치 컨벤션(feature/*, fix/* ← develop)과 MR 템플릿은 이 스킬이 갖고 있다.
  예전 회사의 rc/hotfix 배포 플로우를 묻는 거면 git-flow 스킬이다.
owner: jongdeug
---

## 컨벤션

| 항목 | 규칙 |
|---|---|
| 분기 기준 | 항상 `origin/develop` (`main`/`master` 아님) |
| 브랜치 | 기능은 `feature/{kebab-case}`, 수정은 `fix/{kebab-case}` |
| MR 타겟 | `develop` |
| 제목 | Conventional Commits — `feat(scope): 제목`, `fix(scope): 제목` |
| 본문 | 같은 디렉토리의 `template.md` |

`type`은 `feat` `fix` `refactor` `perf` `test` `docs` `chore` 중 하나.
브랜치 prefix와 제목 type은 맞춘다 (`fix/` 브랜치면 제목도 `fix:`).

## 절차

### 0. 전제 확인

```bash
git remote -v                      # origin이 gitlab인지
glab auth status                   # 로그인돼 있는지
git fetch origin develop
```

`glab`이 없거나 로그인이 안 돼 있으면 거기서 멈추고 사용자에게 알린다.
직접 `glab auth login`을 돌리지 않는다.

### 1. 브랜치

현재 브랜치가 이미 `feature/*` 또는 `fix/*`면 그대로 쓴다.
아니면 `origin/develop`에서 새로 딴다:

```bash
git checkout -b feature/tlog-minio-sink origin/develop
```

이름은 작업 내용에서 뽑되 짧게(2~4단어). 이슈 키를 사용자가 주면 `feature/PROC-142-minio-sink`처럼 앞에 붙인다.

### 2. 커밋 — **여기서 한 번 멈춘다**

`git status`와 `git diff`로 실제 변경을 읽고, 커밋 메시지 초안을 만든 뒤
**스테이징할 파일 목록 + 커밋 메시지를 보여주고 승인을 받는다.**
승인 전에는 `git add`도 `git commit`도 하지 않는다.

- 관련 없는 파일이 섞여 있으면 지적한다 (`.env`, 빌드 산출물, 남은 디버그 로그)
- 성격이 다른 변경이 섞여 있으면 커밋을 나누자고 제안한다

### 3. push

```bash
git push -u origin <branch>
```

### 4. MR 본문 작성

`template.md`를 읽고 아래로 채운다. **빈 섹션을 그대로 두지 않는다.**

- **무엇을 / 왜** — 커밋 메시지를 반복하지 않는다. diff에 안 드러나는 배경과 판단 근거.
  모르면 지어내지 말고 사용자에게 묻는다.
- **변경 사항** — `git diff origin/develop...HEAD --stat`을 근거로. 파일 나열이 아니라
  "무엇이 달라졌나" 단위로.
- **확인 방법** — 리뷰어가 따라할 수 있는 명령/절차. 없으면 `N/A`.
- 안내용 HTML 주석(`<!-- ... -->`)은 최종 본문에서 지운다. 스크린샷 자리 주석만 남길 수 있다.

### 5. MR 생성 — **여기서 또 한 번 멈춘다**

**제목 / 타겟 브랜치 / Draft 여부 / 본문 전문을 보여주고 승인을 받는다.**
승인 후에만:

```bash
glab mr create \
  --target-branch develop \
  --title "feat(tlog): MinIO sink 백프레셔 추가" \
  --description "$(cat /tmp/mr-body.md)" \
  --yes
```

- 아직 리뷰받을 단계가 아니면 `--draft`를 붙인다
- 성공하면 반환된 MR URL을 사용자에게 그대로 준다

### 이미 MR이 있으면

`glab mr view --web` 또는 `glab mr list --source-branch <branch>`로 확인하고,
새로 만들지 말고 `glab mr update <id> --description "$(cat ...)"`로 본문만 갱신한다.

## 하지 않는 것

- `develop`·`main`·`master`에 직접 커밋하거나 push
- 승인 없이 커밋 / 승인 없이 MR 생성
- force push (사용자가 명시적으로 요청하면 그때만)
- MR 머지 — 머지는 사람이 한다
