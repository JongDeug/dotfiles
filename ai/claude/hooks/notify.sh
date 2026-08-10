#!/usr/bin/env bash
# notify.sh — Claude Code Notification 훅
# 알림 클릭 시 해당 tmux 세션으로 이동 (Windows/WSL, Mac, Linux 호환)

set -euo pipefail

INPUT=$(cat)
MESSAGE=$(echo "$INPUT" | grep -o '"message"\s*:\s*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/' | head -1 || true)
[ -z "$MESSAGE" ] && MESSAGE="${NOTIFY_DEFAULT_MSG:-Claude Code 작업 완료}"

# NOTIFY_ONLY_BG=1 이면 "지금 보고 있는 창"은 조용히 넘김 (Stop 훅용).
# 이 에이전트의 tmux 창이 활성 & 세션에 클라이언트가 붙어 있으면 = 사용자가 보는 중 → skip.
if [ "${NOTIFY_ONLY_BG:-0}" = "1" ] && [ -n "${TMUX:-}" ] && command -v tmux &>/dev/null; then
  _wa=$(tmux display -p -t "${TMUX_PANE:-}" '#{window_active}' 2>/dev/null || echo 0)
  _sa=$(tmux display -p -t "${TMUX_PANE:-}" '#{session_attached}' 2>/dev/null || echo 0)
  if [ "$_wa" = "1" ] && [ "$_sa" != "0" ]; then
    exit 0
  fi
fi

TITLE="Claude Code"
SESSION_NAME=""
WINDOW_NAME=""
TMUX_CONTEXT=""

# --- tmux 컨텍스트 (훅이 실행된 pane 기준으로 조회) ---
WINDOW_INDEX=""
if command -v tmux &>/dev/null && [ -n "${TMUX:-}" ]; then
  SESSION_NAME=$(tmux display-message -p -t "${TMUX_PANE:-}" '#S' 2>/dev/null || true)
  WINDOW_NAME=$(tmux display-message -p -t "${TMUX_PANE:-}" '#W' 2>/dev/null || true)
  WINDOW_INDEX=$(tmux display-message -p -t "${TMUX_PANE:-}" '#I' 2>/dev/null || true)
  TMUX_CONTEXT="[$SESSION_NAME:$WINDOW_NAME]"
  tmux display-message -d 5000 "$TMUX_CONTEXT $TITLE: $MESSAGE" 2>/dev/null || true
fi

# --- OS 감지 ---
detect_os() {
  if [[ "$(uname -r)" == *microsoft* || "$(uname -r)" == *Microsoft* ]]; then
    echo "wsl"
  elif [[ "$(uname)" == "Darwin" ]]; then
    echo "mac"
  else
    echo "linux"
  fi
}

OS=$(detect_os)

# --- tmux 세션 전환 명령 생성 ---
build_tmux_switch_cmd() {
  local cmd="" target=""
  # 창 index 로 정확히 지정 (이름 중복에도 안전)
  if [ -n "$SESSION_NAME" ] && [ -n "$WINDOW_INDEX" ]; then
    target="${SESSION_NAME}:${WINDOW_INDEX}"
  elif [ -n "$SESSION_NAME" ] && [ -n "$WINDOW_NAME" ]; then
    target="${SESSION_NAME}:${WINDOW_NAME}"
  elif [ -n "$SESSION_NAME" ]; then
    target="${SESSION_NAME}"
  fi
  if [ -n "$target" ]; then
    cmd="tmux switch-client -t '${target}' 2>/dev/null || tmux select-window -t '${target}' 2>/dev/null"
  fi
  echo "$cmd"
}

TMUX_SWITCH_CMD=$(build_tmux_switch_cmd)

# --- OS별 알림 ---
case "$OS" in
  wsl)
    TOAST_TITLE="$TITLE ${TMUX_CONTEXT}"

    powershell.exe -NoProfile -Command "
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
      \$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
      \$xml.LoadXml('<toast><visual><binding template=\"ToastText02\"><text id=\"1\">$TOAST_TITLE</text><text id=\"2\">$MESSAGE</text></binding></visual></toast>')
      [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code').Show([Windows.UI.Notifications.ToastNotification]::new(\$xml))
    " 2>/dev/null || true
    ;;
  mac)
    # terminal-notifier 지원 시 클릭으로 tmux 세션 전환
    if command -v terminal-notifier &>/dev/null; then
      if [ -n "$TMUX_SWITCH_CMD" ]; then
        terminal-notifier \
          -title "$TITLE ${TMUX_CONTEXT}" \
          -message "$MESSAGE" \
          -execute "bash -c '$TMUX_SWITCH_CMD'" \
          -sound default \
          -group "claude-${SESSION_NAME:-x}-${WINDOW_INDEX:-0}" 2>/dev/null || true
      else
        terminal-notifier \
          -title "$TITLE" \
          -message "$MESSAGE" \
          -sound default \
          -group "claude-${SESSION_NAME:-x}-${WINDOW_INDEX:-0}" 2>/dev/null || true
      fi
    else
      osascript -e "display notification \"$MESSAGE\" with title \"$TITLE ${TMUX_CONTEXT}\"" 2>/dev/null || true
    fi
    ;;
  linux)
    # gdbus 기반 알림 (클릭 액션 지원)
    if [ -n "$TMUX_SWITCH_CMD" ] && command -v gdbus &>/dev/null; then
      # gdbus 로 알림 + 액션 등록, 백그라운드에서 클릭 대기
      (
        NOTIFY_ID=$(gdbus call --session \
          --dest org.freedesktop.Notifications \
          --object-path /org/freedesktop/Notifications \
          --method org.freedesktop.Notifications.Notify \
          "Claude Code" 0 "" "$TITLE ${TMUX_CONTEXT}" "$MESSAGE" \
          '["open", "세션 이동"]' '{}' 10000 2>/dev/null \
          | grep -o '[0-9]*' | head -1)

        if [ -n "$NOTIFY_ID" ]; then
          # 10초간 액션 클릭 대기
          timeout 10 gdbus monitor --session \
            --dest org.freedesktop.Notifications \
            --object-path /org/freedesktop/Notifications 2>/dev/null \
          | while read -r line; do
              if echo "$line" | grep -q "ActionInvoked.*$NOTIFY_ID.*open"; then
                bash -c "$TMUX_SWITCH_CMD" 2>/dev/null || true
                break
              fi
            done
        fi
      ) &
      disown
    else
      notify-send "$TITLE ${TMUX_CONTEXT}" "$MESSAGE" 2>/dev/null || true
    fi
    ;;
esac
