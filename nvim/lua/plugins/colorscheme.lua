return {
  {
    "folke/tokyonight.nvim",
    lazy = false,
    priority = 1000,
    opts = {
      style = "night",
      transparent = false,
      styles = {
        comments = { italic = true },
        keywords = { italic = false },
      },
    },
    config = function(_, opts)
      require("tokyonight").setup(opts)
      vim.cmd.colorscheme("tokyonight")

      -- 검색 하이라이트 강조: 현재 매치는 주황 + 굵게, 나머지 매치는 은은한 노랑
      vim.api.nvim_set_hl(0, "Search", { bg = "#3d59a1", fg = "#c0caf5", bold = false })
      vim.api.nvim_set_hl(0, "CurSearch", { bg = "#ff9e64", fg = "#1a1b26", bold = true })
      vim.api.nvim_set_hl(0, "IncSearch", { link = "CurSearch" })
    end,
  },
}
