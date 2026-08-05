return {
  -- magit 스타일 Git UI. VS Code Source Control 뷰 대체.
  {
    "NeogitOrg/neogit",
    cmd = { "Neogit" },
    dependencies = {
      "nvim-lua/plenary.nvim",
      "sindrets/diffview.nvim",
      "nvim-telescope/telescope.nvim",
    },
    keys = {
      { "<leader>gg", "<cmd>Neogit<CR>", desc = "Neogit (Git UI)" },
      { "<leader>gc", "<cmd>Neogit commit<CR>", desc = "Git commit" },
      { "<leader>gp", "<cmd>Neogit pull<CR>", desc = "Git pull" },
      { "<leader>gP", "<cmd>Neogit push<CR>", desc = "Git push" },
    },
    opts = {
      integrations = { diffview = true, telescope = true },
      graph_style = "unicode",
      signs = {
        section = { "", "" },
        item = { "", "" },
        hunk = { "", "" },
      },
      disable_commit_confirmation = false,
      auto_refresh = true,
    },
  },

  -- Merge conflict 인라인 해결. co/ct/cb/c0, ]x/[x 매핑 자동 등록.
  {
    "akinsho/git-conflict.nvim",
    version = "*",
    event = "BufReadPre",
    keys = {
      { "<leader>gx", "<cmd>GitConflictListQf<CR>", desc = "Conflicts: list" },
    },
    opts = {
      default_mappings = true,  -- co(ours)/ct(theirs)/cb(both)/c0(none)
      default_commands = true,
      disable_diagnostics = false,
      list_opener = "copen",
      highlights = {
        incoming = "DiffAdd",
        current = "DiffText",
      },
    },
  },

  -- VS Code Diff Editor + Git Graph 하이브리드.
  {
    "sindrets/diffview.nvim",
    cmd = { "DiffviewOpen", "DiffviewClose", "DiffviewFileHistory", "DiffviewRefresh" },
    dependencies = { "nvim-lua/plenary.nvim", "nvim-tree/nvim-web-devicons" },
    keys = {
      { "<leader>gd", "<cmd>DiffviewOpen<CR>", desc = "Diff: current changes" },
      { "<leader>gD", "<cmd>DiffviewClose<CR>", desc = "Diff: close" },
      { "<leader>gh", "<cmd>DiffviewFileHistory<CR>", desc = "History: repo" },
      { "<leader>gH", "<cmd>DiffviewFileHistory %<CR>", desc = "History: current file" },
    },
    opts = {
      enhanced_diff_hl = true,
      view = {
        default = { winbar_info = true },
        merge_tool = { layout = "diff3_mixed" },
        file_history = { winbar_info = true },
      },
      file_panel = {
        listing_style = "tree",
        tree_options = {
          flatten_dirs = true,
          folder_statuses = "always",
        },
      },
    },
  },
}
