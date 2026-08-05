local map = vim.keymap.set

map("n", "<Esc>", "<cmd>nohlsearch<CR>", { desc = "Clear search highlight" })

-- <C-h/j/k/l> 창 이동은 vim-tmux-navigator 플러그인이 담당 (tmux pane 과 끊김없이 이동)

map("n", "<C-Up>", "<cmd>resize +2<CR>", { desc = "Grow window vertical" })
map("n", "<C-Down>", "<cmd>resize -2<CR>", { desc = "Shrink window vertical" })
map("n", "<C-Left>", "<cmd>vertical resize -2<CR>", { desc = "Shrink window horizontal" })
map("n", "<C-Right>", "<cmd>vertical resize +2<CR>", { desc = "Grow window horizontal" })

map("v", "<", "<gv", { desc = "Indent left stay" })
map("v", ">", ">gv", { desc = "Indent right stay" })
map("v", "J", ":m '>+1<CR>gv=gv", { desc = "Move selection down" })
map("v", "K", ":m '<-2<CR>gv=gv", { desc = "Move selection up" })

map("n", "n", "nzzzv", { desc = "Next search centered" })
map("n", "N", "Nzzzv", { desc = "Prev search centered" })
map("n", "<C-d>", "<C-d>zz", { desc = "Half-page down centered" })
map("n", "<C-u>", "<C-u>zz", { desc = "Half-page up centered" })

map("n", "<leader>w", "<cmd>w<CR>", { desc = "Save" })
map("n", "<leader>q", "<cmd>q<CR>", { desc = "Quit" })
map("n", "<leader>Q", "<cmd>qa!<CR>", { desc = "Force quit all" })

map("n", "<leader>bd", "<cmd>bdelete<CR>", { desc = "Delete buffer" })
map("n", "<S-l>", "<cmd>bnext<CR>", { desc = "Next buffer" })
map("n", "<S-h>", "<cmd>bprevious<CR>", { desc = "Prev buffer" })

-- Paste over selection without yanking the replaced text.
map("x", "<leader>p", [["_dP]], { desc = "Paste without yank" })
map({ "n", "v" }, "<leader>d", [["_d]], { desc = "Delete without yank" })
