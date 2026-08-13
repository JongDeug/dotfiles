#!/usr/bin/env bash
# Claude Code statusline
#   스타일 전환: ~/.claude/statusline.style 파일에 classic | full | two | minimal 중 하나
#   (환경변수 CLAUDE_STATUSLINE_STYLE 이 있으면 그쪽 우선)
set -uo pipefail

input=$(cat)

STYLE="${CLAUDE_STATUSLINE_STYLE:-}"
[[ -z $STYLE && -r ~/.claude/statusline.style ]] && STYLE=$(<~/.claude/statusline.style)
STYLE=${STYLE//[[:space:]]/}
STYLE=${STYLE:-full}

# ── 필드 추출 (TSV 1줄) ──────────────────────────────────────────────────────
IFS=$'\t' read -r cur_dir model_name effort ctx_pct ctx_tok ctx_size cost \
                 add del fh_pct fh_reset sd_pct sd_reset fast_mode \
  < <(printf '%s' "$input" | jq -r '[
        (.workspace.current_dir // .cwd // ""),
        (.model.display_name // "?"),
        (.effort.level // ""),
        (.context_window.used_percentage // 0),
        (.context_window.total_input_tokens // 0),
        (.context_window.context_window_size // 0),
        (.cost.total_cost_usd // 0),
        (.cost.total_lines_added // 0),
        (.cost.total_lines_removed // 0),
        (.rate_limits.five_hour.used_percentage // -1),
        (.rate_limits.five_hour.resets_at // 0),
        (.rate_limits.seven_day.used_percentage // -1),
        (.rate_limits.seven_day.resets_at // 0),
        (.fast_mode // false)
      ] | @tsv')

# ── 색상 ─────────────────────────────────────────────────────────────────────
DIM=$'\033[2m'; RST=$'\033[0m'; B=$'\033[1m'
col() { printf '\033[38;5;%sm' "$1"; }
GREY=$(col 245); BLUE=$(col 75); MINT=$(col 79); PURPLE=$(col 141)
GREEN=$(col 78); YELLOW=$(col 221); ORANGE=$(col 208); RED=$(col 203)

# 사용률 → 색
heat() {
  local p=$1
  if   (( p >= 90 )); then printf '%s' "$RED"
  elif (( p >= 75 )); then printf '%s' "$ORANGE"
  elif (( p >= 50 )); then printf '%s' "$YELLOW"
  else                     printf '%s' "$GREEN"; fi
}

# ── 게이지 (pct, 칸수) ───────────────────────────────────────────────────────
gauge() {
  local p=$1 w=${2:-10} f i out=""
  (( p < 0 )) && p=0; (( p > 100 )) && p=100
  f=$(( p * w / 100 ))
  (( p > 0 && f == 0 )) && f=1
  for ((i = 0; i < w; i++)); do
    (( i < f )) && out+='█' || out+='░'
  done
  printf '%s' "$out"
}

# ── 남은 시간 ────────────────────────────────────────────────────────────────
left() {
  local ts=$1 d h m
  (( ts <= 0 )) && { printf '?'; return; }
  d=$(( ts - EPOCHSECONDS ))
  (( d <= 0 )) && { printf '재설정'; return; }
  (( d < 300 )) && { printf '곧'; return; }
  h=$(( d / 3600 )); m=$(( (d % 3600) / 60 ))
  (( h > 0 )) && printf '%dh %dm' "$h" "$m" || printf '%dm' "$m"
}

# ── 값 가공 ──────────────────────────────────────────────────────────────────
proj=${cur_dir##*/}; proj=${proj:-~}
model=${model_name/ (1M context)/ 1M}

branch=$(git -C "$cur_dir" symbolic-ref --quiet --short HEAD 2>/dev/null \
      || git -C "$cur_dir" rev-parse --short HEAD 2>/dev/null)
dirty=0
# macOS 의 wc -l 은 숫자를 우측 정렬로 패딩한다("       2") → `main*       2` 로 찍힌다.
[[ -n $branch ]] && dirty=$(git -C "$cur_dir" status --porcelain 2>/dev/null | grep -c '')

# 토큰 축약: 50719 → 50k / 1000000 → 1M
short_tok() {
  local n=$1
  if   (( n >= 1000000 )); then printf '%dM' $(( n / 1000000 ))
  elif (( n >= 1000 ));    then printf '%dk' $(( n / 1000 ))
  else                          printf '%d' "$n"; fi
}

usd=$(printf '%.2f' "${cost:-0}")

# ── 조각 조립 ────────────────────────────────────────────────────────────────
seg_proj="${BLUE}📁 ${B}${proj}${RST}"
if [[ -n $branch ]]; then
  seg_git="${MINT}🌿 ${branch}${RST}"
  (( dirty > 0 )) && seg_git+="${YELLOW}*${dirty}${RST}"
else
  seg_git=""
fi

seg_model="${PURPLE}${model}${RST}"
[[ -n $effort && $effort != null ]] && seg_model+="${DIM}(${effort})${RST}"
[[ $fast_mode == true ]] && seg_model+=" ${YELLOW}⚡${RST}"

ctx_c=$(heat "$ctx_pct")
seg_ctx="${DIM}🧠${RST} ${ctx_c}${ctx_pct}%${RST}${DIM} $(short_tok "$ctx_tok")/$(short_tok "$ctx_size")${RST}"
seg_cost="${DIM}💰 \$${usd}${RST}"
seg_diff="${GREEN}+${add}${RST}${DIM}/${RST}${RED}-${del}${RST}"

mk_limit() { # 라벨 pct reset 칸수
  local label=$1 pct=$2 reset=$3 w=${4:-10} c
  (( pct < 0 )) && { printf '%s' "${DIM}${label} —${RST}"; return; }
  c=$(heat "$pct")
  printf '%s' "${DIM}${label}${RST} ${c}$(gauge "$pct" "$w")${RST} ${c}${pct}%${RST}${DIM}($(left "$reset"))${RST}"
}

case $STYLE in
  classic)
    printf '%s %s %s %s %s %s %s %s\n' \
      "$seg_proj${seg_git:+ $seg_git}" "${DIM}·${RST}" "$seg_model" "${DIM}·${RST}" \
      "$(mk_limit 5h "$fh_pct" "$fh_reset")" "${DIM}·${RST}" \
      "$(mk_limit 7d "$sd_pct" "$sd_reset")"
    ;;
  minimal)
    printf '%s %s %s %s %s %s %s\n' \
      "$seg_proj${seg_git:+ $seg_git}" "${DIM}·${RST}" "$seg_model" "${DIM}·${RST}" \
      "$(mk_limit 5h "$fh_pct" "$fh_reset" 5)" \
      "$(mk_limit 7d "$sd_pct" "$sd_reset" 5)"
    ;;
  two)
    printf '%s %s %s %s %s %s %s %s\n' \
      "$seg_proj${seg_git:+ $seg_git}" "${DIM}·${RST}" "$seg_model" "${DIM}·${RST}" \
      "$seg_ctx" "${DIM}·${RST}" "$seg_cost"
    printf '%s %s %s %s\n' \
      "$(mk_limit 5h "$fh_pct" "$fh_reset" 12)" "${DIM}·${RST}" \
      "$(mk_limit 7d "$sd_pct" "$sd_reset" 12)" "$seg_diff"
    ;;
  *) # full
    printf '%s %s %s %s %s %s %s %s %s %s %s\n' \
      "$seg_proj${seg_git:+ $seg_git}" "${DIM}·${RST}" "$seg_model" "${DIM}·${RST}" \
      "$seg_ctx" "${DIM}·${RST}" "$seg_cost" "${DIM}·${RST}" \
      "$(mk_limit 5h "$fh_pct" "$fh_reset")" \
      "${DIM}·${RST} $(mk_limit 7d "$sd_pct" "$sd_reset")"
    ;;
esac
