#!/bin/sh
# 이미지들을 그림 요소가 받는 PNG 로 바꿔 캐시에 둔다(macOS sips). 영상은 ffmpeg 로 프레임 6장을
# 3×2 한 장(contact sheet)으로. 한 줄에 하나씩 JSON 으로 답한다.
#   convert.sh <캐시 폴더> <이미지 경로>...
#   {"path":"…","file":"…/abc.png","width":1600,"height":900}  또는  {"path":"…","error":"…"}
# 캐시 이름에 수정 시각을 넣어, 같은 경로에 새 이미지가 써지면 다시 바꾼다.
cache="$1"; shift
mkdir -p "$cache"
for p in "$@"; do
  esc=$(printf '%s' "$p" | sed 's/\\/\\\\/g; s/"/\\"/g')
  if [ ! -f "$p" ]; then printf '{"path":"%s","error":"파일이 없다"}\n' "$esc"; continue; fi
  key=$(md5 -q -s "$p:$(stat -f %m "$p")")
  out="$cache/$key.png"
  case "$p" in
    *.mp4|*.MP4|*.mov|*.MOV|*.mkv|*.webm|*.avi|*.m4v)
      # 영상: 길이를 6등분한 지점의 프레임 6장을 3×2 로 붙인다.
      if [ ! -f "$out" ]; then
        dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$p" 2>/dev/null)
        [ -n "$dur" ] && ffmpeg -v error -y -i "$p" -vf "fps=6/$dur,scale=480:-2,tile=3x2:padding=6:margin=0" -frames:v 1 "$out" </dev/null 2>/dev/null
      fi ;;
  esac
  # 긴 변이 1600px 를 넘을 때만 줄인다(키우지는 않는다) — 터미널 칸에 그리기엔 충분하고 빨리 뜬다.
  if [ ! -f "$out" ]; then
    long=$(sips -g pixelWidth -g pixelHeight "$p" 2>/dev/null | awk '/pixel/{if($2>m)m=$2} END{print m+0}')
    if [ "$long" -gt 1600 ]; then sips -s format png -Z 1600 "$p" --out "$out" >/dev/null 2>&1
    else sips -s format png "$p" --out "$out" >/dev/null 2>&1; fi
  fi
  if [ ! -f "$out" ]; then printf '{"path":"%s","error":"PNG 로 못 바꿨다 (영상이면 ffmpeg 필요)"}\n' "$esc"; continue; fi
  w=$(sips -g pixelWidth "$out" 2>/dev/null | awk '/pixelWidth/{print $2}')
  h=$(sips -g pixelHeight "$out" 2>/dev/null | awk '/pixelHeight/{print $2}')
  printf '{"path":"%s","file":"%s","width":%s,"height":%s}\n' "$esc" "$out" "${w:-0}" "${h:-0}"
done
