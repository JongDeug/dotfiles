---
name: portfolio
description: 포트폴리오 이미지 생성 스킬. `/portfolio`, "포트폴리오 이미지", "portfolio masked/full" 등의 요청에서 반드시 트리거한다. LINK 보유량/총자산 포트폴리오 스냅샷을 PNG 로 생성해 텔레그램으로 전송한다. masked(공유용) / full(개인용) 두 모드 지원.
owner: jongdeug
allowed-tools: Bash, Read, mcp__plugin_telegram_telegram__reply
---

# portfolio — 포트폴리오 이미지 생성

포트폴리오 이미지를 생성하여 텔레그램으로 전송한다.

## 인자

- `masked` 또는 인자 없음: 보유량/총자산 마스킹 (공유용)
- `full`: 모든 정보 노출 (개인 확인용)

## 실행 절차

1. 인자 파싱:
   - `full` 이면 `--full` 플래그
   - 그 외(빈 값, `masked`) 는 `--masked` 플래그

2. 스크립트 실행:
```bash
node /home/jongdeug/.claude/channels/telegram/jongdeug/scripts/portfolio_masked.js [--masked|--full] /tmp/portfolio_output.png
```

3. 생성된 이미지를 텔레그램 reply 로 전송 (chat_id: 5270356206 DM 또는 호출 채널)

## 마스킹 규칙
- **마스킹 모드**: LINK 시세(현재가, 등락률)만 노출. 보유량·총자산 KRW·스테이킹/유동 수량은 `***` 처리
- **풀 모드**: 모든 정보 노출

## 호출 트리거

`/portfolio`, `/portfolio@<botname>`, `/portfolio full`, "포트폴리오 이미지 줘", "마스킹 포폴" 등 슬래시/자연어 모두 이 스킬로 처리한다.
