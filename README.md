# personal-harness

개인 조직의 개발 표준, 설계 문서, 설정 파일을 관리하는 저장소입니다.

## 구조

```
.
├── AGENTS.md                    # AI 에이전트 협업 규칙 & 코드 컨벤션
├── ARCHITECTURE.md              # 기술 아키텍처 개요
├── docs/
│   ├── CODING_CONVENTION.md     # 코딩 컨벤션 상세
│   ├── DESIGN.md                # 디자인 시스템 가이드
│   ├── FRONTEND.md              # 프론트엔드 개발 가이드
│   ├── PLANS.md                 # 실행 계획 작성 가이드
│   ├── PRODUCT_SENSE.md         # 제품 판단 기준
│   ├── QUALITY_SCORE.md         # 코드 품질 기준
│   ├── RELIABILITY.md           # 안정성/모니터링 가이드
│   ├── SECURITY.md              # 보안 가이드라인
│   ├── PROJECT_CLAUDE_TEMPLATE.md # 프로젝트별 CLAUDE.md 템플릿
│   ├── design-docs/             # 설계 문서
│   │   ├── index.md
│   │   ├── core-beliefs.md
│   │   └── healthcheck-convention.md
│   ├── exec-plans/              # 실행 계획
│   │   ├── active/
│   │   ├── completed/
│   │   │   └── example-api-auth-refactor.md
│   │   └── tech-debt-tracker.md
│   ├── generated/               # 자동 생성 문서
│   │   └── db-schema.md
│   ├── product-specs/           # 제품 스펙
│   │   ├── index.md
│   │   └── new-user-onboarding.md
│   └── references/              # 외부 레퍼런스 (LLM 컨텍스트용)
│       ├── design-system-reference-llms.txt
│       ├── nixpacks-llms.txt
│       └── uv-llms.txt
├── config/
│   ├── aerospace/               # AeroSpace 윈도우 매니저 설정
│   ├── claude/                  # Claude Code 설정
│   │   ├── hooks/               # Claude Code 훅
│   │   │   └── notify.sh        # 작업 완료 시 tmux + OS 알림
│   │   ├── settings.json        # Claude Code 전역 설정 (훅, 플러그인 등)
│   │   └── skills/              # Claude Code 스킬 (로컬용)
│   │       ├── git-flow/
│   │       ├── gstack/          # (submodule) 헤드리스 브라우저 QA 스킬
│   │       ├── obsidian/
│   │       ├── refactor-chain/
│   │       ├── sync-readme/     # PostToolUse 훅 — README 구조 자동 동기화
│   │       ├── test-deploy/
│   │       └── write-tests/
│   ├── tmux/                    # tmux 설정
│   └── vscode/                  # VS Code 설정
└── plugins/                     # Claude Code 마켓플레이스 배포용
    ├── git-flow/
    ├── obsidian/
    ├── test-deploy/
    └── write-tests/
```

## 사용법

### 조직 가이드

각 프로젝트 repo에서 이 repo의 문서를 참조한다. 프로젝트별 `CLAUDE.md`에서 이 repo의 `AGENTS.md`를 기본값으로 삼고, 프로젝트 특화 규칙을 추가한다. 새 프로젝트 생성 시 `docs/PROJECT_CLAUDE_TEMPLATE.md`를 복사하여 사용한다.

### 설정 파일

`config/` 하위의 설정 파일들을 해당 도구의 설정 경로에 심링크하여 사용한다.

### Claude 설정 (로컬)

`config/claude/` 하위의 설정과 스킬을 `~/.claude/`에 심링크하여 사용한다.

```bash
ln -sfn /path/to/personal-harness/config/claude/settings.json ~/.claude/settings.json
ln -sfn /path/to/personal-harness/config/claude/skills ~/.claude/skills
ln -sfn /path/to/personal-harness/config/claude/hooks ~/.claude/hooks
ln -sfn /path/to/personal-harness/config/claude/statusline.sh ~/.claude/statusline.sh
```

#### 상태줄 (statusline)

`settings.json`의 `statusLine`이 `config/claude/statusline.sh`를 호출한다. Claude Code가 넘겨주는 JSON에서
프로젝트·브랜치·모델·컨텍스트·비용과 `rate_limits`(5시간/7일 사용률, 리셋 시각)를 뽑아 한 줄로 렌더링한다.

```
📁 chaos 🌿 develop*2 · Opus 5 1M(xhigh) · 🧠 6% 62k/1M · 💰 $1.03 · 5h █░░░░░░░░░ 11%(16m) · 7d █████████░ 91%(67h 46m)
```

게이지와 퍼센트는 사용률에 따라 색이 바뀐다 (`<50%` 초록 → `50~74%` 노랑 → `75~89%` 주황 → `≥90%` 빨강).
브랜치 뒤 `*2`는 커밋되지 않은 변경 파일 수, 괄호 안은 리밋 리셋까지 남은 시간(5분 미만이면 `곧`).

스타일은 `~/.claude/statusline.style`에 한 단어를 넣어 전환한다 (기본 `full`, 파일 없으면 기본값 사용).

| 스타일 | 구성 |
|--------|------|
| `full` | 위 예시 — 컨텍스트·비용 포함 1줄 |
| `classic` | 프로젝트·브랜치·모델·5h·7d 만 |
| `two` | 2줄 (아래줄에 12칸 게이지 + diff 라인수) |
| `minimal` | 5칸 게이지 초압축 1줄 |

기존 `ccburn collect` 사용량 수집은 스크립트 안에서 그대로 유지된다.

### Claude 스킬 (마켓플레이스 설치)

이 repo를 마켓플레이스로 등록하면 개별 스킬을 선택하여 설치할 수 있다.

```bash
# 1. 마켓플레이스 등록
claude plugin marketplace add https://github.com/JongDeug/personal-harness

# 2. 원하는 스킬만 골라서 설치
claude plugin install git-flow@personal-harness
claude plugin install obsidian@personal-harness
claude plugin install test-deploy@personal-harness
claude plugin install write-tests@personal-harness
```

| 플러그인 | 트리거 | 설명 |
|----------|--------|------|
| **git-flow** | `/feat`, `/finish-feat`, `/start-rc`, `/release`, `/hotfix` 등 | Git Flow 배포 플로우 자동화 |
| **obsidian** | `/obsidian` 또는 "옵시디언", "노트", "데일리" 등 | Obsidian vault CLI 관리 (macOS/Windows/WSL) |
| **test-deploy** | `/test-deploy` 또는 "테스트 결과 메일로 보내줘" 등 | 테스트 커버리지 결과 이메일 발송 |
| **write-tests** | `/write-tests` 또는 "테스트 작성" 등 | NestJS/TypeScript/Go 테스트 코드 작성 |

> `test-deploy` 사용 시 `.env`에 Gmail 앱 비밀번호 설정 필요 (`GMAIL_USER`, `GMAIL_APP_PASSWORD`)
> `obsidian` 사용 시 Obsidian 데스크탑 앱의 CLI 기능이 활성화되어 있어야 함

### Windows에서 clone 시 참고

`plugins/` 디렉토리의 파일들은 `config/claude/skills/`로의 심링크이다. Windows에서 심링크가 정상 동작하려면:

1. **개발자 모드 활성화**: 설정 > 개발자용 > 개발자 모드 ON
2. **Git 심링크 설정**:
   ```bash
   git config --global core.symlinks true
   ```
3. 이후 `git clone` 하면 심링크가 정상 복원된다.
