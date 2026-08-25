# macOS 파일명은 NFD(자모 분해)로 저장된다. ls 가 ㄱㄴㄷ 로 찍히는 이유다.
# utf-8-mac → utf-8 이 완성형(NFC)으로 다시 합친다. 디스크 이름은 그대로다.
if [[ "$(uname -s)" == "Darwin" ]] && (( $+commands[iconv] )); then
  _ls_nfc() {
    # BSD ls 는 파이프에서 칸 너비를 못 읽어서 한 줄씩 찍는다.
    # GNU ls --width 가 터미널 너비를 유지한다.
    local w="${COLUMNS:-80}"
    if (( $+commands[gls] )); then
      gls --color=always -C --width="$w" "$@" | iconv -f utf-8-mac -t utf-8
    else
      command ls -G "$@" | iconv -f utf-8-mac -t utf-8
    fi
  }
  alias ls='_ls_nfc'
fi
