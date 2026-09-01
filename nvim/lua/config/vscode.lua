-- vscode-neovim 전용. LazyVim/which-key/snacks 없이 leader 만 VS Code 명령으로 보낸다.
vim.g.mapleader = " "
vim.g.maplocalleader = " "
vim.opt.clipboard = "unnamedplus"
vim.opt.timeoutlen = 300

vim.keymap.set({ "n", "x" }, "<Space>", "<Nop>", { silent = true })

local vscode = require("vscode")
-- vscode.call 은 키 처리 중 RPC가 막힌다. action(비동기)만 쓴다.
local function action(command)
  return function()
    vscode.action(command)
  end
end

-- Space ? : which-key 대신 VS Code Quick Pick. 고르면 실행.
local help = {
  { label = "Space e", description = "탐색기", command = "workbench.view.explorer" },
  { label = "Space ff", description = "파일 찾기", command = "workbench.action.quickOpen" },
  { label = "Space /", description = "내용 검색", command = "workbench.action.findInFiles" },
  { label = "Space bd", description = "탭 닫기", command = "workbench.action.closeActiveEditor" },
  { label = "Shift+h / l", description = "탭 이동" },
  { label = "Space gs", description = "Git SCM", command = "workbench.view.scm" },
  { label = "Space gg", description = "lazygit", command = "lazygit.openLazygit" },
  { label = "Space gl", description = "커밋 로그", command = "git-graph.view" },
  { label = "Space hs", description = "hunk stage", command = "git.stageSelectedRanges" },
  { label = "Space cp", description = "마크다운 미리보기", command = "markdown.showPreviewToSide" },
  { label = "Space um", description = "미리보기 on/off", command = "markdown.togglePreview" },
  { label = "Space db", description = "브레이크포인트", command = "editor.debug.action.toggleBreakpoint" },
  { label = "Space dc", description = "디버그 실행", command = "workbench.action.debug.start" },
  { label = "Space dO / di / do", description = "step over / into / out" },
  { label = "Space dt", description = "디버그 중지", command = "workbench.action.debug.stop" },
  { label = "Space du", description = "디버그 UI", command = "workbench.view.debug" },
  { label = "gd / K", description = "정의 / hover" },
}

vim.keymap.set("n", "<leader>?", function()
  vscode.eval_async("return await vscode.window.showQuickPick(args.items, args.opts)", {
    args = {
      items = help,
      opts = { placeHolder = "Space ?", matchOnDescription = true },
    },
    callback = function(err, res)
      if err or res == vim.NIL or type(res) ~= "table" or not res.command then
        return
      end
      vscode.action(res.command)
    end,
  })
end, { desc = "Keymaps", nowait = true })

vim.keymap.set("n", "<leader>e", function()
  vscode.action("workbench.view.explorer")
  vscode.action("workbench.files.action.focusFilesExplorer")
end, { desc = "Explorer", nowait = true })
vim.keymap.set("n", "<leader>ff", action("workbench.action.quickOpen"), { desc = "Find Files", nowait = true })
vim.keymap.set("n", "<leader>/", action("workbench.action.findInFiles"), { desc = "Grep", nowait = true })
vim.keymap.set("n", "<leader>bd", action("workbench.action.closeActiveEditor"), { desc = "Delete Buffer" })

vim.keymap.set("n", "<S-h>", action("workbench.action.previousEditor"), { desc = "Prev Buffer" })
vim.keymap.set("n", "<S-l>", action("workbench.action.nextEditor"), { desc = "Next Buffer" })
vim.keymap.set("n", "<C-h>", action("workbench.action.navigateLeft"), { desc = "Go to Left Window" })
vim.keymap.set("n", "<C-j>", action("workbench.action.navigateDown"), { desc = "Go to Lower Window" })
vim.keymap.set("n", "<C-k>", action("workbench.action.navigateUp"), { desc = "Go to Upper Window" })
vim.keymap.set("n", "<C-l>", action("workbench.action.navigateRight"), { desc = "Go to Right Window" })

vim.keymap.set("n", "<leader>gg", action("lazygit.openLazygit"), { desc = "Lazygit" })
vim.keymap.set("n", "<leader>gs", action("workbench.view.scm"), { desc = "Git Status" })
vim.keymap.set("n", "<leader>gl", action("git-graph.view"), { desc = "Git Log" })
vim.keymap.set({ "n", "x" }, "<leader>hs", action("git.stageSelectedRanges"), { desc = "Stage Hunk" })

vim.keymap.set("n", "<leader>cp", action("markdown.showPreviewToSide"), { desc = "Markdown Preview" })
vim.keymap.set("n", "<leader>um", action("markdown.togglePreview"), { desc = "Markdown Preview Toggle" })

vim.keymap.set("n", "<leader>db", action("editor.debug.action.toggleBreakpoint"), { desc = "Toggle Breakpoint" })
vim.keymap.set("n", "<leader>dc", action("workbench.action.debug.start"), { desc = "Run/Continue" })
vim.keymap.set("n", "<leader>dO", action("workbench.action.debug.stepOver"), { desc = "Step Over" })
vim.keymap.set("n", "<leader>di", action("workbench.action.debug.stepInto"), { desc = "Step Into" })
vim.keymap.set("n", "<leader>do", action("workbench.action.debug.stepOut"), { desc = "Step Out" })
vim.keymap.set("n", "<leader>dt", action("workbench.action.debug.stop"), { desc = "Terminate" })
vim.keymap.set("n", "<leader>du", action("workbench.view.debug"), { desc = "Debug UI" })
vim.keymap.set({ "n", "x" }, "<leader>de", action("editor.debug.action.selectionToRepl"), { desc = "Eval" })
