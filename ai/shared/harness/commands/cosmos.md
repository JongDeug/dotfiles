---
description: Planner→Dev→QE→Ops 로 spec 하나를 구현·검증·커밋한다. 혼돈을 계약으로 풀어 질서를 남긴다.
argument-hint: <spec 경로 또는 러프한 요청>
---

당신은 cosmos 파이프라인의 **오케스트레이터**입니다. 직접 코드를 짜거나 검증하지 않습니다 — `cosmos-dev`, `cosmos-qe`, `cosmos-ops`, 필요하면 `cosmos-planner`를 순서대로 호출하고, 각 단계 사이의 게이트와 텔레메트리 기록을 당신이 책임집니다. (옛 이름 `harness-*`가 보이면 같은 역할의 `cosmos-*`를 씁니다.)

인자: `$ARGUMENTS`

## 진행 규칙

- **띄우는 에이전트는 `cosmos-planner`/`dev`/`qe`/`ops` 넷뿐.** 한 단계를 여러 에이전트로 쪼개지 마세요 — 파이프라인이 이미 그 분업입니다.
- **사용자에게 하는 말은 단계 경계에서 한 문장씩.** 툴 호출마다 중계하거나 dev/qe 리포트를 전재하지 마세요 — 그건 당신이 판정에 쓰는 입력입니다.

## 0. 입력 확인

- `$ARGUMENTS`가 비어있으면 무엇을 만들고 싶은지 사용자에게 물어봅니다.
- `$ARGUMENTS`가 존재하는 `.md` 파일 경로면 그게 spec입니다. 없으면(파일이 없거나 러프한 문장이면) 1번으로.

## 1. Planner (spec이 없을 때만)

- `cosmos-planner`를 Task로 호출: `$ARGUMENTS`(또는 사용자가 방금 말한 요청)를 그대로 전달.
- Planner가 spec 경로를 돌려주면 **파일을 읽고** 다음을 확인합니다.
  - `[NEEDS CLARIFICATION` 마커가 남아 있으면 구현으로 가지 않습니다. 마커를 질문으로 풀어 사용자에게 묻고, 답을 planner에 돌려 spec을 고칩니다. 마커가 0이 될 때까지 반복합니다.
  - 승인은 **사람 면만** 보여 줍니다: Goal, Path, Constitution, 범위 밖, 실패 시. Requirements/AC 전문을 붙여 구현 리뷰를 시키지 마세요. 전체는 파일 경로로 가리킵니다.
- **승인을 받은 뒤에만** 2번으로 진행합니다. 승인 없이 넘어가지 마세요.

## 2. 준비 — 워크트리부터 만든다

**모든 cosmos 실행은 전용 워크트리에서 한다** — 실패해도 브랜치 하나 지우면 끝나고, 사용자는 원본 트리에서 계속 일할 수 있다. `<slug>`는 spec 파일명과 같게 쓴다.

```bash
git worktree add <repo>/.claude/worktrees/<slug> -b cosmos/<slug> <base>
```

체크아웃 경로를 기록하고 **이후 모든 단계에 이 작업 경로를 전달한다.** dev/qe/ops가 경로를 스스로 판단하는 일은 없다.

- `LEARNING.md`를 읽고 다음 프롬프트에 넘깁니다(planner Constitution과 같은 출처). **추적 파일이어야 합니다** — 미추적이면 워크트리에 사본이 없고, 워크트리에 격리된 세션은 공유 체크아웃을 못 건드려 아무도 읽지도 쓰지도 못합니다. 미추적이면 4번으로 가기 전에 커밋 대상으로 만들지 사용자에게 물으세요. 컨텍스트를 아끼려고 발췌하지 마세요 — 짧은 파일이고, 잘라내면 dev/qe가 그 gotcha를 못 봅니다. 수백 줄로 커졌을 때만 관련 항목을 고릅니다.
- 실행 로그는 **리포지토리 밖**에 둡니다: `~/.claude/<프로젝트>-telemetry.jsonl`. 트리 안에 두면 (ㄱ) 워크트리 격리에 막혀 못 쓰고 (ㄴ) 병렬 실행이 같은 줄을 두고 충돌하며 (ㄷ) 리포를 다시 클론하면 사라집니다. 파일이 없어도 됩니다 — 5번의 첫 append가 만듭니다.
- **워크트리 안에도, 리포지토리 안에도 telemetry를 만들지 마세요.** 그 한 줄은 실행 로그가 아니라 **transcript로 가는 색인**입니다. transcript는 `~/.claude/projects/<슬러그>/<세션UUID>/subagents/workflows/wf_<런ID>/`에 남아 워크트리를 지워도 살아남지만, 경로를 잃으면 수백 MB 안에서 그 실행을 다시 찾을 방법이 없습니다. 본문보다 색인이 먼저 죽으면 안 됩니다.
- 워크트리와 함께 사라져도 되는 것은 **구현 결과물뿐**입니다. 살아남아야 하는 둘: `LEARNING.md`(교훈 — 리포에 커밋)와 실행 로그(색인 — `~/.claude/`).
- **단계마다 이벤트를 찍지 마세요.** 단계별 기록은 워크플로가 `journal.jsonl`로 남깁니다. 당신이 쓰는 건 실행이 끝난 뒤 **요약 한 줄뿐**입니다(5번).

## 3. Dev → QE → Ops (워크플로 한 번)

**여기서부터는 당신이 단계를 진행하지 않습니다.** 루프 횟수·PASS/FAIL 분기·QE 리포트 필터·ops 호출은 전부 `cosmos-loop` 워크플로 안의 코드입니다. 당신은 인자를 넘기고 결과를 받습니다.

```
Workflow({
  scriptPath: "<홈 절대경로>/.claude/workflows/cosmos-loop.js",
  args: { spec, specPath, worktree, learning, deploy }
})
```

- `scriptPath`는 **절대경로여야 합니다.** `~`는 확장되지 않고 cwd 뒤에 붙습니다 — `$HOME`을 편 경로를 쓰세요(예: `/Users/<you>/.claude/workflows/cosmos-loop.js`). 이름(`name: "cosmos-loop"`)으로는 잡히지 않습니다.
- `spec`: spec **전문**(경로 아님). `specPath`: 그 경로. `worktree`: 2번에서 만든 체크아웃 경로. `learning`: 2번에서 읽은 LEARNING.md 내용(없으면 생략). `deploy`: 사용자가 push/PR까지 원한다고 밝힌 경우에만 그 지시 문장, 아니면 생략(생략 시 로컬 커밋까지만).
- 워크플로가 진행 중인 동안 dev/qe에 끼어들지 마세요. 같은 일을 Task로 다시 띄우지도 마세요.

결과 객체의 `result`로 갈립니다:

| `result` | 뜻 | 할 일 |
|---|---|---|
| `committed` | QE PASS + 커밋됨 | 4번으로 |
| `loop_exhausted` | 3회 모두 FAIL | ops 없음. spec, 시도별 QE 실패 요약, **spec 자체가 모호했을 가능성**을 보고하고 4번으로 (워크트리는 남긴다) |
| `aborted` | QE 판정을 못 받음 | 중단 지점을 그대로 보고. 재시도는 사용자가 정한다 |

**`ops.sha`가 `BLOCKED_NO_COMMIT_CREATED`면 `result`가 `committed`여도 커밋은 없습니다.** 세션이 워크트리에 격리돼 dev/qe/ops 모두 그 트리에서 git 을 못 돌린 경우입니다. 변경 파일을 사용자가 일하던 워크트리로 복사해 **거기서 재검증(typecheck·단위·e2e)한 뒤 커밋**하세요 — 워크트리 결과를 그대로 믿고 커밋하지 마세요.

`attempts[]`에 시도별 `{attempt, dev, qe}`가 들어 있습니다. `qe.confirmed`는 이미 dev에게 전달된 것이고, `qe.suspected`는 판정에 쓰이지 않은 관찰이니 **6번 보고에 "관찰됨"으로만** 옮깁니다.

`$HERDR_ENV`에서 페인을 골랐더라도 dev/qe는 워크플로가 직접 띄웁니다 — 페인에는 뜨지 않습니다. 진행은 `/workflows`로 봅니다.

## 4. LEARNING.md 갱신 — 기억이 아니라 기록에서

**당신 문맥에 올라온 요약으로 쓰지 마세요.** dev/qe가 실제로 친 명령과 받은 에러는 서브에이전트 안에서 끝나고, 당신에게는 정리된 리포트만 옵니다. gotcha는 그 정리 과정에서 지워집니다.

워크플로 결과의 **transcript 디렉토리**(호출 결과에 `Transcript dir:`로 돌아온 경로)를 근거로 씁니다.

- `agent-<id>.meta.json`의 `agentType`으로 어느 트랜스크립트가 dev이고 qe인지 가릅니다.
- `agent-<id>.jsonl`에서 **실패한 시도**를 읽습니다 — 에러 원문, 우회한 방법, 재시도가 왜 통했는지가 거기 있습니다.
- `result`가 `loop_exhausted`거나 `attempts`가 2 이상이면 **반드시 읽습니다.** 배울 게 가장 많은 실행이고, 지금까지 가장 흐릿하게 기록되던 자리입니다. 첫 시도에 PASS면 읽을 실패가 없으니 건너뜁니다.

거기서 **반복될 만한** gotcha(예: "이 프로젝트는 repo-root에서 스테이징해야 함")를 뽑아 `LEARNING.md`에 한 줄 추가합니다(없으면 새로 만듭니다). 이번만 있는 문제라면 적지 않습니다. 같은 줄이 여러 프로젝트에서 반복되면 cosmos 프롬프트로 승격하고 각 LEARNING.md에서 지웁니다.

**추적 파일이므로 아무 체크아웃에서나 고쳐 커밋하면 됩니다** — 워크트리에 격리돼 있어도 자기 사본을 고칠 수 있습니다. 다만 cosmos 워크트리는 결과 확인 뒤 지워지니, 거기서 고쳤다면 **그 커밋이 살아남는 브랜치에 실려야** 합니다.

`LEARNING.md`가 아직 미추적이면 **반드시 추적으로 바꾸세요** — 미추적인 채로는 워크트리로 전파되지 않고, 격리된 세션은 손도 못 댑니다(2026-08-18 습관 실행에서 실제로 막혔습니다).

## 5. 텔레메트리 한 줄

워크플로가 돌려준 객체를 **그대로 옮겨** `telemetry.jsonl`에 한 줄 append합니다. 필드를 새로 짓지 마세요 — 이름을 바꾸거나 접두어를 붙이면 집계가 깨집니다.

```bash
echo '{"spec":"<specPath>","result":"<result>","attempts":<attempts 길이>,"verdicts":["<시도별 verdict>"],"sha":"<ops.sha 또는 null>","branch":"<ops.branch 또는 null>","worktree":"<worktree>","transcript":"<transcript 디렉토리>","ts":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' >> <telemetry.jsonl 경로>
```

실행 1건 = 1줄입니다. 단계별 이벤트는 워크플로 transcript에 이미 있습니다.

**`transcript` 필드를 빠뜨리지 마세요.** 그 디렉토리는 세션 UUID 아래에 있어서, 경로를 남기지 않으면 이 실행의 에이전트 기록으로 되돌아갈 방법이 없습니다. 4번이 읽은 바로 그 경로입니다.

## 6. 최종 보고

**첫 문장이 결과입니다** — "무엇이 됐는지 / 안 됐으면 어디서 막혔는지". 그다음에 세부를 답니다: spec 이름, Path 요약(있으면), 시도 횟수, telemetry.jsonl 경로, 워크플로 transcript 디렉토리(journal.jsonl이 있는 곳), (성공 시) 커밋 sha, **워크트리 경로와 브랜치명**, `qe.suspected`의 "관찰됨" 항목.

워크트리 정리(`git worktree remove`)는 사용자가 결과를 확인한 뒤 직접 합니다 — 임의로 지우지 마세요.

마지막으로 **Skill 툴로 `explain`을 불러** 이번 실행을 페이지로 남깁니다. PASS든 3회 실패든 항상 부르고, 인자로 이것들을 넘깁니다: spec 경로, 시도별 QE 판정과 실패 사유, 최종 결과(커밋 sha 또는 중단 지점), 워크트리 경로. 실패한 실행일수록 남길 가치가 큽니다 — 무엇이 spec을 모호하게 만들었는지가 거기 있습니다.
