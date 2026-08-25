-- VS Code launch.json → nvim-dap.
-- medichis-apiServer 처럼 program 없이 args 만 있고 ${workspaceRoot} 를 쓰는 옛 Node 구성을 고친다.
if vim.g.vscode then
  return {}
end

return {
  {
    "mfussenegger/nvim-dap",
    opts = function()
      local dap = require("dap")
      local function subst(s, cwd)
        s = s:gsub("%${workspaceRoot}", cwd)
        s = s:gsub("%${workspaceFolder}", cwd)
        return s
      end
      local function walk(x, cwd)
        if type(x) == "string" then
          return subst(x, cwd)
        elseif type(x) == "table" then
          local out = {}
          for k, v in pairs(x) do
            out[k] = walk(v, cwd)
          end
          return out
        elseif x == vim.NIL then
          return nil
        end
        return x
      end

      -- DAP REPL 은 일반 버퍼라 ANSI 를 글자로 보여 준다.
      -- nvim 터미널 에뮬레이터가 CSI 를 색으로 그린다.
      local term = { buf = nil, chan = nil }

      local function show_term(buf)
        for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
          if vim.api.nvim_win_get_buf(win) == buf then
            return win
          end
        end
        local cur = vim.api.nvim_get_current_win()
        vim.cmd("botright 12split")
        local win = vim.api.nvim_get_current_win()
        vim.api.nvim_win_set_buf(win, buf)
        vim.wo[win].winfixheight = true
        vim.wo[win].number = false
        vim.wo[win].relativenumber = false
        vim.wo[win].signcolumn = "no"
        vim.api.nvim_set_current_win(cur)
        return win
      end

      local function ensure_term()
        if term.buf and vim.api.nvim_buf_is_valid(term.buf) and term.chan then
          show_term(term.buf)
          return
        end
        term.buf = vim.api.nvim_create_buf(false, true)
        pcall(vim.api.nvim_buf_set_name, term.buf, "[dap-output]")
        term.chan = vim.api.nvim_open_term(term.buf, {})
        show_term(term.buf)
      end

      local function cmdline(config)
        local parts = {}
        local function push(x)
          if x == nil or x == "" then
            return
          end
          x = tostring(x)
          if x:find("%s") then
            x = '"' .. x .. '"'
          end
          parts[#parts + 1] = x
        end
        push(config.runtimeExecutable)
        for _, a in ipairs(config.runtimeArgs or {}) do
          push(a)
        end
        push(config.program)
        for _, a in ipairs(config.args or {}) do
          push(a)
        end
        return table.concat(parts, " ")
      end

      dap.listeners.on_config["dotfiles.vscode_launch"] = function(config)
        config = walk(vim.deepcopy(config), vim.fn.getcwd())
        if config.protocol == "inspector" then
          config.protocol = nil
        end
        if config.runtimeExecutable == nil or config.runtimeExecutable == "" then
          config.runtimeExecutable = "node"
        end
        if (not config.program or config.program == "") and type(config.args) == "table" and config.args[1] then
          config.program = config.args[1]
          local rest = {}
          for i = 2, #config.args do
            rest[#rest + 1] = config.args[i]
          end
          config.args = rest
        end
        -- VS Code node 의 restart:true 는 프로세스가 죽으면 세션을 다시 연다.
        -- 실패하면 DAP UI / neo-tree 가 창을 뺏고 깜빡인다.
        config.restart = false
        local cmd = cmdline(config)
        if cmd == "" then
          cmd = config.request or "?"
        end
        vim.schedule(function()
          vim.notify(
            string.format(
              "DAP  %s\n%s\ncwd  %s",
              config.name or config.type or "debug",
              cmd,
              config.cwd or vim.fn.getcwd()
            ),
            vim.log.levels.INFO,
            { title = "Debug" }
          )
        end)
        return config
      end

      dap.defaults.fallback.terminal_win_cmd = "botright 12split"
      dap.defaults.fallback.focus_terminal = false
      dap.defaults.fallback.on_output = function(_, body)
        if body.category == "telemetry" or not body.output then
          return
        end
        ensure_term()
        pcall(vim.api.nvim_chan_send, term.chan, body.output)
      end
      dap.listeners.after.event_initialized["dotfiles.dap_term"] = function()
        vim.schedule(function()
          term.buf, term.chan = nil, nil
          ensure_term()
        end)
      end
    end,
  },
  {
    "rcarriga/nvim-dap-ui",
    init = function()
      vim.api.nvim_create_autocmd("VimEnter", {
        once = true,
        callback = function()
          vim.defer_fn(function()
            local ok, dap = pcall(require, "dap")
            if not ok then
              return
            end
            dap.listeners.after.event_initialized["dapui_config"] = nil
            dap.listeners.before.event_terminated["dapui_config"] = nil
            dap.listeners.before.event_exited["dapui_config"] = nil
          end, 800)
        end,
      })
    end,
    opts = {
      layouts = {
        {
          elements = { "scopes", "breakpoints", "stacks", "watches" },
          size = 40,
          position = "right",
        },
        {
          elements = { "repl", "console" },
          size = 10,
          position = "bottom",
        },
      },
    },
    config = function(_, opts)
      local dap = require("dap")
      local dapui = require("dapui")
      dapui.setup(opts)
      -- dap-ui console 이 terminal_win_cmd 를 일반 버퍼로 바꿔서 ANSI 가 깨진다.
      dap.defaults.fallback.terminal_win_cmd = "botright 12split"
      dap.defaults.fallback.focus_terminal = false
      -- 시작 때 패널을 안 연다. 로그는 아래 터미널, 패널은 Space du.
      dap.listeners.after.event_initialized["dapui_config"] = nil
      dap.listeners.before.event_terminated["dapui_config"] = nil
      dap.listeners.before.event_exited["dapui_config"] = nil
      dap.listeners.after.event_initialized["dotfiles.dap_console"] = nil
    end,
  },
}
