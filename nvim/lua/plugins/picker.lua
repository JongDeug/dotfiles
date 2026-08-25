-- 숨김 파일 기본 표시. Option+h 는 AeroSpace alt-h(창 이동)가 먹는다.
return {
  {
    "nvim-neo-tree/neo-tree.nvim",
    opts = {
      filesystem = {
        filtered_items = {
          visible = true,
          hide_dotfiles = false,
          hide_gitignored = true,
          never_show = { ".DS_Store", "thumbs.db", "node_modules" },
        },
      },
    },
  },
  {
    "folke/snacks.nvim",
    opts = {
      scroll = { enabled = false },
      picker = {
        sources = {
          files = { hidden = true },
          grep = { hidden = true },
          grep_word = { hidden = true },
        },
        win = {
          input = {
            keys = {
              ["H"] = { "toggle_hidden", mode = { "n" } },
            },
          },
          list = {
            keys = {
              ["H"] = "toggle_hidden",
            },
          },
        },
      },
    },
  },
}
