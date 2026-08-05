-- VS Code 스타일 단축키 (기존 vim 키맵에 덧붙임)
-- 진짜 vim 키들은 그대로 살아있음 — 이건 근육 기억 완충장치용.
-- 끄고 싶으면 init.lua 에서 이 require 줄만 주석 처리하면 됨.

local map = vim.keymap.set

-- ─────────────────────────────────────────────────────────
-- 파일/프로젝트 탐색
-- ─────────────────────────────────────────────────────────
-- Telescope 는 cmd trigger 로 자동 로드되므로 아래 매핑들은 lazy 안전.
-- nvim-tree 의 <C-b> 는 충돌/타이밍 이슈로 플러그인 파일 쪽 keys 에 선언함.
map({ "n", "i", "v" }, "<C-p>", "<cmd>Telescope find_files<CR>", { desc = "Quick open" })
map({ "n", "i", "v" }, "<C-S-p>", "<cmd>Telescope commands<CR>", { desc = "Command palette" })
map({ "n", "i", "v" }, "<C-S-f>", "<cmd>Telescope live_grep<CR>", { desc = "Search in files" })

-- ─────────────────────────────────────────────────────────
-- 저장 (Ctrl+S)
-- ⚠ 터미널에서 Ctrl+S 가 동작하려면 ~/.zshrc 에 `stty -ixon` 추가 필요
-- ─────────────────────────────────────────────────────────
map({ "n", "v" }, "<C-s>", "<cmd>write<CR>", { desc = "Save" })
map("i", "<C-s>", "<Esc><cmd>write<CR>", { desc = "Save" })

-- ─────────────────────────────────────────────────────────
-- 파일 내 검색 (Ctrl+F), 치환 (Ctrl+H)
-- ─────────────────────────────────────────────────────────
map({ "n", "v" }, "<C-f>", "/", { desc = "Find in file" })
map("i", "<C-f>", "<Esc>/", { desc = "Find in file" })
-- Ctrl+H 는 창 이동과 충돌하므로 <leader>rr 로 치환 제공 (창 이동 우선)
map("n", "<leader>rr", ":%s/", { desc = "Replace in file" })

-- ─────────────────────────────────────────────────────────
-- 주석 토글 (Ctrl+/)
-- 터미널이 Ctrl+/ 를 <C-_> 로 보내는 경우가 있어 양쪽 매핑
-- ─────────────────────────────────────────────────────────
map("n", "<C-_>", "gcc", { desc = "Toggle comment", remap = true })
map("v", "<C-_>", "gc", { desc = "Toggle comment", remap = true })
map("n", "<C-/>", "gcc", { desc = "Toggle comment", remap = true })
map("v", "<C-/>", "gc", { desc = "Toggle comment", remap = true })
map("i", "<C-_>", "<Esc>gcca", { desc = "Toggle comment", remap = true })
map("i", "<C-/>", "<Esc>gcca", { desc = "Toggle comment", remap = true })

-- ─────────────────────────────────────────────────────────
-- 줄 이동 (Alt+↑/↓), 줄 복제 (Alt+Shift+↑/↓)
-- ─────────────────────────────────────────────────────────
map("n", "<A-Up>", "<cmd>m .-2<CR>==", { desc = "Move line up" })
map("n", "<A-Down>", "<cmd>m .+1<CR>==", { desc = "Move line down" })
map("i", "<A-Up>", "<Esc><cmd>m .-2<CR>==gi", { desc = "Move line up" })
map("i", "<A-Down>", "<Esc><cmd>m .+1<CR>==gi", { desc = "Move line down" })
map("v", "<A-Up>", ":m '<-2<CR>gv=gv", { desc = "Move selection up" })
map("v", "<A-Down>", ":m '>+1<CR>gv=gv", { desc = "Move selection down" })

map("n", "<A-S-Up>", "<cmd>t .-1<CR>", { desc = "Duplicate line up" })
map("n", "<A-S-Down>", "<cmd>t .<CR>", { desc = "Duplicate line down" })
map("v", "<A-S-Up>", ":t '<-1<CR>gv", { desc = "Duplicate selection up" })
map("v", "<A-S-Down>", ":t '><CR>gv", { desc = "Duplicate selection down" })

-- ─────────────────────────────────────────────────────────
-- 줄 삭제 (Ctrl+Shift+K)
-- ─────────────────────────────────────────────────────────
map("n", "<C-S-k>", "dd", { desc = "Delete line" })
map("i", "<C-S-k>", "<Esc>ddi", { desc = "Delete line" })

-- ─────────────────────────────────────────────────────────
-- LSP (F2, F12, Ctrl+.)
-- ─────────────────────────────────────────────────────────
map("n", "<F2>", vim.lsp.buf.rename, { desc = "Rename symbol" })
map("n", "<F12>", vim.lsp.buf.definition, { desc = "Go to definition" })
map("n", "<S-F12>", vim.lsp.buf.references, { desc = "Find references" })
map({ "n", "v" }, "<C-.>", vim.lsp.buf.code_action, { desc = "Code action" })
map("i", "<C-.>", "<Esc><cmd>lua vim.lsp.buf.code_action()<CR>", { desc = "Code action" })

-- ─────────────────────────────────────────────────────────
-- 심볼 이동 (Ctrl+Shift+O)
-- ─────────────────────────────────────────────────────────
map({ "n", "i" }, "<C-S-o>", "<cmd>Telescope lsp_document_symbols<CR>", { desc = "Go to symbol" })

-- ─────────────────────────────────────────────────────────
-- 탭 이동 (Ctrl+PageUp/PageDown)
-- Ctrl+Tab 은 대부분 터미널에서 가로채므로 PageUp/Down 권장
-- ─────────────────────────────────────────────────────────
map("n", "<C-PageDown>", "<cmd>BufferLineCycleNext<CR>", { desc = "Next tab" })
map("n", "<C-PageUp>", "<cmd>BufferLineCyclePrev<CR>", { desc = "Prev tab" })

-- ─────────────────────────────────────────────────────────
-- 파일/버퍼 닫기 (Ctrl+F4 — Ctrl+W 는 window prefix 로 남겨둠)
-- ─────────────────────────────────────────────────────────
map("n", "<C-F4>", "<cmd>bdelete<CR>", { desc = "Close buffer" })

-- ─────────────────────────────────────────────────────────
-- 파일 끝/시작 (Ctrl+Home/End) — 기본은 gg / G
-- ─────────────────────────────────────────────────────────
map({ "n", "i", "v" }, "<C-Home>", "<cmd>normal! gg<CR>", { desc = "Go to file start" })
map({ "n", "i", "v" }, "<C-End>", "<cmd>normal! G<CR>", { desc = "Go to file end" })

-- ─────────────────────────────────────────────────────────
-- Ctrl+A: 전체 선택 (vim 은 기본적으로 ggVG 조합)
-- ⚠ Normal 모드 <C-a> 는 숫자 증가라 주의 — Insert/Visual 에서만 매핑
-- ─────────────────────────────────────────────────────────
map("i", "<C-a>", "<Esc>ggVG", { desc = "Select all" })

-- ─────────────────────────────────────────────────────────
-- 문제(진단) 창 토글 — VS Code 의 Ctrl+Shift+M
-- ─────────────────────────────────────────────────────────
map("n", "<C-S-m>", "<cmd>Telescope diagnostics<CR>", { desc = "Show problems" })
