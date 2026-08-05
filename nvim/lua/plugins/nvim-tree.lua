return {
  {
    "nvim-tree/nvim-tree.lua",
    lazy = false,
    keys = {
      { "<leader>e", "<cmd>NvimTreeToggle<CR>", desc = "Toggle file tree" },
      { "<leader>o", "<cmd>NvimTreeFocus<CR>", desc = "Focus file tree" },
      -- VS Code 는 Ctrl+B 지만 tmux prefix 와 정면 충돌 → Alt+B 로 대체
      { "<A-b>", "<cmd>NvimTreeToggle<CR>", desc = "Toggle sidebar (VS Code-ish)", mode = { "n", "i", "v" } },
    },
    dependencies = { "nvim-tree/nvim-web-devicons" },
    opts = function()
      local function width_delta(delta)
        return function()
          local win = vim.api.nvim_get_current_win()
          local cur = vim.api.nvim_win_get_width(win)
          vim.api.nvim_win_set_width(win, math.max(10, cur + delta))
        end
      end

      return {
        view = {
          width = 30,
          side = "left",
        },
        renderer = {
          group_empty = true,
          indent_markers = { enable = true },
        },
        filters = {
          dotfiles = false,
          custom = { "^.git$" },
        },
        update_focused_file = {
          enable = true,
          update_root = false,
        },
        git = { enable = true, ignore = false },
        actions = {
          open_file = {
            quit_on_open = false,
            window_picker = { enable = false }, -- A/B 창 선택 UI 끄기
          },
        },
        on_attach = function(bufnr)
          local api = require("nvim-tree.api")
          api.config.mappings.default_on_attach(bufnr)
          -- nvim-tree 기본으로 '-' 는 dir_up 에 묶여 있어 덮어쓰려면 먼저 해제
          pcall(vim.keymap.del, "n", "-", { buffer = bufnr })
          local opts = { buffer = bufnr, silent = true, nowait = true }
          vim.keymap.set("n", "+", width_delta(3), vim.tbl_extend("force", opts, { desc = "Widen tree" }))
          vim.keymap.set("n", "-", width_delta(-3), vim.tbl_extend("force", opts, { desc = "Narrow tree" }))
          -- dir_up 은 'u' 로 이관
          vim.keymap.set("n", "u", api.tree.change_root_to_parent, vim.tbl_extend("force", opts, { desc = "Dir up" }))
        end,
      }
    end,
  },
}
