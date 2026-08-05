-- VS Code Git Graph 확장과 가장 비슷한 브랜치 그래프 뷰.
-- diffview 와 연동: 커밋 위에서 Enter 로 해당 커밋 diff 열림.
return {
  {
    "isakbm/gitgraph.nvim",
    dependencies = { "sindrets/diffview.nvim" },
    keys = {
      {
        "<leader>gl",
        function()
          require("gitgraph").draw({}, { all = true, max_count = 5000 })
        end,
        desc = "Git graph (브랜치 트리)",
      },
    },
    opts = {
      symbols = {
        merge_commit = "",
        commit = "",
        merge_commit_end = "",
        commit_end = "",
        GVER = "│",
        GHOR = "─",
        GCLD = "╮",
        GCRD = "╭",
        GCLU = "╯",
        GCRU = "╰",
        GLRU = "┴",
        GLRD = "┬",
        GLUD = "┤",
        GRUD = "├",
        GFORKU = "┼",
        GFORKD = "┼",
        GRUDCD = "├",
        GRUDCU = "├",
        GLUDCD = "┤",
        GLUDCU = "┤",
        GLRDCL = "┬",
        GLRDCR = "┬",
        GLRUCL = "┴",
        GLRUCR = "┴",
      },
      format = {
        timestamp = "%Y-%m-%d %H:%M",
        fields = { "hash", "timestamp", "author", "branch_name", "tag" },
      },
      hooks = {
        -- 커밋 라인에서 Enter → 해당 커밋 diff 를 Diffview 로 열기
        on_select_commit = function(commit)
          vim.notify("commit: " .. commit.hash)
          vim.cmd("DiffviewOpen " .. commit.hash .. "^.." .. commit.hash)
        end,
        -- 범위 선택 후 Enter → 두 커밋 사이 diff
        on_select_range_commit = function(from, to)
          vim.cmd("DiffviewOpen " .. from.hash .. ".." .. to.hash)
        end,
      },
    },
  },
}
