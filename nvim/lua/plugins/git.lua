-- Git status panel + commit graph (VS Code SCM / Git Graph 느낌)
return {
  {
    "sindrets/diffview.nvim",
    cmd = { "DiffviewOpen", "DiffviewClose", "DiffviewFileHistory", "DiffviewToggleFiles" },
    opts = {},
    keys = {
      { "<leader>gs", "<cmd>DiffviewOpen<cr>", desc = "Git Status (Diffview)" },
      { "<leader>gH", "<cmd>DiffviewFileHistory %<cr>", desc = "Git File History" },
    },
  },
  {
    "isakbm/gitgraph.nvim",
    dependencies = { "sindrets/diffview.nvim" },
    opts = {
      git_cmd = "git",
      symbols = {
        merge_commit = "M",
        commit = "*",
      },
      format = {
        timestamp = "%Y-%m-%d %H:%M",
        fields = { "hash", "timestamp", "author", "branch_name", "tag" },
      },
      hooks = {
        on_select_commit = function(commit)
          vim.cmd("DiffviewOpen " .. commit.hash .. "^!")
        end,
        on_select_range_commit = function(from, to)
          vim.cmd("DiffviewOpen " .. from.hash .. "~1.." .. to.hash)
        end,
      },
    },
    keys = {
      {
        "<leader>gt",
        function()
          require("gitgraph").draw({}, { all = true, max_count = 500 })
        end,
        desc = "Git Tree (Graph)",
      },
    },
  },
}
