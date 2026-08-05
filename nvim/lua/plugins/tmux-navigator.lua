-- tmux 쪽에 이미 설치된 vim-tmux-navigator 와 짝을 이룸.
-- <C-h/j/k/l> 이 nvim 창 경계에 도달하면 자동으로 tmux pane 으로 넘어감.
return {
  {
    "christoomey/vim-tmux-navigator",
    cmd = {
      "TmuxNavigateLeft",
      "TmuxNavigateDown",
      "TmuxNavigateUp",
      "TmuxNavigateRight",
      "TmuxNavigatePrevious",
    },
    keys = {
      { "<C-h>", "<cmd>TmuxNavigateLeft<CR>", desc = "Window/pane left" },
      { "<C-j>", "<cmd>TmuxNavigateDown<CR>", desc = "Window/pane down" },
      { "<C-k>", "<cmd>TmuxNavigateUp<CR>", desc = "Window/pane up" },
      { "<C-l>", "<cmd>TmuxNavigateRight<CR>", desc = "Window/pane right" },
    },
    init = function()
      -- 이동 전 저장 안 된 버퍼 자동 저장 비활성 (혹시 원치 않은 write 방지)
      vim.g.tmux_navigator_save_on_switch = 0
      -- tmux 가 없을 땐 일반 창 이동으로 자동 폴백
      vim.g.tmux_navigator_no_mappings = 1
    end,
  },
}
