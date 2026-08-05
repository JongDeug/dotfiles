local aug = vim.api.nvim_create_augroup
local au = vim.api.nvim_create_autocmd

au("TextYankPost", {
  group = aug("YankHighlight", { clear = true }),
  callback = function()
    vim.highlight.on_yank({ timeout = 150 })
  end,
})

au({ "BufWritePre" }, {
  group = aug("TrimWhitespace", { clear = true }),
  callback = function()
    local save = vim.fn.winsaveview()
    vim.cmd([[keeppatterns %s/\s\+$//e]])
    vim.fn.winrestview(save)
  end,
})

au("FileType", {
  group = aug("CloseWithQ", { clear = true }),
  pattern = { "help", "qf", "man", "lspinfo", "checkhealth", "notify" },
  callback = function(ev)
    vim.bo[ev.buf].buflisted = false
    vim.keymap.set("n", "q", "<cmd>close<CR>", { buffer = ev.buf, silent = true })
  end,
})

au("VimEnter", {
  group = aug("AutoOpenNvimTree", { clear = true }),
  callback = function(data)
    local is_file = vim.fn.filereadable(data.file) == 1
    local is_dir = vim.fn.isdirectory(data.file) == 1
    local no_args = vim.fn.argc() == 0

    if not (is_file or is_dir or no_args) then return end

    if is_dir then
      vim.cmd.cd(data.file)
    end

    local prev_win = vim.api.nvim_get_current_win()

    vim.schedule(function()
      local ok, api = pcall(require, "nvim-tree.api")
      if not ok then return end

      if is_file then
        api.tree.find_file({ open = true, focus = false })
      else
        api.tree.open()
      end

      if (is_file or no_args) and vim.api.nvim_win_is_valid(prev_win) then
        vim.api.nvim_set_current_win(prev_win)
      end
    end)
  end,
})
