# nvim

LazyVim 기반. 실체는 이 디렉터리, 머신에서는 `~/.config/nvim` 심링크.

```bash
ln -sfn "$REPO/nvim" ~/.config/nvim
```

첫 실행 때 lazy.nvim이 플러그인을 받는다. 플러그인 캐시(`~/.local/share/nvim`)는 repo에 넣지 않는다.

키: [CHEATSHEET.md](CHEATSHEET.md). nvim 안에서는 `Space` (which-key) 또는 `Space sk`.

herdr 페인 이동은 `Ctrl+Space` 다음 `h/j/k/l`. herdr 플러그인 설치는 [herdr/README.md](../herdr/README.md).
