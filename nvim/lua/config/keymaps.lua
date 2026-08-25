-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

if not vim.g.vscode then
  vim.keymap.set("n", "<leader>sk", function()
    Snacks.picker.keymaps()
  end, { desc = "Keymaps" })
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
