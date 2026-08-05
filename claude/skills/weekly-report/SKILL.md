---
name: weekly-report
description: >
  주간보고 자동화 스킬. 아래 상황 중 하나라도 해당되면 반드시 이 스킬을 사용한다.
  - /weekly-report 명령어 입력
  - /weekly-report {날짜} 또는 /weekly-report {시작~끝} 명령어 입력
  - "주간보고", "weekly report", "주간 리포트" 등의 키워드 포함 요청
  Jira MC 프로젝트에서 이슈를 조회하고, GitHub PR을 참고하여 Google Sheets에 주간보고를 자동 작성한다.
owner: jongdeug
---

## 빠른 참조 (TL;DR)

| 커맨드 | 설명 |
|--------|------|
| `/weekly-report` | 이번 주(월~금) 주간보고 작성 |
| `/weekly-report 04.06` | 해당 날짜가 포함된 주의 주간보고 작성 |
| `/weekly-report 03.30~04.03` | 명시적 범위로 주간보고 작성 |

보조 스크립트 (`scripts/`, 실행은 `/home/jongdeug/google_workspace_mcp/.venv/bin/python3`):

| 스크립트 | 용도 |
|----------|------|
| `reauth_google.py` | Google 인증 복구. `start_google_auth` 가 실패할 때 사용 (Step 0) |
| `normalize_sheet_format.py '{시트명}' {기능개선건수} {요청건수}` | 시트 서식 정규화. 값 작성 후 항상 실행 (Step 8) |

---

## 상수

```
SPREADSHEET_ID: 1fDy_Npm4F_rXKTAQug-b8M5Nd4XuelBziJJSjtXgVqA
USER_EMAIL: jongdeug2021@gmail.com
JIRA_PROJECT: MC
GITHUB_REPO: tnh9570/medichis-apiServer
```

owner: jongdeug
---

## 실행 절차

### Step 0: Google 인증 복구 (인증 오류가 났을 때만)

MCP가 `start_google_auth` 로 내주는 URL은 **이 머신에서 동작하지 않는다.** 콜백 포트 8000을 도커 컨테이너(KrakenD, `st-1854-starfruit-back_krakend-1`)가 선점하고 있어 인증 후 404로 끝난다. `/mcp` reconnect 도 MCP 인스턴스만 하나 더 늘릴 뿐 해결되지 않는다.

대신 아래 스크립트를 쓴다. 콜백 포트를 직접 열고 PKCE 토큰 교환까지 끝내 credential 파일(`~/.google_workspace_mcp/credentials/<email>.json`)을 갱신한다. **MCP는 매 호출마다 이 파일을 읽으므로 재시작·reconnect 가 필요 없다.**

```bash
nohup /home/jongdeug/google_workspace_mcp/.venv/bin/python3 \
    ~/.claude/skills/weekly-report/scripts/reauth_google.py > /tmp/reauth.log 2>&1 &
```

로그(`/tmp/reauth.log`)를 폴링해서 분기한다.

| 로그 | 의미 | 할 일 |
|------|------|-------|
| `REFRESHED` | refresh_token 으로 갱신됨 | 바로 Step 1 진행 |
| `AUTH_URL: <url>` | 브라우저 인증 필요 | 이 URL을 **코드블록 원문**으로 사용자에게 제시(복붙용). 마크다운 링크로 주지 말 것 |
| `SAVED` | 인증 완료 | Step 1 진행 |
| `TIMEOUT` / `EXCHANGE_FAIL` | 실패 | 로그 내용을 그대로 사용자에게 보고 |

사용자가 인증을 마치면 브라우저에 "인증 완료" 페이지가 뜨고 스크립트가 자동으로 토큰을 저장한다.

---

### Step 1: 주간 날짜 범위 결정

인자를 파싱하여 `WEEK_START`(월요일)와 `WEEK_END`(금요일)를 결정한다.

- **인자 없음**: 오늘 날짜 기준으로 이번 주 월~금 계산
- **단일 날짜** (`MM.DD`): 해당 날짜가 포함된 주의 월~금 계산. 연도는 현재 연도 사용
- **범위** (`MM.DD~MM.DD`): 그대로 사용

`SHEET_NAME` 포맷: `"MM.DD~MM.DD"` (예: `"03.30~04.03"`)

단, 월/금이 서로 다른 연도에 걸치는 경우(12월~1월) 주의.

---

### Step 2: 시트 확인 및 데이터 초기화

1. `mcp__google-workspace__get_spreadsheet_info` 호출하여 `SHEET_NAME`과 일치하는 시트 탭이 있는지 확인
   - 인증 오류가 나면 **Step 0(Google 인증 복구)** 을 먼저 수행한다
2. **시트가 없으면**: 사용자에게 이전 주 시트 복사를 요청한다.
   - 안내 메시지: "시트 `{SHEET_NAME}`이 없습니다. 스프레드시트에서 **이전 주 시트** 탭을 우클릭 → **복사** → 이름을 `{SHEET_NAME}`으로 변경해주세요. 완료되면 알려주세요!"
   - 사용자가 완료했다고 알리면 다시 시트 목록을 확인하고 진행
3. **시트가 있으면**: `mcp__google-workspace__read_sheet_values`로 `B5:G30` 을 읽는다.
   - 이전 주 탭을 복사해 온 것이라 **지난주 데이터가 그대로 들어 있는 게 정상**이다. 지우기 전에 한 번 읽어서 지난주에 보고된 이슈 키를 기억해 둔다(Step 4의 중복 검사에 쓴다).
   - `mcp__google-workspace__modify_sheet_values` 의 `clear_values=true` 로 **`B5:G30`** 을 삭제한다.
   - A열은 병합·섹션명이 걸려 있으므로 **절대 건드리지 않는다**.

#### 시트 레이아웃 (실측 — 추측하지 말 것)

| 영역 | 행 범위 | A열 |
|------|---------|-----|
| 헤더 | Row 1~2 | — |
| 트랙 | Row 3~4 | `A3` 병합 (A3:A4) |
| 기능 개선 및 오류 수정 | **Row 5~11 (7행)** | `A5` 병합 (A5:A11), 텍스트 있음 |
| 요청 | **Row 12~18 (7행)** | `A12` 병합 (A12:A18), **텍스트 없음(빈 셀)** |

- 각 섹션의 **첫 행**(Row 5, Row 12)은 상단 경계선을 가진 특수 서식이다
- 섹션 **마지막 행**(Row 11, Row 18)에만 하단 마감선이 있다
- 담당자(D)·진행현황(F)의 색상은 수동 배경색이 아니라 **드롭다운 값 색칩**이다. 직접 칠하려 들지 말 것 — 데이터 검증만 살아 있으면 값에 따라 자동으로 붙는다

**서식은 위 범위까지만 존재한다.** 요청이 8건 이상이면 Row 19+ 는 맨 셀이므로 Step 8에서 반드시 보정한다.

owner: jongdeug
---

### Step 3: Jira 이슈 조회

`mcp__jira__jira_search`로 2개의 JQL 쿼리를 실행한다.

**쿼리 1** — 이번 주에 생성된 이슈 (미완료 포함):
```jql
project = MC AND created >= "YYYY-MM-DD" AND created <= "YYYY-MM-DD" ORDER BY key ASC
```

**쿼리 2** — 이번 주에 해결된 이슈 (보완):
```jql
project = MC AND resolutiondate >= "YYYY-MM-DD" AND resolutiondate <= "YYYY-MM-DD" ORDER BY key ASC
```

- `YYYY-MM-DD`는 `WEEK_START`(월요일)과 `WEEK_END`(금요일)
- `fields`: `summary,status,issuetype,assignee,resolutiondate,updated,labels`
- `limit`: 50
- 두 쿼리 결과를 이슈 key 기준으로 합치고 중복 제거
- 조회 결과 중 상태가 **"해야 할 일"(To Do)**인 이슈가 있으면, 사용자에게 해당 이슈를 주간보고에 포함할지 확인 요청

두 쿼리를 OR로 실행하는 이유: 이번 주에 생성된 이슈 중 아직 미해결인 것도 있고, 이전 주에 생성됐지만 이번 주에 해결된 이슈도 있다. 두 쿼리의 합집합으로 이번 주에 다룬 이슈를 빠짐없이 수집한다.

---

### Step 4: 이슈 분류

각 이슈를 **이슈타입**과 **상태** 조합으로 섹션을 분류한다.

#### 분류 규칙

| 우선순위 | 조건 | 섹션 |
|---------|------|------|
| 1 | 이슈타입 = `개선` | 기능 개선 및 오류 수정 |
| 2 | 이슈타입 = `작업` | 요청 |
| 3 | 이슈타입 = `버그` + 상태 ∈ {`리뷰중`, `리뷰완료`} | 기능 개선 및 오류 수정 |
| 4 | 이슈타입 = `버그` + 상태 ∈ {`완료`, `Released`} | 요청 |
| 5 | 이슈타입 = `버그` + 상태 ∈ {`진행중`, `테스트중`} | 사용자에게 확인 |
| 6 | 기타 이슈타입 | 사용자에게 확인 |

#### 배경 (왜 이렇게 분류하는가)
- **개선** 타입: 버그로 들어왔지만 코드 개선이 필요한 건. 리뷰 프로세스를 거침
- **작업** 타입: DB 요청 작업 등 단순 처리. 바로 완료 처리됨
- **버그** 타입: 유형 변경이 안 된 경우가 있으므로 상태로 추가 판단
  - 리뷰중/리뷰완료 → 코드 개선 작업 중 → 기능 개선
  - 완료 → DB 요청/단순 수정 → 요청

#### 제외 대상
- **에픽**(예: "N월 배포"): 개별 작업이 아니므로 제외. 미리보기에서 언급만 한다
- **해야 할 일**(미착수): 기본 제외. 미리보기에 별도 표시해 사용자 판단을 받는다

#### 중복 검사 (지난주와 겹치는 이슈)
Step 2에서 읽어 둔 **지난주 시트의 이슈 키**와 대조한다. 이미 보고된 키가 이번 주 조회에도 잡히면(재오픈되거나, 지난주 작성 시 완료일을 수동으로 앞당겨 적은 경우) 그대로 넣지 말고 **미리보기에서 "지난주 중복" 으로 표시**해 사용자에게 알린다. resolutiondate 기준으로는 규칙상 포함이 맞으므로, 기본은 포함하되 사용자가 빼라고 하면 제거한다.

owner: jongdeug
---

### Step 5: 구현사항(C열) 결정

#### "요청" 섹션 이슈
- Jira summary를 **그대로** 사용한다.
- 예: `"메타57) 작업_전자서명 이력 확인 요청드립니다."`

#### "기능 개선 및 오류 수정" 섹션 이슈
- Jira summary가 아닌, **실제 코드 변경사항을 요약**해야 한다.
- 절차:
  1. `mcp__jira__jira_get_issue_development_info`로 이슈에 연결된 PR 조회
  2. PR이 없으면 `gh pr list --repo tnh9570/medichis-apiServer --search "MC-XXXX" --state merged` 으로 검색
  3. PR의 제목과 변경 내용을 참고하여 **한 줄로 요약**
  4. 요약 예시: `"보험 집계 주차 범위 계산로직 수정"`, `"주사제 처방 시 중복 아이템 코드 분기 수정"`
- PR을 찾을 수 없는 경우: Jira summary를 기본값으로 사용하되, 사용자에게 수정 요청

---

### Step 6: 데이터 매핑

각 이슈를 시트 행으로 변환한다.

| 열 | 필드 | 값 |
|----|------|----|
| A (토픽) | 섹션명 | 각 섹션의 **첫 번째 행에만** 기재. 이후 행은 빈칸 |
| B (이슈번호) | 이슈 키 | `=HYPERLINK("https://trustnhope.atlassian.net/browse/MC-XXXX","MC-XXXX")` 수식으로 작성 |
| C (구현 사항) | 내용 | 기능개선→PR 기반 요약, 요청→Jira summary |
| D (담당자) | 담당자 | `issue.assignee.display_name` |
| E (완료 날짜) | 완료일 | `resolutiondate`를 `YYYY-MM-DD` 포맷. 미완료면 빈칸 |
| F (진행현황) | 상태 | `완료`/`Released`→"완료", 그 외→해당 상태명 |
| G (비고) | 비고 | 빈칸 |

owner: jongdeug
---

### Step 7: 사용자 확인 및 시트 작성

1. **작성 전 미리보기**: 분류 결과를 테이블 형태로 사용자에게 보여준다.

```
[기능 개선 및 오류 수정]
| 이슈번호 | 구현 사항 | 담당자 | 완료 날짜 | 진행현황 |
| MC-8591 | 보험 집계 주차 범위 계산로직 수정 | 성민석 | 2026-04-01 | 완료 |

[요청]
| 이슈번호 | 구현 사항 | 담당자 | 완료 날짜 | 진행현황 |
| MC-8587 | 메타57) 작업_전자서명 이력 확인... | 김종환 | 2026-03-31 | 완료 |

[해야 할 일] — 포함 여부 확인 필요
| 이슈번호 | 구현 사항 | 담당자 | 진행현황 |
| MC-8608 | 근로자의 날 공휴일 수가 적용... | 장성현 | 해야 할 일 |
```

- "해야 할 일" 이슈는 **미리보기에서만 별도 섹션으로 표시**하여 사용자가 포함 여부를 CLI에서 확인할 수 있도록 한다.
- 사용자가 포함을 원하면 어느 섹션(기능 개선 / 요청)에 넣을지 확인 후 반영한다.
- 포함하지 않겠다고 하면 시트 작성 시 제외한다.

2. 사용자가 확인/수정 요청하면 반영
3. **시트 작성**: `mcp__google-workspace__modify_sheet_values` 호출. A열은 그대로 두고 **B~G열만** 쓴다.
   - 기능 개선: **`B5:G{4+N}`** (N = 기능 개선 건수). 영역은 Row 5~11
   - 요청: **`B12:G{11+M}`** (M = 요청 건수). 8건 이상이면 Row 19+ 로 넘어간다 → Step 8 필수
   - 두 섹션은 **행이 붙어 있지 않다.** 기능 개선이 4건이어도 요청은 Row 9가 아니라 **Row 12부터** 시작한다
   - 이슈 정렬은 key 오름차순
4. **작성 후 반드시 값 검증**: `read_sheet_values` 로 다시 읽어 이슈 키·담당자·완료일이 Jira와 일치하는지 대조한다. 한글 요약을 손으로 옮기다 숫자가 틀리는 사고가 있었다(`광덕54)` → `광덕50)`).
5. Step 8(서식 정규화) 수행 후 스프레드시트 링크 출력:
   `https://docs.google.com/spreadsheets/d/1fDy_Npm4F_rXKTAQug-b8M5Nd4XuelBziJJSjtXgVqA/edit`

---

### Step 8: 서식 정규화 (값 작성 후 항상 실행)

양식에 서식이 준비된 범위를 넘겨 쓰면 테두리·9pt 폰트·드롭다운이 없는 맨 셀이 그대로 노출된다. 또 이전 주 탭에서 복사돼 온 행도 서식이 비어 있을 수 있다. 값 작성이 끝나면 **건수와 무관하게** 아래를 실행한다.

```bash
/home/jongdeug/google_workspace_mcp/.venv/bin/python3 \
    ~/.claude/skills/weekly-report/scripts/normalize_sheet_format.py '{SHEET_NAME}' {N} {M}
```

`{N}` = 기능 개선 건수, `{M}` = 요청 건수. `--dry-run` 으로 요청 내용만 미리 볼 수 있다. 값은 건드리지 않으며(`PASTE_FORMAT` 은 값 미변경), 여러 번 실행해도 결과가 같다(idempotent).

스크립트가 하는 일:
1. 기능 개선 영역 드롭다운 복원 + 번진 상단 경계선 제거
2. 요청이 8건 이상이면 신규 행에 일반 행 서식·드롭다운 부여, A열 병합을 새 마지막 행까지 확장
3. 섹션 마감선을 새 마지막 행으로 이동
4. 행간 경계선 정리 (섹션 첫 행의 상단선은 보존)

**직접 `copyPaste` 를 쓸 일이 생기면:** 소스로 **섹션 첫 행(Row 5·Row 12)을 절대 쓰지 말 것.** 첫 행은 상단 경계선을 갖고 있어 복사하면 대상 행마다 담당자~비고 열에 검은 가로선이 번진다. 반드시 일반 행(Row 6·Row 13)을 소스로 삼는다. 드롭다운은 `PASTE_FORMAT` 에 안 딸려오므로 `PASTE_DATA_VALIDATION` 을 따로 붙여야 한다.

작업 후 `includeGridData=true` + `fields=...userEnteredFormat(borders),dataValidation` 으로 행별 `top`/`bottom`/`dv` 를 찍어 **직전 주 시트와 대조 검증**한다. 정상 형태는 아래와 같다.

```
Row  5  top=s..s.s.  bottom=s......   ← 기능 개선 시작
Row  6~10  top/bottom 없음
Row 11  bottom=.ss....                ← 기능 개선 마감선
Row 12  top=s..ssss  bottom=m......   ← 요청 시작
Row 13~  top/bottom 없음
Row {11+M}  bottom=.mmmmmm            ← 요청 마감선
```

---

## 에러 처리

| 상황 | 대응 |
|------|------|
| Google 인증 필요 | **Step 0** 의 `reauth_google.py` 실행. `start_google_auth` 는 8000 포트를 도커가 선점해 실패하므로 쓰지 말 것 |
| `invalid_grant: Token has been expired or revoked` | refresh_token 만료. Step 0 스크립트가 자동으로 전체 재인증으로 넘어간다 |
| 인증 후 브라우저에 404 (`X-Krakend` 헤더) | 도커 KrakenD가 콜백을 가로챈 것. Step 0 스크립트(포트 8765)를 쓰면 발생하지 않는다 |
| Jira 이슈 없음 | "해당 주에 처리된 이슈가 없습니다" 안내 |
| 시트 이미 존재 + 데이터 있음 | 지난주 키를 기억해 둔 뒤 `B5:G30` 삭제(`clear_values`) 후 새로 작성 |
| 요청 8건 이상 / 행 서식 깨짐 | Step 8의 `normalize_sheet_format.py` 실행 |
| PR 찾을 수 없음 (개선 이슈) | `jira_get_issue_development_info` 가 비어 있는 경우가 잦다. `gh pr list --repo tnh9570/medichis-apiServer --search "MC-XXXX" --state all` 로 재검색(merged 만 걸면 놓친다). 그래도 없으면 Jira summary 사용 + 사용자에게 수정 요청 |
| 이슈 분류 불가 | 해당 이슈 정보를 보여주고 사용자에게 섹션 선택 요청 |
| 담당자 없음 | "미배정" 기재 |

---

## 이번 회차에서 실제로 터진 것들 (2026-07-20 주)

재발 방지용 기록. 같은 함정을 다시 밟지 말 것.

1. **인증**: `start_google_auth` URL로 인증했더니 404. 원인은 중복 MCP 인스턴스가 아니라 도커 KrakenD의 8000 포트 선점이었다 → Step 0으로 해결
2. **행 번호**: 이 문서가 "요청은 Row 11부터"라고 잘못 안내하고 있었다. 실제는 Row 12부터이며 기능 개선은 Row 5~11 → Step 2 레이아웃 표로 정정
3. **서식 깨짐**: 요청이 10건이라 Row 19~21이 양식 밖으로 나가 맨 셀 노출 → Step 8로 해결
4. **경계선 번짐**: 복구하려고 Row 5·Row 12(섹션 첫 행)를 복사 소스로 썼다가 각 행에 검은 가로선이 번졌다 → 일반 행을 소스로 쓸 것
5. **오타**: `광덕54)` 를 `광덕50)` 으로 잘못 옮겼다 → 작성 후 값 재검증 필수
6. **중복**: MC-8777이 지난주 시트에 이미 있었는데 resolutiondate 기준으로 다시 잡혔다 → 중복 검사 추가
