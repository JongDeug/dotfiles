---
name: chaos-blog
description: chaos 블로그(jongdeug.duckdns.org/blog/<slug>) 글쓰기 에이전트 팀. 종환님이 주제 또는 초안을 주면 researcher·writer·diagrammer·editor·publisher 팀원을 Agent Teams 로 스폰해 글을 집필하고 chaos posts 에 초안으로 등록, 승인 시 발행한다. 트리거는 `/chaos-blog`, "카오스 블로그 써줘", "블로그 글 써줘"(거점은 chaos). 메인 세션이 lead 겸 planner.
---

Base directory for this skill: ~/.claude/skills/chaos-blog

# chaos-blog — 글쓰기 에이전트 팀 (메인 세션이 lead + Planner)

종환님이 **주제** 또는 **초안**을 주면, 5역할 팀원이 협업해 chaos 블로그 글을 만들고
**초안(draft) 등록 → 종환님 승인 → 발행** 까지 진행한다. 메인 세션(토르)이 team lead 이자 Planner 를 겸한다.

## 트리거
- `/chaos-blog <주제>` — 주제 모드
- `/chaos-blog` + 초안 첨부/붙여넣기 — 초안 모드
- 자연어: "카오스 블로그 써줘", "블로그 글 써줘"(블로그 거점은 chaos 하나뿐). 주제/초안이 없으면 먼저 물어본다.

## 아키텍처
```
메인 세션 (lead + Planner 겸임)
├── teammate[researcher]   (chaos-blog-team, role: researcher)
├── teammate[writer]       (chaos-blog-team, role: writer)
├── teammate[diagrammer]   (chaos-blog-team, role: diagrammer)
├── teammate[editor]       (chaos-blog-team, role: editor)
└── teammate[publisher]    (chaos-blog-team, role: publisher)

Shared Task List
├─ T1 research        [researcher]              (주제 모드 필수 / 초안 모드 선택)
├─ T2 diagrams        [diagrammer]              (선택; diagram_specs 있을 때만)
├─ T3 write           [writer]   deps: T1,(T2)
├─ T4 edit            [editor]   deps: T3
└─ T5 publish-draft   [publisher] deps: T4
```
- teammate 타입은 모두 **`chaos-blog-team`**. 역할 분화는 spawn prompt 의 `role:` 줄.
- 아웃라인 확정·발행 승인은 lead 가 종환님께 직접 받는다(teammate 에 위임 금지).
- teammate 간 직접 message 허용(예: diagrammer→writer 마커 전달).
- 팀 cleanup 은 lead 전담.

## 사전 전제 (하나라도 빠지면 중단 후 보고)
1. `claude --version` ≥ 2.1.32 (현재 2.1.179 OK)
2. `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (settings.json 에 설정됨)
3. `~/.claude/agents/chaos-blog-team.md` 존재
4. chaos-api 가동: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/me` 가 401(가동) 응답
5. `/home/jongdeug/workspace/chaos/.env` 에 `SB_INTERNAL_SECRET`·`SB_OWNER_TELEGRAM_ID` 존재

```bash
claude --version
test -f ~/.claude/agents/chaos-blog-team.md && echo "agent OK"
curl -s -o /dev/null -w "chaos-api %{http_code}\n" http://localhost:3001/api/me
grep -qE "^SB_INTERNAL_SECRET=." /home/jongdeug/workspace/chaos/.env && echo "secret OK"
```

## 플로우

### 1. 입력 수집 & 모드 판별
- 주제 텍스트만 있으면 **주제 모드**. 초안(긴 글/파일)이 붙으면 **초안 모드**.
- 주제/초안이 전혀 없으면 종환님께 한 줄로 요청(주제 또는 초안).

### 2. 아웃라인 확정 — lead 직접
팀 스폰보다 **먼저** lead 가 아웃라인을 잡는다(아웃라인이 리서치 키워드·다이어그램 슬롯을 결정).
- 초안 모드면 원초안을 Read 해 구조를 재배치하는 방향으로.
- `outline_json` 구성:
```json
{
  "mode": "topic|draft",
  "working_title": "...",
  "angle": "이 글의 각도/타깃 독자",
  "sections": [{"heading": "## ...", "summary": "핵심 1~2줄"}],
  "research_keywords": ["...", "..."],
  "diagram_specs": [{"label": "...", "purpose": "...", "section": "## ..."}]
}
```
- `diagram_specs` 가 비면 diagrammer 는 스폰하지 않는다.
- 주제 모드는 research_keywords 필수. 초안 모드는 보강용(선택).

### 3. 아웃라인 승인 — 종환님께
요약만 제시(JSON 펼치지 말 것): 제목 / 각도 / 섹션 목록 / 다이어그램 N개 / 리서치 on·off.
- 텔레그램 세션이면 `mcp__plugin_telegram_telegram__reply` 로 묻는다(AskUserQuestion 은 텔레그램에서 응답 불가).
- "수정 필요"면 lead 가 outline_json 재작성 후 다시 승인 루프.

### 4. 팀 스폰 (chaos-blog-team)
승인 후 필요한 teammate 만 스폰. 이름 관례: `researcher`, `writer`, `diagrammer`, `editor`, `publisher`.
- 공통 인자: `role:`, `outline_json`
- 주제 모드: researcher 스폰. 초안 모드: 리서치 보강이 의미 있을 때만 researcher 스폰(아니면 생략).
- `diagram_specs` 있을 때만 diagrammer 스폰.
- writer/editor/publisher 는 항상.
- 모델 경량화가 필요하면 일부 teammate 만 `--model sonnet` 로 스폰(researcher/diagrammer 후보).

### 5. 태스크 정의 (shared task list)
| ID | subject | owner | blockedBy |
|----|---------|-------|-----------|
| T1 | research (atom 발췌·source_atom_ids) | researcher | - |
| T2 | diagrams 등록 → 마커 반환 | diagrammer | - |
| T3 | body_md 집필 → drafts 저장 | writer | T1,(T2) |
| T4 | 검수 + AI 티 제거 | editor | T3 |
| T5 | chaos 초안 등록 | publisher | T4 |
- 스폰 안 한 role 의 task 는 만들지 않고, T3 blockedBy 에서도 뺀다.
- 각 task description 에 해당 role 의 입력 인자를 전부 박아둔다.

### 6. draft_path 계산 (lead 전담)
- slug = working_title 소문자화(공백→`-`, 한글 유지).
- `Glob("~/.claude/drafts/chaos-blog/<slug>-v*.md")` 로 최대 버전 K → `draft_path = ~/.claude/drafts/chaos-blog/<slug>-v{K+1}.md` (없으면 v1).
- writer 에게 이 경로 그대로 전달(재계산 금지).

### 7. 실행 — 파이프라인
1. **T1 research** (주제 모드): researcher 가 `research_result`(source_atom_ids + evidence) 반환.
2. **T2 diagrams** (있으면, T1 과 병렬): diagrammer 가 `diagram_result`(마커 id 목록) 반환.
3. **T3 write**: lead 가 writer 에게 `topic/outline_json/research_result/diagram_result/draft_path`(초안 모드면 `draft_text` 도) 전달 → writer 가 저장 후 완료 JSON.
4. **T4 edit**: editor 에게 `draft_path/outline_json/research_result` 전달 → 검수 리포트.
   - editor 는 **im-not-ai 윤문 파이프라인**(taxonomy 탐지 → playbook 윤문 → content-fidelity 내용보존 → naturalness 자연스러움)을 적용한다. 참조: `~/.claude/skills/humanize-korean/references/{ai-tell-taxonomy,rewriting-playbook}.md`.
   - (선택) lead 가 더 강한 보증을 원하면, editor 통과본에 `humanize-korean` 스킬을 한 번 더 돌려 5인 파이프라인으로 교차검증할 수 있다(lead 가 Skill 로 실행). 과윤문 시 롤백.
   - `passed:false`/`fidelity_ok:false` 또는 critical 잔여면 **자동 재작업 금지**, 종환님께 보고.
5. **T5 publish-draft**: publisher 가 `POST /api/posts` 로 **초안 등록** → `{id, slug, preview}` 반환.

### 8. 승인 게이트 — 발행
lead 가 종환님께 미리보기(제목·요약·발췌 + 초안 URL 또는 본문 요약) 제시 후 "발행할까요?" 확인.
- 승인 → publisher 에게 발행 지시 → `POST /api/posts/<id>/publish` → 공개 URL `https://jongdeug.duckdns.org/blog/<slug>` 보고.
- 수정 요청 → publisher `PATCH /api/posts/<id>` 또는 writer 재집필(v+1) → editor 재검수 → 재미리보기.
- **승인 없이 발행 금지.**

### 9. 팀 cleanup (lead 전담)
- 발행/중단 시 각 teammate 에 shutdown 요청 → 전원 종료 확인 → team cleanup.
- orphan tmux 있으면 `tmux ls` → `tmux kill-session -t <name>`.

## 운영 팁
- **기다리기**: lead 가 teammate 결과를 안 기다리고 먼저 진행하려는 경향 → 필요 시 "Wait for teammates" 명시.
- **텔레그램**: 모든 사용자 확인/보고는 reply 툴로. AskUserQuestion 사용 금지(응답 불가).
- **시크릿**: 출력·로그에 `.env` 값 노출 금지.
- **1 세션 1 팀**: 기존 팀 cleanup 후 새 팀.

## 참조
- 팀원 정의: `~/.claude/agents/chaos-blog-team.md` (5 role 통합)
- chaos API: `~/workspace/chaos/apps/api/src/api.mjs`, `chaos-data.mjs`
- Agent Teams 문서: https://code.claude.com/docs/en/agent-teams
