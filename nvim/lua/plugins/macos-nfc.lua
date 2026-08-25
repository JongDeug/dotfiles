-- macOS stores Hangul filenames as NFD (자모 분해). iTerm often shows NFC,
-- but nvim pickers print the raw NFD string: 사포.js → ㅅㅏㅍㅗ.js
-- iconv utf-8-mac → utf-8 recomposes for display. Open still uses the real path.
if vim.fn.has("mac") ~= 1 then
  return {}
end

local function nfc(s)
  if type(s) ~= "string" or s == "" then
    return s
  end
  local out = vim.fn.iconv(s, "utf-8-mac", "utf-8")
  if out == nil or out == "" then
    return s
  end
  return out
end

return {
  {
    "folke/snacks.nvim",
    opts = function()
      vim.api.nvim_create_autocmd("User", {
        pattern = "VeryLazy",
        once = true,
        callback = function()
          local ok, fmt = pcall(require, "snacks.picker.format")
          if not ok or fmt._macos_nfc then
            return
          end
          fmt._macos_nfc = true
          local orig = fmt.filename
          fmt.filename = function(item, picker)
            if item.file then
              item = setmetatable({ file = nfc(item.file) }, { __index = item })
            end
            return orig(item, picker)
          end
        end,
      })
    end,
  },
  {
    "nvim-neo-tree/neo-tree.nvim",
    opts = {
      filesystem = {
        components = {
          name = function(config, node, state)
            local orig = node.name
            node.name = nfc(orig)
            local ret = require("neo-tree.sources.common.components").name(config, node, state)
            node.name = orig
            return ret
          end,
        },
      },
    },
  },
  {
    "akinsho/bufferline.nvim",
    opts = {
      options = {
        name_formatter = function(buf)
          return nfc(vim.fn.fnamemodify(buf.name, ":t"))
        end,
      },
    },
  },
}
