return {
  -- 상단 탭바 (VS Code 의 편집기 탭)
  {
    "akinsho/bufferline.nvim",
    event = "VeryLazy",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    keys = {
      { "<leader>bp", "<cmd>BufferLineTogglePin<CR>", desc = "Pin buffer" },
      { "<leader>bo", "<cmd>BufferLineCloseOthers<CR>", desc = "Close other buffers" },
      { "<A-,>", "<cmd>BufferLineMovePrev<CR>", desc = "Move buffer left" },
      { "<A-.>", "<cmd>BufferLineMoveNext<CR>", desc = "Move buffer right" },
      -- <leader>+숫자: 해당 번호 버퍼로 바로 이동 (Alt+숫자는 aerospace 워크스페이스와 충돌)
      { "<leader>1", "<cmd>BufferLineGoToBuffer 1<CR>", desc = "Go to buffer 1" },
      { "<leader>2", "<cmd>BufferLineGoToBuffer 2<CR>", desc = "Go to buffer 2" },
      { "<leader>3", "<cmd>BufferLineGoToBuffer 3<CR>", desc = "Go to buffer 3" },
      { "<leader>4", "<cmd>BufferLineGoToBuffer 4<CR>", desc = "Go to buffer 4" },
      { "<leader>5", "<cmd>BufferLineGoToBuffer 5<CR>", desc = "Go to buffer 5" },
      { "<leader>6", "<cmd>BufferLineGoToBuffer 6<CR>", desc = "Go to buffer 6" },
      { "<leader>7", "<cmd>BufferLineGoToBuffer 7<CR>", desc = "Go to buffer 7" },
      { "<leader>8", "<cmd>BufferLineGoToBuffer 8<CR>", desc = "Go to buffer 8" },
      { "<leader>9", "<cmd>BufferLineGoToBuffer 9<CR>", desc = "Go to buffer 9" },
    },
    opts = {
      options = {
        mode = "buffers",
        numbers = "ordinal", -- 탭 앞에 1, 2, 3 번호 표시
        diagnostics = "nvim_lsp",
        separator_style = "thin",
        show_buffer_close_icons = false,
        show_close_icon = false,
        offsets = {
          {
            filetype = "NvimTree",
            text = "File Explorer",
            text_align = "left",
            separator = true,
          },
        },
      },
    },
  },

  -- 내장 터미널 토글 (VS Code 의 Ctrl+` 과 같은 경험)
  {
    "akinsho/toggleterm.nvim",
    version = "*",
    cmd = { "ToggleTerm", "TermExec" },
    keys = {
      { [[<C-\>]], "<cmd>ToggleTerm<CR>", mode = { "n", "t" }, desc = "Toggle terminal" },
      { "<leader>tt", "<cmd>ToggleTerm direction=horizontal<CR>", desc = "Terminal horizontal" },
      { "<leader>tv", "<cmd>ToggleTerm direction=vertical size=80<CR>", desc = "Terminal vertical" },
      { "<leader>tf", "<cmd>ToggleTerm direction=float<CR>", desc = "Terminal float" },
    },
    opts = {
      size = function(term)
        if term.direction == "horizontal" then
          return math.floor(vim.o.lines * 0.28)
        elseif term.direction == "vertical" then
          return math.floor(vim.o.columns * 0.4)
        end
      end,
      open_mapping = [[<C-\>]],
      shade_terminals = true,
      shading_factor = 2,
      direction = "horizontal",
      start_in_insert = true,
      persist_size = true,
      persist_mode = true,
      float_opts = {
        border = "curved",
        width = function() return math.floor(vim.o.columns * 0.85) end,
        height = function() return math.floor(vim.o.lines * 0.8) end,
        winblend = 3,
        title_pos = "center",
      },
      winbar = {
        enabled = true,
        name_formatter = function(term)
          return "  Terminal #" .. term.id .. "  "
        end,
      },
    },
    config = function(_, opts)
      require("toggleterm").setup(opts)
      -- 터미널 모드 안에서 창 이동 편하게
      vim.api.nvim_create_autocmd("TermOpen", {
        pattern = "term://*toggleterm#*",
        callback = function()
          local map = function(lhs, rhs)
            vim.keymap.set("t", lhs, rhs, { buffer = 0 })
          end
          map("<Esc>", [[<C-\><C-n>]])
          map("<C-h>", [[<Cmd>wincmd h<CR>]])
          map("<C-j>", [[<Cmd>wincmd j<CR>]])
          map("<C-k>", [[<Cmd>wincmd k<CR>]])
          map("<C-l>", [[<Cmd>wincmd l<CR>]])
          -- 터미널 모드에서도 바로 리사이즈
          map("<C-Up>", [[<Cmd>resize +2<CR>]])
          map("<C-Down>", [[<Cmd>resize -2<CR>]])
          map("<C-Left>", [[<Cmd>vertical resize -2<CR>]])
          map("<C-Right>", [[<Cmd>vertical resize +2<CR>]])
        end,
      })
    end,
  },

  -- 심볼 아웃라인 (VS Code 의 Outline 패널)
  {
    "stevearc/aerial.nvim",
    cmd = { "AerialToggle", "AerialOpen", "AerialNavToggle" },
    keys = {
      { "<leader>os", "<cmd>AerialToggle!<CR>", desc = "Symbol outline" },
    },
    dependencies = {
      "nvim-treesitter/nvim-treesitter",
      "nvim-tree/nvim-web-devicons",
    },
    opts = {
      backends = { "lsp", "treesitter", "markdown" },
      layout = {
        default_direction = "right",
        width = 34,
      },
      show_guides = true,
      attach_mode = "global",
      filter_kind = false,
    },
  },
}
