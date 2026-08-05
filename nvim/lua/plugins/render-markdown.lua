-- 마크다운 파일을 nvim 버퍼 안에서 그대로 렌더링.
-- 커서가 있는 줄만 raw 마크다운으로 풀리고 나머지는 헤딩/체크박스/코드블록/테이블이 예쁘게 박스 처리됨.
-- :RenderMarkdown toggle 으로 raw <-> 렌더 전환.
return {
  {
    "MeanderingProgrammer/render-markdown.nvim",
    dependencies = {
      "nvim-treesitter/nvim-treesitter",
      "nvim-tree/nvim-web-devicons",
    },
    ft = { "markdown" },
    opts = {
      code = {
        style = "full",
        width = "block", -- 코드 길이만큼만 박스. 화면 가득 늘어나는 게 싫으면 이 옵션.
      },
      heading = {
        sign = false, -- 사인 컬럼 아이콘 끔 (좌측 여백 깔끔하게)
      },
    },
    keys = {
      { "<leader>mr", "<cmd>RenderMarkdown toggle<CR>", desc = "Markdown render toggle" },
    },
  },
}
