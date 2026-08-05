#!/usr/bin/env bash
# tmux cheat sheet — 이 설정(.tmux.conf)에 실제로 바인딩된 키만 정리.
# 터미널에서: tcheat   |   tmux 안에서: prefix + ?  (display-popup)
# 넓은 화면이면 2단(좌우) 배치로 한 화면에 다 들어오게, 좁으면 1단.
# 색상은 Catppuccin Mocha (truecolor). prefix = C-Space.

set -u

# ── 팔레트 (truecolor) ──────────────────────────────────────────────
c() { printf '\033[38;2;%sm' "$1"; }
b() { printf '\033[48;2;%sm' "$1"; }
R=$'\033[0m'; BOLD=$'\033[1m'
MAUVE='203;166;247'; GREEN='166;227;161'; TEXT='205;214;244'
SUB='166;173;200'; PEACH='250;179;135'; RED='243;139;168'
SURFACE='69;71;90'; BASE='30;30;46'

CG=$(c "$GREEN"); CT=$(c "$TEXT"); CM=$(c "$MAUVE"); CS=$(c "$SUB"); CR=$(c "$RED")

# prefix 는 가능하면 tmux 에서 실시간으로 읽고, 없으면 C-Space
PREFIX="C-Space"
if [ -n "${TMUX:-}" ] && command -v tmux >/dev/null 2>&1; then
  p=$(tmux show -gv prefix 2>/dev/null)
  [ -n "$p" ] && PREFIX="C-${p#C-}"
fi

# ── 한 줄 포맷터 (문자열을 반환) ────────────────────────────────────
H()  { printf '  %s%s%s%s' "$CM" "$BOLD" "$1" "$R"; }             # 섹션 헤더
K()  { printf '    %s%s%-13s%s %s%s%s' "$CG" "$BOLD" "$1" "$R" "$CT" "$2" "$R"; }  # 키/설명
N()  { printf '    %s%s%s %s%s%s' "$CR" "$1" "$R" "$CS" "$2" "$R"; }               # 참고
SUBL(){ printf '      %s%s%s' "$CS" "$1" "$R"; }                  # 들여쓴 부연

# ── 좌측 블록 (Panes / Windows / Sessions) ──────────────────────────
LEFT=(
  "$(H 'PANES  분할·이동·리사이즈')"
  "$(K 'prefix | / -' '좌우 / 상하 분할 (cwd 유지)')"
  "$(K 'prefix hjkl' '왼·아래·위·오른쪽 pane 이동')"
  "$(K 'C-hjkl' 'vim ↔ tmux 이동 (prefix 없이)')"
  "$(K 'prefix HJKL' 'pane 크기 조절 (5칸)')"
  "$(K 'prefix z' 'pane 확대/복귀 (에이전트 크게)')"
  "$(K 'prefix e' 'sync-panes 토글 (동시 입력)')"
  "$(K 'prefix x' '현재 pane 닫기')"
  ""
  "$(H 'WINDOWS  창')"
  "$(K 'prefix c' '새 window (cwd 에서)')"
  "$(K 'M-← / M-→' '이전 / 다음 window (prefix 없이)')"
  "$(K 'prefix 1-9' '번호로 window 이동')"
  "$(K 'prefix ,' 'window 이름 변경')"
  "$(K 'prefix &' 'window 닫기')"
  ""
  "$(H 'SESSIONS  세션')"
  "$(K 'prefix s' '세션 목록·전환')"
  "$(K 'prefix d' 'detach')"
  "$(K 'prefix S / R' '세션 저장 / 복원 (resurrect)')"
  "$(N '↺' 'continuum 15분마다 자동 저장·복원')"
)

# ── 우측 블록 (Copy / Tools / Agent) ────────────────────────────────
RIGHT=(
  "$(H 'COPY MODE  복사, vi 키')"
  "$(K 'prefix [' 'copy mode 진입  ·  q 나가기')"
  "$(K 'v / Space' '선택 시작')"
  "$(K 'y' '복사 → OS 클립보드 (OSC52)')"
  "$(K '/ 또는 ?' '아래로 / 위로 검색')"
  "$(K '마우스 드래그' '드래그만으로 복사')"
  ""
  "$(H 'TOOLS / POPUP  팝업')"
  "$(K 'prefix g' 'lazygit')"
  "$(K 'prefix G' 'git worktree → 열면 claude 자동')"
  "$(SUBL '└ Enter=분할 · C-w=새창 · C-d=삭제')"
  "$(K 'prefix p' 'window 점퍼 (에이전트 목록→점프)')"
  "$(K 'prefix r' '설정 리로드')"
  "$(K 'prefix ?' '이 치트시트')"
  ""
  "$(H 'AGENT-FRIENDLY  에이전트 팁')"
  "$(N '●' '완료(BEL) 시 상태줄 붉은 ● + OS 알림')"
  "$(N 'p' 'prefix p 로 대기중(🔔) 에이전트로 점프')"
  "$(N 'z' 'prefix z 로 에이전트 pane 확대')"
  "$(N 'e' 'prefix e 로 여러 pane 에 동시 명령')"
  "$(N 'G' 'worktree 를 pane 으로 병렬 실행')"
)

hr() { printf '  %s────────────────────────────────────────────────────────────────────────%s\n' "$(c "$SURFACE")" "$R"; }

cols=${COLUMNS:-$(tput cols 2>/dev/null || echo 80)}
clear 2>/dev/null || true
printf '\n  %s%s%s tmux cheat sheet %s   %sprefix = %s%s%s%s   ·  |,- 분할 · hjkl 이동%s\n\n' \
  "$(b "$MAUVE")" "$(c "$BASE")" "$BOLD" "$R" "$CS" "$(c "$PEACH")" "$BOLD" "$PREFIX" "$CS" "$R"

if [ "$cols" -ge 140 ]; then
  # ── 2단: 좌측은 순차 출력, 우측은 절대 위치(\033[r;cH)로 겹쳐 그리기 ──
  RCOL=80          # 우측 컬럼 시작 열
  start=4          # 컬럼 시작 행 (제목 3줄 다음)
  r=$start; for line in "${LEFT[@]}";  do printf '\033[%d;1H%s'  "$r" "$line"; r=$((r+1)); done; lend=$r
  r=$start; for line in "${RIGHT[@]}"; do printf '\033[%d;%dH%s' "$r" "$RCOL" "$line"; r=$((r+1)); done; rend=$r
  end=$(( lend > rend ? lend : rend ))
  printf '\033[%d;1H\n' "$end"
else
  # ── 1단: 좌·우 블록을 위아래로 ──
  for line in "${LEFT[@]}";  do printf '%s\n' "$line"; done
  printf '\n'
  for line in "${RIGHT[@]}"; do printf '%s\n' "$line"; done
fi
printf '\n'; hr

# tmux 팝업(display-popup -E)으로 떴을 때만 키 대기.
if [ -n "${TMUX:-}" ] && [ -t 0 ] && [ "${TMUX_CHEAT_WAIT:-}" = "1" ]; then
  printf '  %s아무 키나 누르면 닫힘…%s' "$CS" "$R"
  read -rsn 1
fi
