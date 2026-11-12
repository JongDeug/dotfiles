#!/bin/sh
# herdr desktop app (~/.config/herdr-app) <- this folder. Idempotent.
# The app only watches its own folder, so edits here don't reload by themselves:
# re-run this after editing — swapping the links is what makes the app reload.
set -eu
SRC=$(cd "$(dirname "$0")" && pwd)
APP=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
mkdir -p "$APP/mods"

link() { # $1 source, $2 destination: refuse to clobber a real file/folder
  if [ -e "$2" ] && [ ! -L "$2" ]; then echo "skip (real file there, move it first): $2"; return; fi
  ln -sfn "$1" "$2.link-tmp" && mv -fh "$2.link-tmp" "$2"
}

for m in "$SRC"/mods/*/; do m=${m%/}; link "$m" "$APP/mods/$(basename "$m")"; done
link "$SRC/layouts" "$APP/layouts"
link "$SRC/keys.json" "$APP/keys.json"
link "$SRC/programs.json" "$APP/programs.json"
echo "linked: $(ls "$SRC/mods" | tr '\n' ' ')layouts keys.json programs.json"
