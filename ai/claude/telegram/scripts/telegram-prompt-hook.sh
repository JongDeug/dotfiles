#!/bin/bash
# UserPromptSubmit hook: 텔레그램 메시지 감지 시 reply 규칙 주입
# 입력: stdin JSON {"session_id": "...", "prompt": "..."}
# 출력: JSON {"systemMessage": "..."} 또는 빈 출력

INPUT=$(cat)

PROMPT=$(echo "$INPUT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('prompt', ''))" 2>/dev/null)

# 텔레그램 메시지 아니면 패스
if ! echo "$PROMPT" | grep -q 'source="plugin:telegram:telegram"'; then
  exit 0
fi

python3 -c "
import json
msg = '''텔레그램 메시지입니다. 응답 규칙:

1. 모든 응답은 mcp__plugin_telegram_telegram__reply 툴로 전송합니다.
2. chat_id는 수신 메시지의 <channel> 태그 값을 그대로 사용합니다.
3. reply 호출 시 reply_to 에 수신 메시지의 message_id 를 반드시 넣습니다 (토픽 자동 귀속).
4. reply 호출 시 format: \"markdownv2\"를 사용합니다.
   - 코드블록(\`\`\`) 안: 이스케이프 불필요
   - 코드블록 밖: 특수문자(. ! - ( ) + = { } | ~ > # _) 앞에 백슬래시'''
print(json.dumps({'systemMessage': msg}))
"
