---
name: explain-diff-obsidian
description: Use when the user asks for a rich explanation of a code change, diff, branch, or PR AND wants it saved into their Obsidian vault. Produces an Obsidian note (Background / Intuition / Code / Quiz) using callouts, Mermaid diagrams, and foldable quiz answers. 트리거는 `/explain-diff-obsidian`, "옵시디언으로 이 변경 설명해줘", "이 PR 옵시디언 노트로 정리해줘".
---

# Explain Diff → Obsidian

Please make me a rich, interactive explanation of the specified code change **as an Obsidian note in my vault**.

## Where it goes (vault 연결)

Before writing, resolve the vault the same way the `obsidian` skill does:

1. **CLI 경로 탐색** — `which obsidian` 등으로 `OBSIDIAN_CLI` 를 찾는다. (obsidian 스킬의 "초기화" 섹션 규칙을 그대로 따른다.)
2. **Vault 선택** — `$OBSIDIAN_CLI vaults verbose` 로 목록을 얻고, vault 가 1개면 자동 선택(사용자에게 알림), 여러 개면 어디에 넣을지 물어본다.
3. 이미 이 대화에서 obsidian 초기화를 마쳤다면 그 선택을 재사용한다.

이 노트는 본문이 길고 코드블록·Mermaid·콜아웃이 많아서 `obsidian create content="..."` 로 넘기면 `\n`/따옴표 이스케이프가 깨지기 쉽다. 따라서:

- vault 경로를 얻는다: `$OBSIDIAN_CLI vault info=path vault=<선택된vault>`
- **Write 도구로 `.md` 파일을 vault 폴더에 직접 쓴다.** 폴더는 별도 지정이 없으면 vault 루트의 `explain-diff/` 로 하고, 파일명은 항상 오늘 날짜로 시작한다: `YYYY-MM-DD-explanation-<slug>.md` (시간순 정렬 + 어떤 변경인지 식별 목적).
- 저장 후 `$OBSIDIAN_CLI open path=explain-diff/<파일명>.md vault=<선택된vault>` 로 노트를 연다.

## 노트 프론트매터

파일 맨 위에 Obsidian properties 를 둔다:

```yaml
---
tags: [explain-diff, code-review]
created: <오늘 날짜 YYYY-MM-DD>
source: <PR URL / branch / commit 범위>
aliases: []
---
```

## Sections

- **Background**: Explain the existing system relevant to this change. (You should broadly explore surrounding code for this.) We don't know how much the reader already knows, so include a deep background for beginners (note that it can be skipped if the reader is already familiar), and then a more narrow background directly relevant to the change.
- **Intuition**: Explain the core intuition for the code change. The focus here is to explain the essence, not the full details. Use concrete examples with toy data. Use figures and diagrams liberally.
- **Code**: Do a high-level walkthrough of the changes to the code. Group/order the changes in an understandable way. Reference files with backtick paths and, where useful, `[[wikilinks]]` to related notes already in the vault.
- **Quiz**: Come up with five questions that test the reader's knowledge of this PR. Medium difficulty — hard enough that you actually need to understand the substance of the PR, but not gotchas. The goal is to let the reader confirm they've really understood.

## Obsidian formatting rules

- **표준 마크다운 노트**로 작성한다. HTML/CSS/JS 를 쓰지 말 것 — Obsidian 리딩 뷰에서 렌더되는 마크다운 기능만 사용한다.
- **목차**: 노트 상단에 `## 목차` 를 두거나, 사용자 vault 에서 자동 목차가 있으면 생략 가능. 섹션은 `##` 헤딩으로 나눈다.
- **콜아웃**을 적극 사용한다. 핵심 개념/정의는 `> [!note]`, 팁·직관은 `> [!tip]`, 중요한 엣지 케이스·주의는 `> [!warning]`, 요약은 `> [!abstract]`, 예시는 `> [!example]`.
- **다이어그램은 Mermaid 를 우선 사용한다** (Obsidian 네이티브 렌더링). ASCII 다이어그램 금지.
  - 소수의 다이어그램 "패밀리"를 골라 여러 사례에 재사용한다.
  - 컴포넌트 간 데이터 흐름/통신은 `flowchart` 또는 `sequenceDiagram` 으로. **반드시 예시 데이터를 노드/메시지에 넣는다.**
  - 상태 변화는 `stateDiagram-v2`, 순서·타임라인은 `sequenceDiagram` 이 유용하다.
  - UI 변화처럼 Mermaid 가 어색한 경우엔 마크다운 표나 콜아웃 안의 리스트로 "간단한 UI 목업"을 표현한다.
- **코드 워크스루**는 펜스드 코드블록(```` ```lang ````)을 쓴다. diff 를 보여줄 땐 ```` ```diff ```` 로 `+`/`-` 를 살린다.
- **퀴즈는 접이식 콜아웃으로 인터랙티브하게** 만든다 (Notion 토글의 Obsidian 대응):
  - 각 문제는 콜아웃 하나: `> [!question] 1. 질문 …`
  - 보기 4개는 각각 **접힌 중립 콜아웃**으로 나열한다. 펼치기 전에는 정답이 티 나지 않도록 **모든 보기에 같은 콜아웃 타입**(`> [!question]-`)을 쓴다. `[!success]`/`[!failure]` 를 보기 제목에 쓰면 아이콘 색으로 정답이 새므로 금지.
  - 보기를 펼치면 안에서 ✅ 정답 / ❌ 오답 여부와 이유(해설)를 보여준다.
  - 정답 위치는 문제마다 독립적으로 무작위화하고, 보기 길이도 균형 있게 해서 위치·길이로 정답을 추측하지 못하게 한다.

  예시(중첩 콜아웃, `>>` 로 한 단계 들여씀):

  ```markdown
  > [!question] 1. 이 변경에서 재시도 로직이 지수 백오프를 쓰는 이유는?
  >
  > > [!question]- A) 코드가 더 짧아져서
  > > ❌ 오답 — 길이가 목적이 아니다. 핵심은 …
  >
  > > [!question]- B) 동시 재시도가 서버를 다시 무너뜨리는 것을 막으려고
  > > ✅ 정답 — thundering herd 를 피하려고 간격을 지수로 늘린다. …
  >
  > > [!question]- C) 타임존 처리 때문에
  > > ❌ 오답 — 이 변경과 무관하다. …
  >
  > > [!question]- D) 로그를 줄이려고
  > > ❌ 오답 — 로깅은 그대로다. …
  ```

## Voice

- Please write with the clarity and flow of Martin Kleppmann, making it engaging and written in classic style. Transitions between sections should be smooth.

---

Adapted from Geoffrey Litt's "Explain Diff" gist (https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524).
HTML output variant: `[[explain-diff]]` (skill `explain-diff`). This variant targets an Obsidian vault instead, using native Mermaid + callouts + foldable quiz answers.
