---
name: git-flow
description: >
  우리 팀의 git 브랜치/배포 컨벤션을 설명한다. 자동화는 하지 않고 "이 팀은 이렇게 흘러간다"만 알려준다.
  아래 질문이 나오면 이 스킬을 사용한다.
  - "배포 플로우 어떻게 돼", "git 흐름 설명해줘", "브랜치 전략이 뭐야"
  - "브랜치 이름 규칙", "feat/ rc/ fix/ hotfix/ 가 뭐야"
  - "버전 태그가 뭐야", "Major.Minor.Hotfix.Test", "배포 태그는 어떻게 정해져"
  - "RC가 뭐야", "RC 중에 버그 나면", "배포 리스트에서 이슈 빼려면"
  - "hotfix 어떻게 해", "배포 후 급한 버그"
  브랜치를 실제로 만들거나 PR을 여는 건 이 스킬의 일이 아니다 — 그때는 git 명령을 직접 쓴다.
owner: jongdeug
---

전체 흐름 다이어그램: `배포 플로우.png` (같은 디렉토리). 시각 자료가 필요하면 이 이미지를 Read로 열어서 보여준다.

## 브랜치

| 종류 | 이름 | 분기 기준 | 수명 |
|---|---|---|---|
| 고정 | `main` | — | 프로덕션 |
| 고정 | `develop` | — | 개발 통합 |
| 임시 | `feat/{issue-key}` | develop | 머지 후 삭제 |
| 임시 | `rc/{version}` | develop | 배포 후 삭제 |
| 임시 | `fix/{issue-key}-{N}` | rc | 머지 후 삭제 (N은 1부터 증가) |
| 임시 | `hotfix/{version}` | main | 머지 후 삭제 |

## 버전 태그: `Major.Minor.Hotfix.Test`

| 자리 | 언제 오르나 |
|---|---|
| Major | 큰 단위 변경 |
| Minor | **실배포마다 +1** (배포 태그를 딸 때) |
| Hotfix | 배포 후 긴급수정마다 +1 |
| Test | RC 진행 중 수정이 머지될 때마다 +1 |

## 3구간 흐름

### 1) 개발

develop에서 `feat/{issue-key}`를 여러 개 분기해 병렬 작업 → 완료되면 develop 대상 PR.
배포 요청 시점에 각 feat 브랜치를 develop 최신으로 pull한 뒤 PR을 머지한다.

RC를 시작하기 전에 `git diff origin/develop origin/main`이 비어 있는지 확인한다 (지난 배포가 develop에 되돌려져 있어야 정상).

### 2) 버전배포준비 (RC)

develop → `rc/{major}.{minor}.0.0` 생성, 초기 태그 `{major}.{minor}.0.0`.
이후 이 RC 브랜치를 QA한다.

- **QA 수정사항** → `fix/{issue-key}-{N}` 분기 → RC 대상 PR → 머지. 머지마다 **Test +1** (`2.1.0.1` → `2.1.0.2` → …)
- **이슈를 배포 리스트에서 제외** → 해당 이슈의 머지 커밋을 **최신부터 역순으로** revert (`fix/{key}-2` → `fix/{key}-1` → `feat/{key}`)
- **develop에 새 작업이 쌓임** → develop → rc 동기화 PR. RC에만 있는 fix 커밋과 충돌할 수 있으니 PR에서 해결

### 3) 배포요청즉시

배포 태그 = RC 버전의 **Minor +1, Hotfix·Test는 0으로 리셋**.
예: `rc/2.1.0.0`에서 QA를 거쳐 `2.1.0.5`까지 갔다면 배포 태그는 **`2.2.0.0`**.

순서가 이 플로우의 핵심 원칙이다:

```
배포 태그 생성 → 이미지 빌드 → 실서버 배포 성공 검증 → main 머지 → develop 병합
```

**배포가 검증되기 전에는 main을 건드리지 않는다.** 배포가 실패하면 그 태그는 폐기하고 RC에서 수정해 새 태그를 딴다. 배포 후 `git diff origin/develop origin/main`이 다시 비어야 한 사이클이 닫힌 것.

## 배포 후 긴급수정 (hotfix)

main에서 `hotfix/{version}` 분기 → 수정 → main 머지, 태그는 **Hotfix +1** (`2.1.0.0` 배포 후 핫픽스 → `2.1.1.0`).
main 머지 후 develop에도 반영하고, 진행 중인 RC가 있으면 그 RC를 `origin/main` 기준으로 rebase한다.

## 릴리즈 노트 정리 기준

RC 분기 시점(`git merge-base origin/main origin/rc/...`) 이후 머지된 PR을 모으고, 제목 prefix로 분류한다.

| prefix | 섹션 |
|---|---|
| `fix`, `bugfix`, `bug` | Bug Fixes |
| `feat`, `feature` | Features |
| `refactor` | Refactoring |
| `chore`, `docs`, `style`, `test` | Chores |
| 그 외 | Other |

Jira 키는 PR 제목과 브랜치명에서 `\b([A-Z][A-Z0-9]+)-(\d+)\b`로 추출. `chore: sync develop into rc/...` 같은 동기화 PR은 노트에서 제외한다.
