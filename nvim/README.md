# nvim

LazyVim 기반. 실체는 이 디렉터리, 머신에서는 `~/.config/nvim` 심링크.

```bash
ln -sfn "$REPO/nvim" ~/.config/nvim
```

첫 실행 때 lazy.nvim이 플러그인을 받는다. 플러그인 캐시(`~/.local/share/nvim`)는 repo에 넣지 않는다.

herdr 안에서 `Ctrl+h/j/k/l`로 페인 넘기기는 `lua/config/keymaps.lua` + herdr `config.toml`의 vim-herdr-navigation. herdr 플러그인 설치는 [herdr/README.md](../herdr/README.md).
