---
name: returnskills
description: 보유한 모든 스킬 목록을 예쁘게 정리해서 반환한다. `/skills`, `/returnskills`, "스킬 목록", "returnskills", "skills inventory" 등 어떤 형태로든 보유 스킬 목록 조회 요청이 오면 반드시 이 스킬을 사용한다. 텔레그램에서는 markdownv2 로 카테고리별 정리해서 reply.
allowed-tools: Bash, Read, mcp__plugin_telegram_telegram__reply
---

# returnskills — 보유 스킬 목록

이 세션에서 사용 가능한 스킬을 카테고리별로 정리해서 응답한다. **출력 템플릿은 아래 "출력 형식"을 그대로 따른다 (markdownv2 + 이모지 헤더 + 정렬).**

## 데이터 수집

### 1. 내 사용자 스킬 (`~/.claude/skills/`)

```bash
for d in /home/jongdeug/.claude/skills/*/; do
  name=$(basename "$d")
  desc=$(grep -m1 '^description:' "$d/SKILL.md" 2>/dev/null | sed 's/^description: *//')
  owner=$(grep -m1 '^owner:' "$d/SKILL.md" 2>/dev/null | sed 's/^owner: *//')
  echo "${name}|${desc}|${owner}"
done | sort
```

#### owner 필드에 따른 출력 규칙
- `owner` 필드가 없음 → **공통 스킬** (모든 유저에게 표시)
- `owner: jongdeug` → jongdeug 전용 → 이름 뒤에 `(jongdeug)` 태그 표시
- `owner: 0deug` → 0deug 전용 → 이름 뒤에 `(0deug)` 태그 표시

### 2. 플러그인/빌트인 스킬

세션 시작 시 system-reminder 로 주입되는 목록을 그대로 사용한다 (런타임 메타데이터, 파일 아님). 종환님 환경 기준 자주 보이는 항목:

- `telegram:configure`, `telegram:access` — 텔레그램 채널 설정/접근 제어
- `obsidian` — Obsidian vault 관리
- `claude-api` — Claude API/SDK 사용
- `update-config` — settings.json 설정
- `keybindings-help` — 키바인딩 커스터마이즈
- `loop`, `schedule` — 반복/예약 실행
- `simplify` — 코드 단순화 리뷰
- `code-review:code-review` — PR 리뷰
- `skill-creator:skill-creator` — 스킬 생성
- `claude-code-setup:claude-automation-recommender` — Claude Code 자동화 추천

세션 컨텍스트에 다른 스킬이 추가로 주입되어 있으면 그것도 포함한다.

## 출력 형식 (템플릿)

**반드시 markdownv2** 로 응답한다. 텔레그램 markdownv2 특수문자 이스케이프 규칙 준수:
- 이스케이프 필요: `_`, `*`, `[`, `]`, `(`, `)`, `~`, ` ``` `, `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!`
- description 안의 `.` `-` `(` `)` 등은 모두 `\` 로 이스케이프
- 이름(스킬명)에 있는 `_`, `-` 도 이스케이프
- 굵은 글씨는 `*텍스트*`, 코드는 \`텍스트\`

설명 길이는 *최대 80자* 로 truncate (그 이상이면 끝에 `…` 붙임).

### 풀 출력 템플릿

```
🗂 *Skills Inventory*
━━━━━━━━━━━━━━━━━━━

📦 *공통 스킬* · N개
┌─────────────────
│ `<name>`
│ ↳ <설명>
└─────────────────

🔧 *개인 스킬* · N개 (owner별)
┌─────────────────
│ `<name>` ⌁ <owner>
│ ↳ <설명>
└─────────────────

🔌 *플러그인 & 빌트인* · N개
┌─────────────────
│ `<name>` — <설명>
└─────────────────

━━━━━━━━━━━━━━━━━━━
🧮 *총 N개* · 📁 `~/.claude/skills/`
```

### 인자별 출력

- 인자 없음 → 풀 템플릿 (3개 카테고리 모두)
- `user` → 📦 + 🔧 만
- `plugin` → 🔌 만

## 응답 채널

- 텔레그램에서 호출된 경우: `mcp__plugin_telegram_telegram__reply` 로 응답
  - `format: "markdownv2"` 필수
  - 인입 메시지의 `chat_id`, `reply_to` (수신 메시지 id) 사용
  - 한 메시지가 4096자 초과하면 카테고리별로 끊어서 여러 part 로 전송
- CLI 직접 실행: 플레인 텍스트로 출력 (이스케이프 없이)

## 호출 트리거

`/skills`, `/returnskills`, `/skills@<botname>`, `/returnskills@<botname>`, "스킬 목록", "보유 스킬 보여줘", "skills inventory" 등 어떤 형태든 이 스킬로 처리한다.
