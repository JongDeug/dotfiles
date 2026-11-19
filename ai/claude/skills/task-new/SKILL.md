---
name: task-new
description: >
  옵시디언 태스크 폴더(Project/모빌리티원/태스크/{작업}/)를 우리 틀(목표.md · raw/ · 메모/ · 정리/ · 하위/ · {작업}.base)로 만들거나,
  하위 작업 폴더를 더하거나, 옛 폴더를 그 틀에 맞춘다. 사용자는 raw · 메모에 막 넣고, 보고는 task-report 가 뽑는다.
  아래 요청이 나오면 이 스킬을 사용한다.
  - "새 태스크 만들어줘", "태스크 하나 만들자", "옵시디언에 작업 만들자"
  - "하위 작업 추가: ○○", "하위 폴더 만들어줘"
  - "이 태스크 폴더 틀에 맞춰줘", "옛 태스크 정리해줘"
  보고 · 노션은 task-report, 노션 쓰기 양식은 notion-ticket 이다.
owner: jongdeug
---

## 틀

볼트 `/Users/jongdeug/Documents/para`, 태스크 루트 `Project/모빌리티원/태스크/`.

```
{작업}/
├─ 목표.md        ← 대표 노트(태그 task) — 하려는 것 · 왜 · 다 됐다고 보는 기준 · 하지 않는 것 + ![[{작업}.base]]
├─ raw/           ← 원자료를 그대로 — 메일 · 문서 · 회의록 · 캡처 · 로그 · PDF. 읽기만
├─ 메모/MM-DD 무엇.md  ← 막 적는 곳
├─ 정리/          ← 사용자가 메모 · raw 에서 정리한 노트 + 첨부 (작업 전체에 걸친 것)
├─ 보고.md        ← task-report 가 쓴다
├─ {작업}.base    ← 하위 작업 · 최근 · 메모 · 정리 · raw
└─ 하위/
   └─ {하위 작업}/          ← 노션 하위 작업 하나 = 폴더 하나 (이름도 같게)
      ├─ 목표.md            ← 태그 subtask — 하려는 것 · 다 됐다고 보는 기준 · 하지 않는 것 (· 정할 것)
      ├─ raw/ · 메모/ · 정리/   ← 그 하위 작업 몫
      └─ (하위/ 없음 — 2단까지)
```

### frontmatter

| 노트 | 태그 | 속성 |
|---|---|---|
| `{작업}/목표.md` | `task` | 주제 · 상태(자유 설명) · 단계 · 레포 · 진입점 · 노션 |
| `하위/{하위}/목표.md` | `subtask` | 상위(`"[[{작업}/목표\|{작업}]]"`) · 단계 · 담당 · 시작일 · 완료일 · 레포 · 노션 |

- `단계` = `준비` · `진행` · `배포` · `완료` · `보류`. 노션 상태로 바뀌어 간다(task-report)
- 「태스크 지도.base」는 `task` 태그만 본다 — 하위는 안 뜬다. 옛 폴더(`{작업}/{작업}.md` 대표)도 그대로 뜬다
- 템플릿: `_templates/태스크.md`(작업 목표.md) · `_templates/하위 작업.md` · `_templates/메모.md`
- 노트 이름이 겹친다(`목표.md` 여럿) — 링크는 경로로: `[[{작업}/목표|…]]` · `[[{작업}/하위/{하위}/목표|…]]`

### `{작업}.base`

```yaml
filters:
  and:
    - file.inFolder(this.file.folder)
formulas:
  하위: file.folder.split("/하위/")[1].split("/")[0]
views:
  - { type: table, name: 하위 작업, filters: { and: [ 'file.hasTag("subtask")', 'file.name == "목표"' ] }, order: [formula.하위, 단계, 담당, 시작일, 완료일] }
  - { type: table, name: 최근, filters: { and: [ 'file.name != "목표"' ] }, order: [file.name, formula.하위, file.mtime], sort: [{ property: file.mtime, direction: DESC }] }
  - { type: table, name: 메모, filters: { and: [ 'file.path.contains("/메모/")' ] }, order: [file.name, formula.하위, file.mtime], sort: [{ property: file.name, direction: DESC }] }
  - { type: table, name: 정리, filters: { and: [ 'file.path.contains("/정리/")' ] }, order: [file.name, formula.하위, file.mtime], sort: [{ property: file.mtime, direction: DESC }] }
  - { type: table, name: raw, filters: { and: [ 'file.path.contains("/raw/")' ] }, order: [file.name, formula.하위, file.ext, file.mtime], sort: [{ property: file.mtime, direction: DESC }] }
```

## 새 태스크

1. 같은 일이 `태스크/` 나 노션(notion-ticket 중복 검사)에 있는지 본다
2. 만든다: `목표.md`(템플릿 태스크, 맨 아래 `## 폴더` 에 `![[{작업}.base]]`) · `{작업}.base` · 빈 `raw/` · `메모/` · `정리/` · `하위/`
3. 받은 내용이 있으면 원문은 `raw/` 에. 목표.md 의 빈 절은 비워 둔다 — 「채워줘」 하면 그때 raw 에서 초안

## 하위 작업 추가

1. 이름은 노션 하위 작업 이름 그대로 — 작업명 · 요구사항 번호를 붙이지 않는다(`{하는 일} ({범위})`)
2. `하위/{이름}/` 에 `목표.md`(템플릿 하위 작업) · 빈 `raw/` · `메모/` · `정리/`
3. 상위 `정리/` · `raw/` 에서 그 하위 몫인 노트가 보이면 옮길 안을 표(`파일 | 갈 곳`)로 보여 주고 고른 뒤 옮긴다. 여러 하위에 걸친 노트는 상위에 둔다
4. 노션 하위 작업 URL 이 있으면 `노션:` 에. 없으면 비워 둔다(task-report 노션 동기화가 만든다)

## 옛 폴더 맞추기

1. 폴더를 다 읽고 옮길 안을 표(`파일 | 갈 곳`)로 먼저 보여 주고 고른 뒤 실행
2. 대표 노트(`{작업}.md`)와 기존 `목표.md` 가 있으면 목표.md 로 합친다 — frontmatter 는 대표 노트 것(+ 없으면 `단계` · `노션`), 본문은 하려는 것 · 왜 → 목표 절들. 서로를 가리키던 「옮겼다」 줄만 뺀다
3. 정리된 노트 · 첨부 → `정리/`, 남이 준 원문 → `raw/`, `메모.md` → `메모/`
4. 볼트 안의 `[[{작업}]]` 링크를 `[[{작업}/목표|{작업}]]` 로 바꾼다
5. 노트 내용은 고치지 않는다 — 옮기기 · 링크 바꾸기 · frontmatter 키 더하기만

## 하지 않는 것

- raw 수정 · 노트 내용 고쳐 쓰기 · 지우기
- 하위 아래 하위
- 보고 쓰기 · 노션 쓰기 — task-report 의 일
