-- 마크다운 (mermaid 다이어그램 포함) 을 브라우저에서 실시간 프리뷰.
-- :MarkdownPreview / :MarkdownPreviewStop / :MarkdownPreviewToggle 또는 <leader>mp.
--
-- 동작 원리: 플러그인이 로컬에 작은 node 서버를 띄우고 브라우저로 띄움.
-- nvim 버퍼 내용이 바뀔 때마다 websocket 으로 브라우저에 전송되어 실시간 갱신.
-- 터미널 종류와 무관하게 동작 (iTerm2 / 일반 터미널 모두 OK).
--
-- 빌드 메모:
--   build = function() vim.fn["mkdp#util#install"]() end 식으로 lua autoload 를
--   부르면 lazy.nvim 의 build 시점에 plugin 이 runtimepath 에 안 올라간 상태라
--   "Unknown mkdp util install" 로 실패함. shell 형태 (`cd app && npm install`)
--   로 직접 호출해 의존성 회피.
return {
  {
    "iamcco/markdown-preview.nvim",
    cmd = { "MarkdownPreview", "MarkdownPreviewStop", "MarkdownPreviewToggle" },
    ft = { "markdown" },
    build = "cd app && npm install",
    init = function()
      vim.g.mkdp_filetypes = { "markdown" }
      vim.g.mkdp_auto_close = 0     -- 마크다운 버퍼 떠나도 프리뷰 창 유지
      vim.g.mkdp_theme = "dark"
    end,
    keys = {
      { "<leader>mp", "<cmd>MarkdownPreviewToggle<CR>", desc = "Markdown preview toggle" },
    },
  },
}
