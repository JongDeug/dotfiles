-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

-- vim-herdr-navigation: nvim 창 끝에서 Ctrl+h/j/k/l 로 herdr 페인으로 넘어간다.
-- herdr 쪽 바인딩은 ~/.config/herdr/config.toml 의 [[keys.command]] 이다.
if not vim.g.vscode then
  local function nav(wincmd, dir)
    local prev = vim.api.nvim_get_current_win()
    vim.cmd("wincmd " .. wincmd)
    if vim.api.nvim_get_current_win() ~= prev then
      return
    end
    if vim.env.HERDR_PANE_ID and vim.env.HERDR_PANE_ID ~= "" then
      local herdr = vim.env.HERDR_BIN_PATH
      if herdr == nil or herdr == "" then
        herdr = "herdr"
      end
      vim.fn.system({ herdr, "pane", "focus", "--direction", dir, "--pane", vim.env.HERDR_PANE_ID })
    end
  end

  vim.keymap.set("n", "<C-h>", function()
    nav("h", "left")
  end, { silent = true, noremap = true, desc = "Navigate left (vim/herdr)" })
  vim.keymap.set("n", "<C-j>", function()
    nav("j", "down")
  end, { silent = true, noremap = true, desc = "Navigate down (vim/herdr)" })
  vim.keymap.set("n", "<C-k>", function()
    nav("k", "up")
  end, { silent = true, noremap = true, desc = "Navigate up (vim/herdr)" })
  vim.keymap.set("n", "<C-l>", function()
    nav("l", "right")
  end, { silent = true, noremap = true, desc = "Navigate right (vim/herdr)" })
end

-- vscode-neovim: 트리/git은 VS Code UI로 보낸다.
if vim.g.vscode then
  local vscode = require("vscode")
  vim.keymap.set("n", "<leader>e", function()
    vscode.action("workbench.view.explorer")
  end, { desc = "Explorer" })
  vim.keymap.set("n", "<leader>gg", function()
    vscode.action("workbench.view.scm")
  end, { desc = "Git SCM" })
  vim.keymap.set("n", "<leader>gs", function()
    vscode.action("workbench.view.scm")
  end, { desc = "Git Status" })
end
