#!/usr/bin/env bash
# devops 세션 런처 — smug 로 구조 생성 + pane 라벨(@host)/border 를 race-free 로 설정.
# (send-keys 로 pane 셸에 라벨을 심으면 갓 생성된 셸에서 유실되므로,
#  세션이 다 만들어진 뒤 컨트롤러에서 pane 을 직접 지정해 설정한다 — 원본 devops.sh 와 같은 원리.)
# 사용:  devops   (alias)  또는  ~/.tmux/smug-devops.sh
set -u
S=devops

# 구조 생성 (없으면 만들고, 있으면 그대로). --detach: 클라이언트 안 뺏김.
smug start "$S" --detach >/dev/null 2>&1

# 라벨이 필요한 창: border + pane index 별 @host.  "index:host" 쌍.
label() {
  local win="$1"; shift
  tmux set-option -w -t "$S:$win" pane-border-status top 2>/dev/null
  tmux set-option -w -t "$S:$win" pane-border-format ' #{@host} ' 2>/dev/null
  local pair
  for pair in "$@"; do
    tmux set-option -p -t "$S:$win.${pair%%:*}" @host "${pair#*:}" 2>/dev/null
  done
}
label kt-star-was-deploy 1:star-1 2:star-2
label kt-star-was-log    1:star-1 2:star-1 3:star-2 4:star-2

# 첫 창으로 이동 후 attach/switch
tmux select-window -t "$S:r2d2" 2>/dev/null
if [ -n "${TMUX:-}" ]; then
  tmux switch-client -t "$S"
else
  tmux attach -t "$S"
fi
