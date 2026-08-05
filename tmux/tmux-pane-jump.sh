#!/usr/bin/env bash
# fzf window 점퍼 — 모든 세션의 window 를 나열해 즉시 점프.
# tmux 안에서: prefix + p  (display-popup 로 실행)
# 벨 울린(에이전트 완료/입력대기) window 는 🔔 로 표시. 활성 pane 의 명령·경로도 함께.

set -u
command -v fzf >/dev/null 2>&1 || { echo "fzf 가 필요합니다"; sleep 1; exit 1; }

# 현재 window 는 목록에서 제외. 현재 세션(보통 main)을 맨 위로 정렬.
current=$(tmux display -p '#{session_name}:#{window_index}')
cursess=$(tmux display -p '#{session_name}')

target=$(tmux list-windows -a -F \
  '#{session_name}:#{window_index}|#{?window_bell_flag,🔔,·}#{?window_zoomed_flag,🔍,·}|#{window_name}|#{pane_current_command}|#{b:pane_current_path}|#{window_panes}' \
  | awk -F'|' -v cur="$current" -v cs="$cursess" '$1 != cur {
      split($1, a, ":"); prio = (a[1] == cs) ? 0 : 1
      extra = ($6 > 1) ? ("·" $6 "p") : ""
      printf "%d\t%-14s %s  %-19s %-11s %-22s %s\n", prio, $1, $2, $3, $4, $5, extra
    }' \
  | sort -s -k1,1n \
  | cut -f2- \
  | fzf --ansi --reverse \
        --prompt="jump ▸ " \
        --header="Enter: 해당 window 로 이동  ·  🔔=대기중  🔍=zoom  ·  Np=pane 수" \
  | awk '{print $1}')

[ -z "$target" ] && exit 0

sess="${target%%:*}"
win="${target#*:}"

tmux switch-client -t "$sess" 2>/dev/null
tmux select-window -t "$sess:$win" 2>/dev/null
