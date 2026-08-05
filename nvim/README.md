# nvim

Neovim IDE 설정. `~/.config/nvim` 이 이 디렉토리로 심볼릭 링크되어 있음.

## 구조

```
config/nvim/
├── init.lua              # 진입점
├── lua/
│   ├── config/
│   │   ├── options.lua   # vim.opt.*
│   │   ├── keymaps.lua   # 전역 키맵
│   │   ├── autocmds.lua  # 자동 명령
│   │   └── lazy.lua      # lazy.nvim bootstrap
│   └── plugins/
│       ├── colorscheme.lua   # tokyonight
│       ├── treesitter.lua    # 문법 하이라이팅
│       ├── lsp.lua           # LSP + Mason
│       ├── cmp.lua           # 자동완성
│       ├── telescope.lua     # 퍼지 파인더
│       ├── nvim-tree.lua     # 파일 탐색기
│       └── ui.lua            # lualine, gitsigns, which-key 등
└── lazy-lock.json        # 플러그인 버전 락
```

## 리더 키

`<Space>` — 모든 `<leader>` 매핑의 시작점.

## 주요 키맵

### 파일/버퍼
| 키 | 동작 |
|---|---|
| `<leader>ff` | 파일 찾기 (Telescope) |
| `<leader>fg` | 라이브 grep |
| `<leader>fb` | 열린 버퍼 |
| `<leader>fr` | 최근 파일 |
| `<leader>/` | 현재 버퍼 내 검색 |
| `<leader>e` | 파일 트리 토글 |
| `<leader>w` / `<leader>q` | 저장 / 종료 |
| `<S-l>` / `<S-h>` | 다음/이전 버퍼 |

### LSP
| 키 | 동작 |
|---|---|
| `gd` | 정의로 이동 |
| `gr` | 참조 찾기 |
| `K` | 호버 정보 |
| `<leader>rn` | 심볼 이름 변경 |
| `<leader>ca` | 코드 액션 |
| `<leader>cf` | 버퍼 포맷 |
| `<leader>cd` | 라인 진단 |
| `[d` / `]d` | 이전/다음 진단 |

### Git (gitsigns)
| 키 | 동작 |
|---|---|
| `]c` / `[c` | 다음/이전 hunk |
| `<leader>hs` | hunk stage |
| `<leader>hr` | hunk reset |
| `<leader>hp` | hunk preview |
| `<leader>hb` | 라인 blame |

### 창/분할
- `<C-h/j/k/l>` — 창 이동
- `<C-화살표>` — 창 크기 조절

## 설치된 LSP

Mason이 자동으로 설치: `lua_ls`, `gopls`, `ts_ls`, `pyright`, `bashls`, `jsonls`, `yamlls`.

더 추가하려면 `:Mason` 을 열거나 `lua/plugins/lsp.lua` 의 `servers` 테이블에 항목 추가.

## 첫 실행

처음 nvim 열면 lazy.nvim 이 자동으로 플러그인을 설치합니다. 이어서 `:MasonUpdate` 한 번 돌리면 LSP가 들어옵니다.

```bash
nvim  # lazy 자동 설치 대기 → :q
nvim  # 이제 LSP/Treesitter 동작
```

## 관리 명령

- `:Lazy` — 플러그인 목록/업데이트
- `:Mason` — LSP/포매터/린터 설치 UI
- `:checkhealth` — 환경 점검
