# hello-world-api

## Goal

harness 파이프라인(Planner→Dev→QE→Ops)이 실제로 동작하는지 검증하기 위한 최소 토이 API.

## Requirements

- `GET /hello` — 응답: `{"message": "Hello, World!"}` (상태코드 200)
- `GET /hello?name=Alice` — 응답: `{"message": "Hello, Alice!"}` (상태코드 200)
- `GET /health` — 응답: `{"status": "ok"}` (상태코드 200)
- 정의되지 않은 경로 — 상태코드 404
- 포트는 `PORT` 환경변수, 기본값 3000
- 새 의존성 추가 금지 — Node 내장 `http` 모듈 또는 이미 있는 `package.json`의 의존성만 사용. 테스트는 `node --test` 사용

## Acceptance Criteria

- `node --test`가 전부 통과한다
- 앱을 띄운 상태에서 `curl -s localhost:$PORT/hello` → `{"message":"Hello, World!"}`
- `curl -s "localhost:$PORT/hello?name=Alice"` → `{"message":"Hello, Alice!"}`
- `curl -s localhost:$PORT/health` → `{"status":"ok"}`
- `curl -s -o /dev/null -w "%{http_code}" localhost:$PORT/nope` → `404`
