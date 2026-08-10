---
name: obsidian
description: "Obsidian vault 관리 스킬. 노트 생성/읽기/수정/삭제, 데일리 노트, 검색, 태그, 태스크, 템플릿, 북마크, 속성 등 Obsidian CLI의 모든 기능을 자연어로 수행한다. /obsidian 명령어 또는 '옵시디언', '메모', '노트', 'daily note', 'vault', '일지', '데일리', '태그', '할일', '검색' 등의 키워드가 포함된 요청 시 반드시 이 스킬을 사용한다. 옵시디언 관련 작업이라면 사용자가 명시적으로 요청하지 않아도 트리거한다."
---

# Obsidian CLI Skill

Obsidian vault를 CLI로 관리하는 스킬이다. 사용자의 자연어 요청을 Obsidian CLI 명령어로 변환하여 실행한다.

## 초기화 (매 세션 첫 실행 시)

스킬이 트리거되면 **명령어 실행 전에 반드시** 아래 2단계를 순서대로 수행한다.
이전에 같은 대화에서 이미 초기화를 마쳤다면 이 과정을 건너뛴다.

### Step 1: CLI 경로 탐색

플랫폼에 따라 Obsidian CLI 경로가 다르다. 아래 순서대로 시도하여 첫 번째로 성공하는 경로를 사용한다.

**1) PATH에 등록된 경우 (모든 플랫폼 공통)**
```bash
which obsidian 2>/dev/null || where obsidian 2>/dev/null
```
성공하면 해당 경로를 사용한다.

**2) 플랫폼별 기본 경로 탐색**

| 플랫폼 | 감지 방법 | 기본 경로 |
|--------|-----------|-----------|
| **macOS** | `uname -s` = "Darwin" | `/usr/local/bin/obsidian` 또는 Obsidian.app 내부 CLI |
| **Windows (PowerShell/CMD)** | `uname -s` = MINGW/MSYS/CYGWIN 또는 `$OS` = "Windows_NT" | `%LOCALAPPDATA%\Programs\Obsidian\Obsidian.com` |
| **WSL** | `uname -r`에 "microsoft" 또는 "WSL" 포함 | Windows 측 경로를 `/mnt/c/...` 형태로 접근. 아래 명령으로 탐색: |

WSL에서 Windows 측 경로 탐색:
```bash
# Windows 사용자 홈 디렉토리 찾기
WIN_HOME=$(cmd.exe /C "echo %USERPROFILE%" 2>/dev/null | tr -d '\r')
# /mnt/c 형태로 변환
WSL_PATH=$(wslpath -u "$WIN_HOME")/AppData/Local/Programs/Obsidian/Obsidian.com
```

**3) 위 방법으로 모두 실패하면**
사용자에게 Obsidian CLI 경로를 직접 물어본다:
"Obsidian CLI를 찾지 못했습니다. CLI 경로를 알려주시겠어요? (예: /usr/local/bin/obsidian)"

탐색된 CLI 경로를 이후 `OBSIDIAN_CLI`로 부른다.

### Step 2: Vault 선택

1. `$OBSIDIAN_CLI vaults verbose`를 실행하여 사용 가능한 vault 목록을 가져온다.
2. 사용자에게 목록을 보여주고 어떤 vault에 연결할지 물어본다.
   - vault가 1개뿐이면 해당 vault를 자동 선택하되, 사용자에게 알린다.
3. 선택된 vault 이름을 이후 모든 명령어에 `vault=<선택된이름>`으로 붙인다.

## 실행 방법

Bash 도구로 CLI를 호출한다. 기본 형태:

```bash
$OBSIDIAN_CLI <command> [options] vault=<선택된vault>
```

## 핵심 원칙

1. 사용자가 한국어로 요청하면 결과도 한국어로 출력한다.
2. content 값에 공백이 있으면 반드시 따옴표로 감싼다: `content="내용 여기"`
3. file은 wikilink 방식(이름만), path는 정확한 경로(폴더/파일.md)이다.
4. content에서 줄바꿈은 `\n`, 탭은 `\t`을 사용한다.
5. 여러 명령어를 조합해야 할 경우 순서대로 실행한다.
6. 실행 결과를 사용자에게 간결하게 정리하여 보여준다.

## CLI 명령어 레퍼런스

### Daily Notes (데일리 노트)

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `daily` | 데일리 노트 열기 | `paneType=tab\|split\|window` |
| `daily:read` | 데일리 노트 내용 읽기 | - |
| `daily:append` | 데일리 노트 끝에 추가 | `content=<text>` (필수), `inline`, `open` |
| `daily:prepend` | 데일리 노트 앞에 추가 | `content=<text>` (필수), `inline`, `open` |
| `daily:path` | 데일리 노트 경로 확인 | - |

### File CRUD (파일 관리)

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `create` | 새 파일 생성 | `name=<name>`, `path=<path>`, `content=<text>`, `template=<name>`, `overwrite`, `open`, `newtab` |
| `read` | 파일 내용 읽기 | `file=<name>`, `path=<path>` |
| `append` | 파일 끝에 내용 추가 | `file=<name>`, `path=<path>`, `content=<text>` (필수), `inline` |
| `prepend` | 파일 앞에 내용 추가 | `file=<name>`, `path=<path>`, `content=<text>` (필수), `inline` |
| `delete` | 파일 삭제 | `file=<name>`, `path=<path>`, `permanent` |
| `move` | 파일 이동 | `file=<name>`, `path=<path>`, `to=<path>` (필수) |
| `rename` | 파일 이름 변경 | `file=<name>`, `path=<path>`, `name=<name>` (필수) |

### Search (검색)

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `search` | 텍스트 검색 | `query=<text>` (필수), `path=<folder>`, `limit=<n>`, `total`, `case`, `format=text\|json` |
| `search:context` | 맥락 포함 검색 | `query=<text>` (필수), `path=<folder>`, `limit=<n>`, `case`, `format=text\|json` |
| `search:open` | 검색 뷰 열기 | `query=<text>` |

### Properties (속성)

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `properties` | 속성 목록 | `file=<name>`, `path=<path>`, `name=<name>`, `total`, `sort=count`, `counts`, `format=yaml\|json\|tsv`, `active` |
| `property:read` | 속성값 읽기 | `name=<name>` (필수), `file=<name>`, `path=<path>` |
| `property:set` | 속성값 설정 | `name=<name>` (필수), `value=<value>` (필수), `type=text\|list\|number\|checkbox\|date\|datetime`, `file=<name>` |
| `property:remove` | 속성 제거 | `name=<name>` (필수), `file=<name>`, `path=<path>` |

### Tags (태그)

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `tags` | 태그 목록 | `file=<name>`, `path=<path>`, `total`, `counts`, `sort=count`, `format=json\|tsv\|csv`, `active` |
| `tag` | 태그 정보 | `name=<tag>` (필수), `total`, `verbose` |

### Tasks (할일)

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `tasks` | 할일 목록 | `file=<name>`, `path=<path>`, `total`, `done`, `todo`, `status="<char>"`, `verbose`, `format=json\|tsv\|csv`, `active`, `daily` |
| `task` | 할일 상태 변경 | `ref=<path:line>`, `file=<name>`, `path=<path>`, `line=<n>`, `toggle`, `done`, `todo`, `daily`, `status="<char>"` |

### Templates (템플릿)

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `templates` | 템플릿 목록 | `total` |
| `template:read` | 템플릿 내용 읽기 | `name=<template>` (필수), `resolve`, `title=<title>` |
| `template:insert` | 활성 파일에 템플릿 삽입 | `name=<template>` (필수) |

### Navigation (탐색)

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `open` | 파일 열기 | `file=<name>`, `path=<path>`, `newtab` |
| `files` | 파일 목록 | `folder=<path>`, `ext=<extension>`, `total` |
| `folders` | 폴더 목록 | `folder=<path>`, `total` |
| `folder` | 폴더 정보 | `path=<path>` (필수), `info=files\|folders\|size` |
| `bookmarks` | 북마크 목록 | `total`, `verbose`, `format=json\|tsv\|csv` |
| `bookmark` | 북마크 추가 | `file=<path>`, `subpath=<subpath>`, `folder=<path>`, `search=<query>`, `url=<url>`, `title=<title>` |
| `recents` | 최근 파일 목록 | `total` |

### Info (정보)

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `vault` | vault 정보 | `info=name\|path\|files\|folders\|size` |
| `file` | 파일 정보 | `file=<name>`, `path=<path>` |
| `backlinks` | 백링크 목록 | `file=<name>`, `path=<path>`, `counts`, `total`, `format=json\|tsv\|csv` |
| `links` | 아웃링크 목록 | `file=<name>`, `path=<path>`, `total` |
| `orphans` | 고아 파일 목록 | `total`, `all` |
| `deadends` | 링크 없는 파일 목록 | `total`, `all` |
| `unresolved` | 미해결 링크 목록 | `total`, `counts`, `verbose`, `format=json\|tsv\|csv` |
| `outline` | 헤딩 구조 | `file=<name>`, `path=<path>`, `format=tree\|md\|json`, `total` |
| `wordcount` | 단어/글자 수 | `file=<name>`, `path=<path>`, `words`, `characters` |

### Aliases

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `aliases` | 별칭 목록 | `file=<name>`, `path=<path>`, `total`, `verbose`, `active` |

### History & Sync

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `history` | 파일 히스토리 버전 목록 | `file=<name>`, `path=<path>` |
| `history:read` | 히스토리 버전 읽기 | `file=<name>`, `path=<path>`, `version=<n>` |
| `history:restore` | 히스토리 버전 복원 | `file=<name>`, `path=<path>`, `version=<n>` (필수) |
| `sync` | 싱크 일시정지/재개 | `on`, `off` |
| `sync:status` | 싱크 상태 | - |
| `sync:history` | 싱크 버전 히스토리 | `file=<name>`, `path=<path>`, `total` |
| `sync:read` | 싱크 버전 읽기 | `file=<name>`, `path=<path>`, `version=<n>` (필수) |
| `sync:restore` | 싱크 버전 복원 | `file=<name>`, `path=<path>`, `version=<n>` (필수) |
| `diff` | 버전 비교 | `file=<name>`, `path=<path>`, `from=<n>`, `to=<n>`, `filter=local\|sync` |

### Plugins & Themes

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `plugins` | 플러그인 목록 | `filter=core\|community`, `versions`, `format=json\|tsv\|csv` |
| `plugins:enabled` | 활성 플러그인 | `filter=core\|community`, `versions` |
| `plugin:enable` | 플러그인 활성화 | `id=<id>` (필수) |
| `plugin:disable` | 플러그인 비활성화 | `id=<id>` (필수) |
| `plugin:install` | 플러그인 설치 | `id=<id>` (필수), `enable` |
| `plugin:uninstall` | 플러그인 제거 | `id=<id>` (필수) |
| `themes` | 테마 목록 | `versions` |
| `theme` | 현재 테마 | `name=<name>` |
| `theme:set` | 테마 변경 | `name=<name>` (필수) |
| `theme:install` | 테마 설치 | `name=<name>` (필수), `enable` |
| `theme:uninstall` | 테마 제거 | `name=<name>` (필수) |

### Commands & Hotkeys

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `commands` | 사용 가능한 명령어 목록 | `filter=<prefix>` |
| `command` | 명령어 실행 | `id=<command-id>` (필수) |
| `hotkeys` | 단축키 목록 | `total`, `verbose`, `format=json\|tsv\|csv`, `all` |
| `hotkey` | 명령어 단축키 조회 | `id=<command-id>` (필수), `verbose` |

### Workspace & Tabs

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `workspaces` | 워크스페이스 목록 | `total` |
| `workspace` | 현재 워크스페이스 트리 | `ids` |
| `workspace:load` | 워크스페이스 로드 | `name=<name>` (필수) |
| `workspace:save` | 워크스페이스 저장 | `name=<name>` |
| `workspace:delete` | 워크스페이스 삭제 | `name=<name>` (필수) |
| `tabs` | 열린 탭 목록 | `ids` |
| `tab:open` | 새 탭 열기 | `group=<id>`, `file=<path>`, `view=<type>` |

### Base (데이터베이스)

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `bases` | Base 파일 목록 | - |
| `base:views` | Base 뷰 목록 | - |
| `base:query` | Base 쿼리 | `file=<name>`, `path=<path>`, `view=<name>`, `format=json\|csv\|tsv\|md\|paths` |
| `base:create` | Base 항목 생성 | `file=<name>`, `path=<path>`, `view=<name>`, `name=<name>`, `content=<text>`, `open`, `newtab` |

### Snippets (CSS)

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `snippets` | CSS 스니펫 목록 | - |
| `snippets:enabled` | 활성 스니펫 | - |
| `snippet:enable` | 스니펫 활성화 | `name=<name>` (필수) |
| `snippet:disable` | 스니펫 비활성화 | `name=<name>` (필수) |

### Misc

| 명령어 | 설명 | 주요 옵션 |
|--------|------|-----------|
| `random` | 랜덤 노트 열기 | `folder=<path>`, `newtab` |
| `random:read` | 랜덤 노트 읽기 | `folder=<path>` |
| `reload` | vault 다시 로드 | - |
| `restart` | 앱 재시작 | - |
| `version` | 버전 확인 | - |
| `vaults` | vault 목록 | `total`, `verbose` |

## 사용 예시

### 첫 실행 시 초기화 흐름
```
1. CLI 경로 탐색 → 예: which obsidian → /usr/local/bin/obsidian
2. obsidian vaults verbose 실행
3. 결과: "para  /Users/kim/Documents/para", "work  /Users/kim/Documents/work"
4. 사용자에게: "사용 가능한 vault 목록입니다:
   - para (/Users/kim/Documents/para)
   - work (/Users/kim/Documents/work)
   어떤 vault에 연결할까요?"
5. 사용자: "para" → 이후 모든 명령어에 vault=para 사용
```

### 데일리 노트에 내용 추가
```
사용자: "오늘 데일리 노트에 회의록 추가해줘 - 프론트엔드 리팩토링 논의"
실행: obsidian daily:append content="## 회의록\n- 프론트엔드 리팩토링 논의" vault=<선택된vault>
```

### 노트 검색
```
사용자: "API 설계 관련 노트 찾아줘"
실행: obsidian search:context query="API 설계" vault=<선택된vault>
```

### 새 노트 생성
```
사용자: "프로젝트 기획서 노트 만들어줘"
실행: obsidian create name="프로젝트 기획서" content="# 프로젝트 기획서\n\n## 목표\n\n## 일정\n\n## 리소스" vault=<선택된vault>
```

### 할일 목록 확인
```
사용자: "미완료 할일 보여줘"
실행: obsidian tasks todo vault=<선택된vault>
```

### 태그로 분류 확인
```
사용자: "vault에서 가장 많이 쓰는 태그가 뭐야?"
실행: obsidian tags counts sort=count vault=<선택된vault>
```
