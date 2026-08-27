# origin 호스트 별칭에 맞춰 gh 활성 계정을 바꾼다.
# github.com-tnh → tnh-jonghwan, github.com-jongdeug → JongDeug
_gh_switch_for_repo() {
  (( $+commands[gh] && $+commands[git] )) || return 0
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 0
  local url user
  url=$(git remote get-url origin 2>/dev/null) || return 0
  case "$url" in
    *github.com-tnh[:/]*) user=tnh-jonghwan ;;
    *github.com-jongdeug[:/]*) user=JongDeug ;;
    *) return 0 ;;
  esac
  [[ "$user" == "$_GH_ACTIVE_USER" ]] && return 0
  if gh auth switch -u "$user" >/dev/null 2>&1; then
    _GH_ACTIVE_USER=$user
  fi
}
autoload -Uz add-zsh-hook
add-zsh-hook chpwd _gh_switch_for_repo
_gh_switch_for_repo
