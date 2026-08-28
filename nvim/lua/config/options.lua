-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

-- iTerm 에 JetBrainsMono Nerd Font 가 깔려 있다. 아이콘(neo-tree 등)용.
vim.g.have_nerd_font = true

-- 파일 열 때 줄이 미끄러지는 snacks scroll/animate 끔
vim.g.snacks_animate = false

-- herdr-nvim 사이드바는 nvim --listen …/herdr-nvim/<tab>.sock
-- servername 은 설정 로드 직후엔 비어 있을 수 있어서, 이벤트 때 다시 본다.
local function is_herdr_sidebar()
  return tostring(vim.v.servername or ""):find("herdr-nvim", 1, true) ~= nil
end
vim.g.herdr_nvim_sidebar = is_herdr_sidebar()

vim.api.nvim_create_autocmd({ "VimEnter", "UIEnter" }, {
  group = vim.api.nvim_create_augroup("herdr_nvim_sidebar_start", { clear = true }),
  callback = function()
    if not is_herdr_sidebar() then
      return
    end
    vim.g.herdr_nvim_sidebar = true
    vim.defer_fn(function()
      pcall(function()
        require("neo-tree.command").execute({ action = "show", dir = vim.uv.cwd() })
      end)
    end, 400)
  end,
})
