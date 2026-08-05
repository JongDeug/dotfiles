-- VS Code GitLens "Toggle File Blame" 과 거의 동일한 사이드바 blame 뷰.
-- 파일 왼쪽에 각 줄의 저자/날짜/커밋메시지를 컬러 블록으로 표시.
return {
  {
    "FabijanZulj/blame.nvim",
    cmd = { "BlameToggle" },
    keys = {
      { "<leader>gb", "<cmd>BlameToggle window<CR>", desc = "Blame (side window)" },
      { "<leader>gB", "<cmd>BlameToggle virtual<CR>", desc = "Blame (virtual text 전체)" },
    },
    opts = {
      date_format = "%Y-%m-%d %H:%M",
      virtual_style = "right_align",
      views = {
        window = {
          format = { "date", "author", "hash", "summary" },
          merge_consecutive = true,
        },
        virtual = {
          format = { "date", "author", "summary" },
        },
      },
      focus_blame = true,
      merge_consecutive = false,
      max_summary_width = 40,
      colors = nil,
      blame_options = nil,
      commit_detail_view = "vsplit",
      mappings = {
        commit_info = "i",
        stack_push = "<TAB>",
        stack_pop = "<BS>",
        show_commit = "<CR>",
        close = { "<esc>", "q" },
      },
    },
  },
}
