---
name: git-commit
description: >
  변경을 커밋으로 묶고 메시지 문안을 쓴다. 스테이징 확인 → 커밋 단위 → 제목·본문 → 필요하면 스쿼시·트레일러 정리.
  아래 요청이 나오면 이 스킬을 사용한다.
  - "커밋해줘", "이거 커밋하자", "커밋 메시지 써줘", "메시지 다시 써줘"
  - "커밋 나눠줘", "스쿼시해줘", "커밋 정리해줘"
  - "Co-Authored-By 빼줘", "트레일러 지워줘", "클로드 서명 없애줘"
  브랜치 생성·push·MR·노션은 task-flow 스킬, 예전 회사의 rc/hotfix 배포 플로우는 git-flow 스킬이다.
owner: jongdeug
---

## 호출자에게서 받는 값

| 값 | 안 받았으면 |
|---|---|
| 분기 기준(base) | `@{upstream}` 을 쓴다. 그것도 없으면 **묻는다** — 지어내지 않는다 |
| 제목 type | 현재 브랜치 prefix 에서 읽는다 (`fix/...` → `fix:`) |

팀 컨벤션(`feature/*`·`fix/*` ← `origin/develop`)은 `task-flow` 가 갖고 있다. 여기서 정하지 않는다.

## 1. 승인 게이트 — 여기서 한 번 멈춘다

`git status` 와 `git diff` 로 실제 변경을 읽고, 메시지 초안을 만든 뒤
**스테이징할 파일 목록 + 커밋 메시지를 보여주고 승인을 받는다.**
승인 전에는 `git add` 도 `git commit` 도 하지 않는다.

## 2. 스테이징과 커밋 단위

- **`git add -A` · `git add .` · `git commit -a` 금지.** 검증한 파일만 명시적으로 건다 — 남의 미커밋 변경과 심볼릭 링크를 쓸어담는다
  (`.gitignore` 의 `node_modules/` 는 디렉토리 패턴이라 링크를 못 거른다).
- 커밋 직전 `git status --short` 로 확인하고 보고에 적는다.
- 관련 없는 파일이 섞여 있으면 지적한다 (`.env`, 빌드 산출물, 남은 디버그 로그).
- 성격이 다른 변경이 섞여 있으면 커밋을 나누자고 제안한다.

## 3. 제목

Conventional Commits — `type(scope): 제목`.
`type` 은 `feat` `fix` `refactor` `perf` `test` `docs` `chore` `style` `build` `ci` `revert` 중 하나이고, **브랜치 prefix 와 맞춘다** (`feature/` → `feat`, `fix/`·`hotfix/` → `fix`).

## 4. 본문

**제목 + 본문만 쓴다.** 결정의 경위(왜 그렇게 했는가)를 본문에 남긴다 — diff 를 읽으면 아는 것 말고.

**줄바꿈은 문장이 끝난 자리에서만.** 폭을 맞추려고 문장 중간을 끊지 않는다 — 한 문장은 길어도 한 줄로 두고,
줄은 문장·문단 단위로만 나눈다. 열 맞춘 표·들여쓴 정렬 블록도 만들지 않는다.

## 5. 트레일러 — 도구가 자동으로 붙인다

아래 줄을 **넣지 않는다.** 하네스 기본값으로 붙는 줄이라 매번 의식적으로 빼야 한다.

- `Co-Authored-By: Claude ...`
- `Claude-Session: https://claude.ai/code/...`
- `🤖 Generated with [Claude Code]`

레포 히스토리를 사람 작성 이력으로 유지한다. 팀 정본은 `backend-llm-wiki/REPO-CLAUDE.md` 의 「커밋 컨벤션」 절이고,
모든 repo `CLAUDE.md` 가 이걸 import 한다.

```bash
git log --format='%h %(trailers:key=Co-Authored-By,valueonly)' <base>..HEAD
```

이미 붙은 채로 쌓였으면 **머지 전에** 정리한다.

- push 전이면 6번(스쿼시)으로 처리하는 게 싸다.
- 이미 push 됐으면 백업 브랜치를 먼저 만들고 `git filter-branch -f --msg-filter` 로 해당 줄만 걷어낸 뒤,
  커밋 수·트리가 같은지 확인하고 `--force-with-lease` 로 푸시한다.
- 해시가 바뀌므로 리뷰 인라인 코멘트가 outdated 로 접힐 수 있다. squash 로 합치면 `git log --follow` 의 rename 추적이 끊긴다.

## 6. 스쿼시 — 뒤엎은 결정은 흔적을 남기지 않는다

작업 도중 **기존 안을 뒤엎는 결정**이 나오면(설계 변경·접근 방식 교체·잘못된 구현 되돌리기),
시행착오 커밋을 그대로 쌓지 말고 **스쿼시해서 처음부터 그 안이었던 것처럼** 만든다.

- `git reset --soft <base>` 후 최종 상태 기준으로 메시지를 새로 쓴다
- "되돌림"·"재구현"·"1차 구현 제거" 같은 흔적을 남기지 않는다 — **최종안만 설명**한다
- 판단 이력(왜 뒤엎었는지)은 커밋이 아니라 노션 작업 페이지·MR 본문·`spec.md` 에 남긴다
- **이미 push 된 브랜치는 예외** — 히스토리를 다시 쓰지 않는다. 트레일러가 쌓인 경우만 5번의 절차를 따른다

## 훅이 한 번 더 본다 (deck mod)

deck mod 가 Claude 의 `git commit`·`git add` 를 실행 직전에 검문한다 — 이 스킬을 놓쳐도 아래에 걸리면 실행되지 않고 고칠 곳이 돌아온다.
서명 줄(5번) · 한꺼번에 담기(2번) · 제목 꼴과 type(3번) · 브랜치 prefix 와 type · 폭 맞춰 끊은 줄 · 표 · 공백 열 맞춤(4번) · 팀 레포의 develop·main·master 직접 커밋.
막히면 돌아온 줄대로 고쳐 다시 커밋한다. 판단이 드는 것(왜를 쓰기 · 커밋 나누기 · 스쿼시)은 이 스킬만 본다.

## 하지 않는 것

- 팀 레포의 `develop`·`main`·`master` 에 직접 커밋 (개인 레포는 해당 없음 — 호출자가 브랜치를 정한다)
- 승인 없이 `git add` / `git commit`
- push·MR 생성·브랜치 생성·머지 — 커밋이 이 스킬의 끝이다. 그다음은 `task-flow`
- force push (5번의 트레일러 정리에서 `--force-with-lease` 를 쓸 때만, 그것도 승인 후)
