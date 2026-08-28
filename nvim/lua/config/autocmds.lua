-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
--
-- Add any additional autocmds here
-- with `vim.api.nvim_create_autocmd`
--
-- Or remove existing autocmds by their group name (which is prefixed with `lazyvim_` for the defaults)
-- e.g. vim.api.nvim_del_augroup_by_name("lazyvim_wrap_spell")

-- nvim . 로 폴더만 열면 빈 [No Name] 버퍼가 탭에 남는다.
-- 이름 없는 빈 버퍼는 탭에서 빼고, 다른 파일이 있으면 지운다.
do
  local function is_noname(buf)
    return vim.api.nvim_buf_is_valid(buf)
      and vim.bo[buf].buftype == ""
      and vim.api.nvim_buf_get_name(buf) == ""
      and not vim.bo[buf].modified
  end

  local function has_named_file()
    for _, b in ipairs(vim.api.nvim_list_bufs()) do
      if vim.api.nvim_buf_is_valid(b) and vim.bo[b].buflisted and vim.api.nvim_buf_get_name(b) ~= "" then
        return true
      end
    end
    return false
  end

  local function tidy_noname()
    local named = has_named_file()
    for _, b in ipairs(vim.api.nvim_list_bufs()) do
      if is_noname(b) then
        if named then
          pcall(vim.api.nvim_buf_delete, b, { force = true })
        else
          vim.bo[b].buflisted = false
        end
      end
    end
  end

  vim.api.nvim_create_autocmd({ "BufEnter", "BufWinEnter", "VimEnter", "UIEnter" }, {
    group = vim.api.nvim_create_augroup("dotfiles_noname", { clear = true }),
    callback = function()
      vim.schedule(tidy_noname)
    end,
  })
end

