# SETUP

새 PC에서 `~/.claude`를 이 repo에 연결한다.

```bash
git clone git@github.com:JongDeug/dotfiles.git ~/어디든
~/어디든/ai/setup.sh
```

끝이다. clone 위치는 상관없다 — 스크립트가 자기 위치로 repo를 찾는다.

`ai/setup.sh`는 **몇 번 돌려도 안전하다.** 스킬이나 에이전트를 새로 만들었으면 그냥 다시 돌리면 된다. 갯수를 세거나 이름을 나열하지 않고 있는 것을 전부 링크하므로, 뭘 추가해도 이 문서를 고칠 일이 없다.

```bash
./ai/setup.sh          # 연결 (+ 결과 요약)
./ai/setup.sh --check  # 손대지 않고 현재 상태만 점검
```

심링크가 아닌 실물이 이미 자리에 있으면 **건너뛰고 경고한다** — 남의 파일을 지우지 않는다. 그 경우 종료코드 1.

## 연결 규칙

스크립트는 **이름을 나열하지 않는다.** 규칙 두 개만 안다:

```
ai/**/skills/<name>/       →  ~/.claude/skills/<name>        개별
ai/**/agents/<name>.md     →  ~/.claude/agents/<name>.md     개별
ai/**/commands/<name>.md   →  ~/.claude/commands/<name>.md   개별

ai/claude/telegram         →  ~/.claude/channels/telegram    (이름만 다른 유일한 예외)
ai/claude/<그 외>           →  ~/.claude/<같은 이름>            통째로
```

그래서:

- 스킬·에이전트·커맨드를 **몇 개 만들든** 다시 돌리기만 하면 된다
- `ai/shared/` 아래 **새 묶음**을 만들어 그 안에 `agents/`·`commands/`를 둬도 자동으로 잡힌다 (harness 경로가 박혀있지 않다)
- `ai/claude/`에 `mcp.json`이든 `output-styles/`든 **새로 넣으면 이름 그대로** 연결된다

`skills`·`agents`·`commands`가 개별 심링크인 이유는 여러 출처가 한 자리로 모이기 때문이다. `skills`는 추가로, 외부 스킬(gstack 등)이 `~/.claude/skills/`에 자기 것을 설치하므로 repo를 통째로 걸면 설치물이 repo로 샌다.

> **스킬 내부는 건드리지 않는다.** 스킬이 자기 자산으로 `agents/`나 `commands/`를 갖는 경우가 있어서(`upbit-openapi-skill/agents/openai.yaml`), 스킬 디렉토리 안으로는 내려가지 않는다.

노출 심링크는 repo에 커밋돼 있지 않다. 전부 이 스크립트가 만든다.

## 전제 조건

- 평범한 `git clone`이면 된다 (submodule 없음).
- **`jq`** — `statusline.sh`가 이걸로 Claude Code 입력 JSON을 파싱한다. 없으면 상태줄이 빈 줄로 뜬다 (`brew install jq`).
- **`ponytail` 플러그인** — `settings.json`의 `enabledPlugins`로 자동 설치되지만 첫 세팅 땐 아직 안 받아졌을 수 있다. 스킬 목록에 ponytail 패밀리가 없으면 `/plugin` → Marketplaces에서 수동 설치. harness의 dev·ops가 런타임에 불러 쓴다.

## 선택 1 — gstack

[gstack](https://github.com/garrytan/gstack)은 marketplace 배포가 없어 `enabledPlugins`로 못 받고, 이 repo에 벤더링하지도 않는다. 내 설정이 아닌 데다 `browse`의 실행 바이너리는 어차피 각 머신에서 빌드해야 한다. 쓸 머신에서만 직접 깐다:

```bash
git clone https://github.com/garrytan/gstack ~/.claude/skills/gstack
~/.claude/skills/gstack/setup      # bun 필요
```

`setup`이 자기 부모(`~/.claude/skills/`)에 `gstack-*`를 만든다. 그 자리가 실제 디렉토리라서 설치물이 dotfiles로 새지 않는다. 업데이트는 `cd ~/.claude/skills/gstack && git pull && ./setup`.

목록이 길면 안 쓰는 `gstack-*`를 지운다 (`setup` 재실행 시 되살아난다). **안 깔아도 나머지는 전부 정상 동작한다.**

## 선택 2 — 텔레그램

`ai/setup.sh`가 `~/.claude/channels/telegram` 링크는 항상 걸어둔다(심링크일 뿐 아무것도 실행하지 않는다). 실제로 봇을 쓰려면 `settings.json`에서 telegram 플러그인을 켜고, 봇 토큰 등은 `~/.claude/channels/telegram/.env`에 둔다 — **`.env`는 이 repo에 커밋하지 않는다** (dotfiles는 public이다).

훅 스크립트(`scripts/*.sh`)의 실체는 여기다. 예전엔 `personal-harness` repo가 원본이고 이쪽이 낡은 사본이었는데, 봇 머신의 `~/.claude/channels/telegram/scripts/`가 이 repo를 가리키도록 통합했다.

## 선택 3 — herdr

[herdr](https://herdr.dev)는 에이전트용 터미널 워크스페이스 매니저다. 키맵은 `herdr/config.toml`에 있고, `~/.config/herdr/config.toml`로 심링크한다(`ai/setup.sh`가 아니라 손으로 — 자세한 건 [README](../README.md#새-pc-세팅)).

`ai/claude/hooks/herdr-agent-state.sh`는 **herdr가 설치·관리하는 파일**이다. Claude Code의 `SessionStart` 훅으로 돌면서, 그 페인의 Claude가 어떤 대화 세션인지(`session_id`, `transcript_path`)를 herdr 소켓에 보고한다 — herdr 서버가 재시작돼도 각 페인의 대화가 되살아나는 게 이것 덕분이다. `settings.json`의 `SessionStart` 항목이 짝이다.

**직접 편집하지 않는다.** 새 PC나 herdr 업데이트 후에는 다시 깔면 된다:

```bash
herdr integration install claude   # 현재 v7
herdr integration status           # 버전 확인
```

herdr를 안 쓰는 머신에서는 이 훅이 조용히 빠진다(`$HERDR_ENV`가 없으면 즉시 종료). **없어도 나머지는 전부 정상 동작한다.**

## 확인

`./ai/setup.sh --check`가 링크 상태를 판정한다. 그 외에 **새 세션을 열고** 눈으로 볼 것:

- `/harness` 커맨드와 `harness-*` 서브에이전트가 보이는지
- 자작 스킬과 ponytail 패밀리가 스킬 목록에 보이는지
- dotfiles 바깥 아무 디렉토리에서도 똑같이 보이는지 — cwd와 무관한 전역 설정이다

기존 세션은 시작 시점에 목록을 로드하므로 재시작해야 반영된다.

## 첫 실행 (harness)

```
/harness ai/shared/harness/specs/hello-world-api.md
```

repo에는 spec만 있고 구현체는 없다 — 이 실행에서 Dev가 spec대로 처음부터 만드는 과정이 그대로 보인다. `LEARNING.md`와 `telemetry.jsonl`(spec과 같은 디렉토리)은 이때 채워진다.
