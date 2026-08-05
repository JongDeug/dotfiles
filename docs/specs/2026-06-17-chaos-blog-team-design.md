---
title: chaos-blog 글쓰기 에이전트 팀 설계서 (빌드 요청 명세)
description: chaos 블로그(/chaos/p/<slug>)에 글을 작성·발행하는 멀티 에이전트 팀 스킬(/chaos-blog)의 정의서. 이 문서를 더 강한 모델에 넘겨 실제 스킬·에이전트 파일을 빌드한다.
date: 2026-06-17
status: 확정 (구현 대기)
owner: jongdeug
---

# `/chaos-blog` — 글쓰기 에이전트 팀 설계서

## 0. 이 문서의 목적

종환님이 **주제** 또는 **초안**을 주면, 여러 역할의 에이전트가 협업해 chaos 블로그용 글을 작성하고
**초안 상태로 등록 → 종환님 승인 → 발행**까지 진행하는 **Agent Teams 기반 스킬**을 정의한다.

이 문서는 **빌드 요청 명세서**다. 실제 스킬(`SKILL.md`)과 에이전트 역할 정의 파일은
이 명세를 입력으로 받아 (더 강한 모델이) 생성한다. **이 문서 자체는 구현이 아니다.**

선행 맥락: 기존 블로그 스킬 3종(`write-blog`/`write-girls`/`blog-deploy`)과 jongdeug.log(옵시디언→정적HTML)
프로젝트는 2026-06-17 전면 폐기됨. 블로그의 새 거점은 **chaos 세컨드 브레인의 블로그**다.

---

## 1. 핵심 결정 (확정)

| # | 항목 | 결정 |
|---|---|---|
| 1 | 완성물 | chaos `posts`에 등록된 글 → 발행 시 공개 URL `https://jongdeug.duckdns.org/chaos/p/<slug>` |
| 2 | 입력 모드 | **주제 모드** (`/chaos-blog <주제>`) · **초안 모드** (`/chaos-blog` + 초안 첨부/붙여넣기) |
| 3 | 발행 방식 | **초안 우선** — 팀은 초안(status=draft)까지 만들고, 종환님 승인 시에만 발행 |
| 4 | 코드네임 / 스킬명 / 트리거 | chaos blog / `chaos-blog` / `/chaos-blog` |
| 5 | 협업 모델 | Agent Teams (메인 세션 = lead + Planner 겸임), teammate들이 공유 task list + mailbox로 협업 |

설계 근거(요약): 블로그 집필은 ① 절차를 미리 못 박고(톤·구조가 진행 중 바뀜) ② 여러 역할이 결과물을
주고받아야 하고 ③ 종환님이 중간에 개입하는 작업 → 팀(Agent Teams)이 적합한 드문 케이스.

---

## 2. 팀원 정의 (6역할, 실제 스폰 5명)

### ① Planner 〔= 메인 세션(토르)이 겸임, team lead〕
- **입력:** 종환님의 주제 또는 초안. 입력에서 모드(주제/초안) 자동 판별.
- **책임:** 글의 각도·타깃 독자·아웃라인 확정 → **종환님과 아웃라인 1회 합의** → task list 생성 후 팀원에게 분배 → 진행 조율·중계.
- **산출:** 확정 아웃라인 + 작업 분배. 주제 모드면 Researcher 먼저, 초안 모드면 구조 재배치 우선.
- **비고:** 별도 teammate로 스폰하지 않고 lead가 겸임(토큰·왕복 절감).

### ② Researcher 🔍
- **책임:** chaos가 종환님 세컨드 브레인이므로, **종환님 본인 atom/메모를 조회**해 글에 녹일 경험·관점·사실을 발췌하고 **출처 atom id 목록**을 모은다. "검색하면 나오는 일반론"이 아니라 종환님 자산 우선(chaos 기록 원칙).
- **도구:** chaos MCP(`https://jongdeug.duckdns.org/chaos/mcp`, Bearer) 또는 로컬 psql(`chaos-postgres` 127.0.0.1:5433). atom 검색·조회.
- **산출:** 근거 노트 + `source_atom_ids` 배열(발행 시 글의 "Roots(뿌리)" 박스에 자동 표시됨).
- **모드:** 주제 모드 핵심 / 초안 모드 보강(초안에 종환님 과거 생각 연결).

### ③ Writer ✍️
- **입력:** 아웃라인 + 리서치 노트 (초안 모드면 원초안 포함).
- **책임:** `body_md`(마크다운) 집필. **chaos 하우스 스타일 준수**(아래 §4의 `DRAFT_SYSTEM` 규칙). 다이어그램이 필요한 위치엔 자리표시만 두고 Diagrammer와 협의.
- **산출:** body_md 초안.

### ④ Diagrammer 📊
- **책임:** 시각화가 필요한 지점에 다이어그램 제작. **chaos 다이어그램 시스템** 사용: 다이어그램(`mermaid` 또는 `html` 포맷)을 생성·등록해 id를 받고, 본문엔 **마커** `[설명](chaos-diagram:<id>)`만 삽입. 발행 시 자동으로 mermaid 코드블록/iframe으로 치환됨. (인라인 거대 HTML 직접 삽입 금지 — 작성/미리보기 가독성 보호.)
- **도구:** chaos 다이어그램 API(빌드 시 정확한 엔드포인트 확인 필요. 이미지가 필요하면 `POST /api/posts/image`).
- **모드:** 주제 모드 기본 on / 초안 모드 선택.

### ⑤ Editor 🪄
- **책임:** 사실·구조·가독성 검수 + **AI 티 제거**. 종환님의 **im-not-ai** 자산을 풀로 적용한다.
- **im-not-ai 윤문 파이프라인(1인 editor가 순차 수행):** taxonomy 탐지 → playbook 윤문 → content-fidelity 내용보존 감사 → naturalness 자연스러움 검수. 참조 파일: `~/.claude/skills/humanize-korean/references/ai-tell-taxonomy.md`, `rewriting-playbook.md`(필요시 `quick-rules.md`).
- (선택) lead 가 editor 통과본에 `humanize-korean` 스킬을 한 번 더 돌려 5인 파이프라인으로 교차검증 가능.
- **내용 불변 원칙**(사실·주장·수치·인용·고유명사 보존, 문체·리듬만 손질). 변경률 5~30%, 과윤문 시 롤백.
- **산출:** 최종 body_md + 최종 title/summary/topics.

### ⑥ Publisher 🚀
- **책임:** 최종 결과를 chaos에 **초안으로 등록** → 종환님께 미리보기 알림 → **승인 시 발행**.
- **정확한 호출 (빌드 시 §3 참조):**
  1. 초안 생성: `POST /api/posts` with `{ title, summary, topics[], body_md, source_atom_ids[] }` → status는 draft 기본값. **`/api/posts/draft`는 쓰지 말 것**(그건 atom→Gemini 자동생성기라 우리 본문을 덮어씀).
  2. (수정 필요 시) `PATCH /api/posts/:id`.
  3. 발행(오너 전용): `POST /api/posts/:id/publish` → 정적 HTML 재생성, 응답에 `url: /chaos/p/<slug>`.
- **산출:** 초안 post id/slug → (승인 후) 공개 URL.

---

## 3. chaos 연동 사양 (코드 확인 결과, 2026-06-17)

소스: `~/workspace/chaos/apps/api/src/api.mjs`, `chaos-data.mjs`. 로컬 API `:3001`, postgres `:5433`(docker `chaos-postgres`).

### posts 스키마 (관련 컬럼)
`id, user_id, slug, title, summary, body_md, topics[], source_atom_ids[], reading_min, status, published_at`
- `slug`: title에서 자동 생성(한글 허용, 중복 시 `-2` 접미). 공개 URL `/chaos/p/<slug>`.
- `body_md`: 마크다운. 다이어그램은 마커 `[..](chaos-diagram:<id>)` (발행 시 치환).

### 엔드포인트
| 용도 | 호출 | 비고 |
|---|---|---|
| 초안 생성 | `POST /api/posts` `{title,summary,topics,body_md,source_atom_ids}` | **우리 팀이 쓸 경로.** status=draft 기본 |
| 수정 | `PATCH /api/posts/:id` | 부분 업데이트 |
| 조회 | `GET /api/posts/:id`, `GET /api/posts` | 관리용(draft 포함) |
| 발행 | `POST /api/posts/:id/publish` | **오너 전용.** 정적HTML 재생성, `url` 반환 |
| 발행취소 | `POST /api/posts/:id/unpublish` | 오너 전용 |
| 이미지 업로드 | `POST /api/posts/image` | 멀티파트 |
| ⚠️ AI 자동초안 | `POST /api/posts/draft` `{atomIds[≤8]}` | **사용 금지** — atom→Gemini 자동생성(우리 본문 무시) |

### 인증 (빌드 시 반드시 검증)
- 발행은 오너 전용(`isOwnerReq()`: 세션 userId === OWNER_USER_ID).
- 세션/오너 식별은 미들웨어가 헤더에서 설정. 메모 기준: 오너 인증 = `.env`의 `SB_INTERNAL_SECRET`(헤더 `x-internal-secret`) + `SB_OWNER_TELEGRAM_ID`(헤더 `x-telegram-id`).
- **빌드 담당이 할 일:** api.mjs의 auth 미들웨어를 읽어 정확한 헤더/시크릿 주입 방식을 확정하고 Publisher에 반영.

---

## 4. chaos 하우스 스타일 (기존 `DRAFT_SYSTEM`에서 계승)

Writer·Editor는 아래를 그대로 따른다(chaos에 이미 박혀 있는 톤·AI탈피 규칙):
- 1인칭("나") 시점, 담백·진솔한 개발자 블로그 톤. 과장·홍보·낚시 금지.
- 재료(atom/초안)에 없는 사실 날조 금지. 맥락 안에서만 풀어 쓴다.
- 번역투 금지("~에 대해"→목적격 직결, "~를 통해" 남발 금지, "가지다" 직역 금지, 이중피동 "~되어진다" 금지, "~에 의해" 피동 지양).
- 영어식 대명사("그/그것/그들") 남발 금지. 한국어식으로 주어 생략·명사 받기.
- AI 상투어 금지(결론적으로/이를 통해/요약하면, 시사하는 바가 크다, 본질적으로, hype 어휘, "~할 때다" 결말 공식).
- 구조 패턴 금지(콜론 부제 헤딩 "X: Y", 먼저·반면·결국 3단 공식, 문두 접속사 남발, 이모지, 강조 남발).
- 추정 헤지 지양(단언 가능한 곳은 단언).
- 리듬: 종결어미 "~다" 4연속 금지, 단문·장문 섞기.
- 보존: 고유명사·제품명·수치·날짜·직접인용·코드·표준약어(LLM·API)는 그대로.

`humanize-korean` 체계와 충돌하지 않으며, Editor 단계에서 이 규칙으로 최종 점검.

---

## 5. 워크플로우

**주제 모드**
```
Planner(각도·아웃라인) →〔종환님 아웃라인 합의〕→ Researcher(atom 발췌)
  → Writer ↔ Diagrammer(마커 삽입) → Editor(검수+AI티 제거)
  → Publisher: POST /api/posts (초안) →〔종환님 승인〕→ /publish → 공개 URL
```

**초안 모드**
```
Planner(구조 재배치) →〔Researcher 선택〕→ Writer(재구성)
  →〔Diagrammer 선택〕→ Editor → Publisher(초안) →〔승인〕→ 발행
```

승인 게이트: Publisher가 초안 등록 후 미리보기(관리 화면 또는 본문 요약)를 종환님께 제시.
종환님이 "발행"하면 Publisher가 `/publish` 호출.

---

## 6. 빌드 산출물 (구현 담당이 만들 것)

1. **스킬:** `dotfiles/claude/skills/chaos-blog/SKILL.md`
   - 트리거 `/chaos-blog`(+자연어), 모드 판별, 팀 스폰·task list·mailbox 오케스트레이션(write-girls 구조 참고).
   - lead=Planner 겸임. teammate 스폰: researcher/writer/diagrammer/editor/publisher.
2. **에이전트 역할 정의:** 각 teammate role 정의(시스템 프롬프트). `.claude/agents/` 또는 스킬 내 인라인 — 빌드 담당이 프로젝트 관례에 맞춰 결정.
3. **chaos 인증 연동:** §3 인증 확정 후 Publisher에 주입.

### 빌드 담당이 반드시 검증할 항목 (가정 금지)
- [ ] chaos auth 미들웨어의 정확한 헤더/시크릿 주입 방식(`api.mjs`).
- [ ] 다이어그램 생성 엔드포인트(마커 `chaos-diagram:<id>`에 쓸 id 발급 경로).
- [ ] `createPost`가 만드는 post의 기본 status가 draft인지(컬럼 default 확인).
- [ ] Researcher의 atom 조회 경로(MCP 공개 엔드포인트 vs 로컬 psql) 중 스킬에서 쓸 것 확정.
- [ ] Agent Teams API(teammate 스폰/mailbox/task list) 현행 사용법 — 기존 `write-girls`가 삭제됐으므로 git 이력에서 패턴 복원 가능.

---

## 7. 참고: 기존 기능과의 관계
chaos엔 이미 `POST /api/posts/draft`(고른 atom → Gemini 단발 초안)와 수동 작성 UI(`sb_write.jsx`, Toast UI 에디터)가 있다.
`/chaos-blog` 팀은 이를 대체/증폭하는 **멀티 에이전트 버전**이다: 리서치(본인 atom 근거) + 다이어그램 + 휴머나이즈 + 편집 통제 + 초안-승인 게이트를 갖춘 본격 집필 파이프라인.
