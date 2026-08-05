---
name: sync-readme
description: >
  PostToolUse 훅으로 동작하는 README.md 구조 동기화 스킬.
  파일 생성/삭제 등 디렉토리 구조 변경이 감지되면 README.md의 구조 섹션 업데이트를 안내한다.
  훅에서 "[sync-readme]" 메시지를 수신하면 이 스킬의 지침을 따른다.
owner: jongdeug
---

## 개요

이 스킬은 **훅 기반**으로 동작한다. 직접 호출하는 것이 아니라, PostToolUse 훅이 구조 변경을 감지했을 때 Claude가 자동으로 이 지침을 따른다.

## 훅 설정

`settings.json`의 hooks에 아래 설정이 필요하다:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|Bash",
        "command": "bash ~/.claude/skills/sync-readme/scripts/detect-structure-change.sh"
      }
    ]
  }
}
```

## 트리거 조건

훅 스크립트가 `[sync-readme]` 접두사 메시지를 출력하면 아래 절차를 수행한다.

## 업데이트 절차

1. **현재 구조 파악**: 프로젝트 루트에서 `tree` 또는 `ls -R`로 실제 디렉토리 구조를 확인한다.
2. **README.md 읽기**: README.md를 읽고 구조 섹션(## 구조, ## Structure 등)을 찾는다.
3. **차이점 파악**: 실제 구조와 README에 기록된 구조를 비교한다.
4. **최소 수정**: 변경된 부분만 업데이트한다. 기존 설명이나 주석은 유지한다.
5. **보고**: 사용자에게 변경 내용을 간략히 알린다.

## 주의사항

- README 구조 섹션의 기존 포맷(들여쓰기, 트리 기호 등)을 유지한다.
- 모든 파일을 나열하지 않는다. 기존 README의 depth/granularity를 따른다.
- `node_modules`, `.git`, `dist`, `build` 등 빌드 산출물은 제외한다.
- 현재 진행 중인 작업이 모두 끝난 후에 업데이트한다 (중간에 끼어들지 않는다).
