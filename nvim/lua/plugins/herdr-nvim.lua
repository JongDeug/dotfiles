-- ChmaraX/herdr-nvim 의 nvim 반 (주석 → 에이전트 전송).
-- herdr 플러그인 반은 `herdr plugin install ChmaraX/herdr-nvim`.
-- vscode-neovim 안에서는 끈다.
if vim.g.vscode then
  return {}
end

return {
  {
    "folke/snacks.nvim",
    opts = function(_, opts)
      if vim.g.herdr_nvim_sidebar or tostring(vim.v.servername or ""):find("herdr-nvim", 1, true) then
        opts.dashboard = { enabled = false }
      end
    end,
  },
  {
    "ChmaraX/herdr-nvim",
    -- 데몬이 VimEnter 에서 setup() 을 한 번 더 호출한다. 가드하지 않으면
    -- "not overriding existing map" 경고가 다섯 장 뜬다.
    opts = {
      prefix = "<leader>h",
      keymaps = true,
    },
    config = function(_, opts)
      local hn = require("herdr-nvim")
      local orig = hn.setup
      hn.setup = function(config)
        if hn._setup_done then
          return
        end
        hn._setup_done = true
        orig(config)
      end
      hn.setup(opts)
    end,
  },
}
