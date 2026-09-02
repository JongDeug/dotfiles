#!/usr/bin/env bash
# m1ucs devops 세션 — 순수 tmux (플러그인 없음).
# 사용:  m1   (alias)  또는  ~/Documents/dotfiles/tmux/m1.sh
# 호스트 추가 = HOSTS 에 "창이름:ssh-alias" 한 줄.
set -u
S=m1

# "창이름:ssh alias"  (ssh alias 는 ~/.ssh/config 의 Host)
HOSTS=(
  "dev:dev"
  "io:io"
)

# 이미 있으면 그냥 붙는다
if tmux has-session -t "$S" 2>/dev/null; then
  [ -n "${TMUX:-}" ] && exec tmux switch-client -t "$S" || exec tmux attach -t "$S"
fi

# 창 생성
first=""
for pair in "${HOSTS[@]}"; do
  win="${pair%%:*}"; host="${pair#*:}"
  if [ -z "$first" ]; then
    tmux new-session -d -s "$S" -n "$win" "ssh $host"
    first="$win"
  else
    tmux new-window -t "$S" -n "$win" "ssh $host"
  fi
  # pane 상단 border 에 호스트 라벨 (단일 pane 도 표시)
  tmux set-option -w -t "$S:$win" pane-border-status top
  tmux set-option -w -t "$S:$win" pane-border-format " $host "
done

tmux select-window -t "$S:$first"
[ -n "${TMUX:-}" ] && exec tmux switch-client -t "$S" || exec tmux attach -t "$S"
