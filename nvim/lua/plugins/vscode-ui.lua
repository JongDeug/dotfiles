-- VS Code Dark Modern look in terminal nvim.
-- vscode-neovim 안에서는 LazyVim vscode extra가 UI 플러그인을 건너뛴다.
return {
  {
    "gmr458/vscode_modern_theme.nvim",
    lazy = false,
    priority = 1000,
    opts = {
      cursorline = true,
      transparent_background = false,
      nvim_tree_darker = true,
    },
    config = function(_, opts)
      require("vscode_modern").setup(opts)
    end,
  },
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "vscode_modern",
    },
  },
  {
    "akinsho/bufferline.nvim",
    opts = {
      options = {
        always_show_bufferline = true,
        tabpages = false,
        separator_style = "thin",
        show_close_icon = false,
        indicator = { style = "underline" },
        offsets = {
          {
            filetype = "neo-tree",
            text = "EXPLORER",
            highlight = "Directory",
            text_align = "center",
            separator = true,
          },
        },
      },
    },
  },
  {
    "nvim-lualine/lualine.nvim",
    opts = function(_, opts)
      opts.options = opts.options or {}
      opts.options.theme = "auto"
      opts.options.component_separators = { left = "", right = "" }
      opts.options.section_separators = { left = "", right = "" }
    end,
  },
}
