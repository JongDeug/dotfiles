return {
  {
    "mfussenegger/nvim-dap",
    dependencies = {
      "rcarriga/nvim-dap-ui",
      "nvim-neotest/nvim-nio",
      "theHamsta/nvim-dap-virtual-text",
      "leoluz/nvim-dap-go",
      "mfussenegger/nvim-dap-python",
      "williamboman/mason.nvim",
    },
    keys = {
      { "<F5>",  function() require("dap").continue() end,          desc = "Debug: Continue" },
      { "<F9>",  function() require("dap").toggle_breakpoint() end,  desc = "Debug: Toggle Breakpoint" },
      { "<F10>", function() require("dap").step_over() end,          desc = "Debug: Step Over" },
      { "<F11>", function() require("dap").step_into() end,          desc = "Debug: Step Into" },
      { "<F12>", function() require("dap").step_out() end,           desc = "Debug: Step Out" },
      { "<leader>db", function() require("dap").toggle_breakpoint() end, desc = "Toggle Breakpoint" },
      { "<leader>dc", function() require("dap").continue() end,      desc = "Continue" },
      { "<leader>dq", function()
          require("dap").terminate()
          require("dapui").close()
        end, desc = "Quit Debug" },
    },
    config = function()
      local dap = require("dap")
      local dapui = require("dapui")

      dapui.setup({
        layouts = {
          {
            elements = {
              { id = "scopes",      size = 0.4 },
              { id = "breakpoints", size = 0.2 },
              { id = "stacks",      size = 0.2 },
              { id = "watches",     size = 0.2 },
            },
            size = 40,
            position = "left",
          },
          {
            elements = { { id = "console", size = 1 } },
            size = 12,
            position = "bottom",
          },
        },
      })

      -- UI 자동 열기/닫기
      dap.listeners.after.event_initialized["dapui_config"] = function() dapui.open() end
      dap.listeners.before.event_terminated["dapui_config"] = function() dapui.close() end
      dap.listeners.before.event_exited["dapui_config"] = function() dapui.close() end

      -- virtual text
      require("nvim-dap-virtual-text").setup()

      -- Go (delve)
      require("dap-go").setup()

      -- Python (debugpy)
      local python_path = vim.fn.exepath("python3")
      require("dap-python").setup(python_path)

      -- TypeScript / JavaScript (js-debug-adapter via Mason)
      local js_debug = vim.fn.stdpath("data") .. "/mason/bin/js-debug-adapter"
      if vim.fn.executable(js_debug) == 1 then
        for _, lang in ipairs({ "typescript", "javascript", "typescriptreact", "javascriptreact" }) do
          dap.configurations[lang] = {
            {
              type = "pwa-node",
              request = "launch",
              name = "Launch file",
              program = "${file}",
              cwd = "${workspaceFolder}",
            },
            {
              type = "pwa-node",
              request = "attach",
              name = "Attach to process",
              processId = require("dap.utils").pick_process,
              cwd = "${workspaceFolder}",
            },
          }
        end
        dap.adapters["pwa-node"] = {
          type = "server",
          host = "localhost",
          port = "${port}",
          executable = {
            command = js_debug,
            args = { "${port}" },
          },
        }
      end

      -- 브레이크포인트 아이콘
      vim.fn.sign_define("DapBreakpoint",          { text = "●", texthl = "DiagnosticError" })
      vim.fn.sign_define("DapBreakpointCondition", { text = "◆", texthl = "DiagnosticWarn" })
      vim.fn.sign_define("DapStopped",             { text = "▶", texthl = "DiagnosticInfo", linehl = "CursorLine" })
    end,
  },

  {
    "rcarriga/nvim-dap-ui",
    dependencies = { "nvim-neotest/nvim-nio" },
  },
}
