# CLAUDE.md (프로젝트 템플릿)

> 이 파일을 프로젝트 루트에 `CLAUDE.md`로 복사하여 사용한다.
> 조직 harness(`dotfiles/AGENTS.md`)의 기본값을 오버라이드하거나 보충하는 용도.

## 프로젝트 개요

- **프로젝트명**: (e.g. medichis-api)
- **설명**: (한 줄 요약)
- **기술 스택**: (e.g. NestJS + PostgreSQL + Redis)
- **패키지 매니저**: (e.g. pnpm)

## 실행 환경

```bash
# 개발 서버
pnpm dev

# 테스트
pnpm test

# 빌드
pnpm build

# lint
pnpm lint
```

## 프로젝트 고유 규칙

> 조직 AGENTS.md와 다른 부분만 기술한다. 명시하지 않은 항목은 AGENTS.md를 따른다.

### 디렉토리 구조

```
src/
├── modules/       # (프로젝트별 모듈 구조 설명)
├── common/
└── ...
```

### DB

- ORM: (e.g. Prisma, TypeORM)
- 마이그레이션: (e.g. `pnpm prisma migrate dev`)

### 환경 변수

- `.env.example` 참조
- 필수 변수: (목록)

### 외부 서비스 연동

- (e.g. AWS S3, Firebase, 결제 API 등 — 연동 방식 간략 기술)

## 주의사항

- (이 프로젝트에서 특별히 조심해야 할 것. e.g. "payments 모듈은 수정 전 반드시 확인", "legacy API는 v1/ 하위만 수정 가능")
