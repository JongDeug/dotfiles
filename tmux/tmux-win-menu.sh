#!/usr/bin/env bash
# tmux display-menu 기반 window 점퍼 — 각 항목에 숫자(1~9, 이후 a,b…) 단축키.
# 번호만 누르면 해당 window 로 즉시 점프. tmux 안에서: prefix + p
# WINMENU_DRY=1 이면 display-menu 를 실행하지 않고 인자만 출력(테스트용).

set -u

current=$(tmux display -p '#{session_name}:#{window_index}')
cursess=$(tmux display -p '#{session_name}')

# 현재 세션 우선 정렬, 현재 window 는 제외. 각 행: target|name|cmd|bell|session
mapfile -t rows < <(
  tmux list-windows -a -F \
    '#{session_name}:#{window_index}|#{window_name}|#{pane_current_command}|#{?window_bell_flag,🔔 ,}|#{session_name}' \
  | awk -F'|' -v cur="$current" -v cs="$cursess" '$1 != cur {
      split($1, a, ":"); prio = (a[1] == cs) ? 0 : 1
      printf "%d\t%s\n", prio, $0
    }' \
  | sort -s -k1,1n | cut -f2-
)

if [ "${#rows[@]}" -eq 0 ]; then
  tmux display-message "이동할 다른 window 가 없습니다"
  exit 0
fi

keys="123456789abcdefghijklmnopqrstuvwxyz"
args=()
i=0
for row in "${rows[@]}"; do
  IFS='|' read -r target name cmd bell sess <<< "$row"
  key="${keys:i:1}"
  [ -z "$key" ] && break                      # 36개 초과분은 생략
  label="${bell}#[align=left]${target}  ${name}  #[fg=brightblack](${cmd})"
  args+=("$label" "$key" "switch-client -t '$sess' ; select-window -t '$target'")
  i=$((i + 1))
done

if [ "${WINMENU_DRY:-}" = "1" ]; then
  printf '%s\n' "${args[@]}"
  exit 0
fi

client_arg=()
[ -n "${WINMENU_CLIENT:-}" ] && client_arg=(-c "$WINMENU_CLIENT")   # 데모/테스트용
tmux display-menu "${client_arg[@]}" -T "#[align=centre] jump to window (번호 선택) " -x C -y C "${args[@]}"
