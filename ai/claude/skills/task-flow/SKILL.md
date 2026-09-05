---
name: task-flow
description: >
  작업 하나를 노션 확인 → 브랜치/커밋 → MR → 노션 기록까지 한 줄로 흘린다.
  노션 「작업 관리」 DB 에 그 작업이 있는지 먼저 보고, 없으면 만들고, MR 을 올린 뒤 링크를 그 작업에 남긴다.
  아래 요청이 나오면 이 스킬을 사용한다.
  - "MR 올려줘", "PR 올려줘", "머지 리퀘스트 만들어줘", "이거 올리자"
  - "feature 브랜치 따줘", "fix 브랜치 파서 작업하자"
  - "MR 본문 써줘", "MR 설명 좀 채워줘"
  - "이 작업 노션에 있어?", "노션에 작업 만들어줘", "작업 시작하자", "노션에 MR 링크 달아줘"
  브랜치 컨벤션(feature/*, fix/* ← develop)·MR 템플릿·노션 DB 좌표는 이 스킬이 갖고 있다.
  예전 회사의 rc/hotfix 배포 플로우를 묻는 거면 git-flow 스킬이다.
owner: jongdeug
---

## 좌표

| 항목 | 값 |
|---|---|
| 노션 DB | 업무 관리 / 작업 관리 — `collection://f3d9059c-1010-46c8-a8ce-5f7656ab3ecc` |
| 내 노션 user id | `3cdd872b-594c-81fe-b8f8-00022b0f4102` |
| 분기 기준 | 항상 `origin/develop` (`main`/`master` 아님) |
| 브랜치 | 기능은 `feature/{kebab-case}`, 수정은 `fix/{kebab-case}` |
| MR 타겟 | `develop` |
| 제목 | Conventional Commits — `feat(scope): 제목`, `fix(scope): 제목` |
| 본문 | 같은 디렉토리의 `template.md` |

`type`은 `feat` `fix` `refactor` `perf` `test` `docs` `chore` 중 하나.
브랜치 prefix와 제목 type은 맞춘다 (`fix/` 브랜치면 제목도 `fix:`).

레포가 여러 개로 갈리는 작업(예: `processor/mavlink` + `processor/dji`)은
**브랜치명을 똑같이 쓰고 MR 끼리 서로를 「짝 MR」로 링크한다.** 노션 작업은 하나만 만든다.

## 절차

### 0. 노션에 작업이 있는지 먼저 본다

```
mcp__notion__notion-query-data-sources  mode: sql
  SELECT "작업 이름", "상태", "유형", url
  FROM "collection://f3d9059c-1010-46c8-a8ce-5f7656ab3ecc"
  ORDER BY createdTime DESC LIMIT 30
```

제목이 안 겹쳐도 같은 일일 수 있다. 최근 30건을 훑어서 **내용으로** 판단한다.

- **있으면** — url 을 들고 간다. `상태`가 `시작 전`이면 `진행 중`으로 올린다.
- **없으면** — 아래로 만든다. **만들기 전에 사용자에게 한 줄로 확인받는다.**

```
mcp__notion__notion-create-pages
  parent: { data_source_id: "f3d9059c-1010-46c8-a8ce-5f7656ab3ecc" }
  properties:
    작업 이름: "<작업 이름>"
    상태: "진행 중"                    # 시작 전 / 진행 중 / 완료 / 보류
    유형: "개선"                       # 필수 / 개선 — 최상위 작업에만
    담당자: ["3cdd872b-594c-81fe-b8f8-00022b0f4102"]
    시작일: "<오늘>"
```

이 DB는 **속성이 본체고 본문은 대부분 비어 있다.** 목표·범위·리스크 같은 섹션은 쓰지 않는다.
본문에 뭘 쓴다면 체크리스트뿐:

```md
## 조치
- [ ] …
---
(배경/증상 1~2줄)
```

`상위 작업`·`프로젝트` 릴레이션이 걸릴 자리가 보이면 걸어둔다. 나중에 추적이 된다.

### 1. 전제 확인

```bash
git remote -v                      # origin이 gitlab인지
glab auth status                   # 로그인돼 있는지
git fetch origin develop
```

`glab`이 없거나 로그인이 안 돼 있으면 거기서 멈추고 사용자에게 알린다.
직접 `glab auth login`을 돌리지 않는다.

### 2. 브랜치

현재 브랜치가 이미 `feature/*` 또는 `fix/*`면 그대로 쓴다.
아니면 `origin/develop`에서 새로 딴다:

```bash
git checkout -b feature/tlog-minio-sink origin/develop
```

이름은 작업 내용에서 뽑되 짧게(2~4단어). 이슈 키를 사용자가 주면 `feature/PROC-142-minio-sink`처럼 앞에 붙인다.

### 3. 커밋 — **여기서 한 번 멈춘다**

`git status`와 `git diff`로 실제 변경을 읽고, 커밋 메시지 초안을 만든 뒤
**스테이징할 파일 목록 + 커밋 메시지를 보여주고 승인을 받는다.**
승인 전에는 `git add`도 `git commit`도 하지 않는다.

- 관련 없는 파일이 섞여 있으면 지적한다 (`.env`, 빌드 산출물, 남은 디버그 로그)
- 성격이 다른 변경이 섞여 있으면 커밋을 나누자고 제안한다

**메시지는 제목 + 본문만 쓴다.** `Co-Authored-By:`·`Generated with ...` 같은 푸터·트레일러를
붙이지 않는다 — 레포 히스토리를 사람 작성 이력으로 유지한다.
결정의 경위(왜 그렇게 했는가)는 본문에 남긴다.

#### 뒤엎은 결정은 흔적을 남기지 않는다

작업 도중 **기존 안을 뒤엎는 결정**이 나오면(설계 변경·접근 방식 교체·잘못된 구현 되돌리기),
시행착오 커밋을 그대로 쌓지 말고 **스쿼시해서 처음부터 그 안이었던 것처럼** 만든다.

- `git reset --soft origin/develop` 후 최종 상태 기준으로 커밋 메시지를 새로 쓴다
- 메시지에 "되돌림"·"재구현"·"1차 구현 제거" 같은 흔적을 남기지 않는다 — **최종안만 설명**한다
- 판단 이력(왜 뒤엎었는지)은 커밋이 아니라 노션 작업 페이지나 MR 본문에 남긴다
- **이미 push 된 브랜치는 예외** — 히스토리를 다시 쓰지 않는다

### 4. push

```bash
git push -u origin <branch>
```

### 5. MR 본문 작성

`template.md`를 읽고 아래로 채운다. **빈 섹션을 그대로 두지 않는다.**

- **무엇을 / 왜** — 커밋 메시지를 반복하지 않는다. diff에 안 드러나는 배경과 판단 근거.
  모르면 지어내지 말고 사용자에게 묻는다.
- **변경 사항** — `git diff origin/develop...HEAD --stat`을 근거로. 파일 나열이 아니라
  "무엇이 달라졌나" 단위로.
- **확인 방법** — 리뷰어가 따라할 수 있는 명령/절차. 없으면 `N/A`.
- 설계 정본(옵시디언 노트)이나 짝 MR 이 있으면 링크 줄로 남긴다.
- 안내용 HTML 주석(`<!-- ... -->`)은 최종 본문에서 지운다. 스크린샷 자리 주석만 남길 수 있다.

### 6. MR 생성 — **여기서 또 한 번 멈춘다**

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

이미 MR이 있으면 `glab mr list --source-branch <branch>`로 확인하고,
새로 만들지 말고 `glab mr update <id> --description "$(cat ...)"`로 본문만 갱신한다.

### 7. 노션에 MR 링크를 남긴다

0단계에서 잡은 작업 페이지 본문 끝에 붙인다. 한 줄이면 된다.

```md
## MR
- [processor/mavlink!1](https://gitlab.com/.../merge_requests/1)
- [processor/dji!1](https://gitlab.com/.../merge_requests/1)
```

머지까지 확인되면 `상태` = `완료`, `완료일` = 그날. **머지 전에 완료로 올리지 않는다.**

## 하지 않는 것

- `develop`·`main`·`master`에 직접 커밋하거나 push
- 승인 없이 커밋 / 승인 없이 MR 생성 / 승인 없이 노션 작업 생성
- force push (사용자가 명시적으로 요청하면 그때만)
- MR 머지 — 머지는 사람이 한다
- 커밋 메시지에 푸터·트레일러(`Co-Authored-By:`, `Generated with ...`) 붙이기
- 이미 push 된 브랜치의 히스토리 다시 쓰기
- 노션 작업을 중복 생성 — 0단계에서 반드시 먼저 찾아본다
