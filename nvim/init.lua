-- vscode-neovim 은 LazyVim 을 안 탄다. 모션은 기본 nvim, leader 만 VS Code UI.
if vim.g.vscode then
  require("config.vscode")
  return
end

-- bootstrap lazy.nvim, LazyVim and your plugins
require("config.lazy")
