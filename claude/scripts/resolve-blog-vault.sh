#!/usr/bin/env bash
# Resolve the Obsidian blog vault path for the current host.
# Prints the absolute path to stdout on success; exits 1 with stderr on failure.

case "$(uname)" in
  Darwin)
    CANDIDATES=(
      "$HOME/Documents/para/Resource/blog"
    )
    ;;
  Linux)
    CANDIDATES=(
      "$HOME/obsidian/Resource/blog"
      "$HOME/obsidian/para/Resource/blog"
    )
    ;;
  MINGW*|MSYS*|CYGWIN*)
    CANDIDATES=()
    ;;
  *)
    CANDIDATES=()
    ;;
esac

for p in "${CANDIDATES[@]}"; do
  [ -d "$p" ] && { echo "$p"; exit 0; }
done

echo "[resolve-blog-vault] blog vault not found on $(uname) — update resolve-blog-vault.sh with this host's candidates." >&2
exit 1
