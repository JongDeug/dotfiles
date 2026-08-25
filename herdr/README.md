# herdr

키바인딩은 tmux에 맞춰 둔다. 플러그인 바이너리는 repo에 넣지 않고, 쓰는 목록과 설치 명령만 여기에 적는다.

마켓플레이스: [herdr.dev/plugins](https://herdr.dev/plugins/)  
설치: `herdr plugin install owner/repo --yes`

## 심링크

```bash
ln -sfn "$REPO/herdr/config.toml" ~/.config/herdr/config.toml
```

적용: herdr에서 `prefix+shift+r`, 또는 `herdr server reload-config`.

prefix는 `ctrl+space`. 키 전체는 herdr 안에서 `prefix+?`.

## 마켓플레이스에서 쓰는 플러그인

지금 머신에 켜 둔 것. 새 PC에서도 이 두 개만 깔면 된다.

| 플러그인 | GitHub | 하는 일 |
|---|---|---|
| [vim-herdr-navigation](https://github.com/paulbkim-dev/vim-herdr-navigation) | `paulbkim-dev/vim-herdr-navigation` | `Ctrl+h/j/k/l`로 nvim 창과 herdr 페인을 같이 넘김 |
| [herdr-nvim](https://github.com/ChmaraX/herdr-nvim) | `ChmaraX/herdr-nvim` | 탭 오른쪽에 nvim 사이드바. 에이전트가 만진 파일 피커 |

```bash
herdr plugin install paulbkim-dev/vim-herdr-navigation --yes
herdr plugin install ChmaraX/herdr-nvim --yes
```

확인: `herdr plugin list`

### vim-herdr-navigation

키는 `config.toml`의 `[[keys.command]]` (`ctrl+h/j/k/l`). nvim 쪽은 `nvim/lua/config/keymaps.lua`.

셸 페인에서 `Ctrl+l` 화면 지우기는 안 된다. 클리어는 `clear` 또는 `prefix+l`.

### herdr-nvim

herdr 플러그인 + nvim lua 플러그인 둘이다.

```bash
mkdir -p ~/.config/herdr-nvim
ln -sfn "$REPO/herdr/herdr-nvim.toml" ~/.config/herdr-nvim/config.toml
```

nvim 반은 `nvim/lua/plugins/herdr-nvim.lua`.

| 키 | 동작 |
|---|---|
| `prefix+v` | nvim 사이드바 on/off. `prefix+e`(스크롤백)와 안 겹침 |
| `prefix+f` | 에이전트가 만진 파일 피커. `prefix+o`(워크트리)와 안 겹침 |
| nvim `Space hc` | 줄 코멘트 |
| nvim `Space hl` | 코멘트 목록 |
| nvim `Space hs` / `hS` | 에이전트에 붙여넣기 / 전송 |

사이드바는 문서 이름을 안 넘기고 nvim 칸만 붙인다. 처음 켜면 폴더 트리가 뜬다. 에이전트가 고친 파일은 `prefix+f`.
