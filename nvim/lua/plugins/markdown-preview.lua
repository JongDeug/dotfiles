-- macOS 가 미리 받은 markdown-preview 바이너리를 SIGKILL 한다 (서명 불량).
-- 파일이 있으면 node 폴백을 안 타므로 bin 을 지우고 npm 으로 깐다.
return {
  {
    "iamcco/markdown-preview.nvim",
    build = function()
      local root = vim.fn.stdpath("data") .. "/lazy/markdown-preview.nvim"
      vim.fn.delete(root .. "/app/bin", "rf")
      if vim.fn.executable("npm") == 0 then
        error("markdown-preview.nvim: npm not found")
      end
      vim.fn.system({ "npm", "install", "--prefix", root .. "/app" })
      if vim.v.shell_error ~= 0 then
        error("markdown-preview.nvim: npm install failed")
      end
    end,
  },
}
