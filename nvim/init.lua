-- Entry point. Keep this file tiny — everything else lives under lua/.
require("config.options")
require("config.keymaps")
require("config.autocmds")
require("config.lazy")
require("config.vscode-keymaps") -- VS Code 스타일 단축키. 끄려면 이 줄 주석
