# herdr

키바인딩은 tmux에 맞춰 둔다. 플러그인 바이너리는 repo에 넣지 않고, 쓰는 목록과 설치 명령만 여기에 적는다.

마켓플레이스: [herdr.dev/plugins](https://herdr.dev/plugins/)  
설치: `herdr plugin install owner/repo --yes`

## 심링크

```bash
ln -sfn "$REPO/herdr/config.toml" ~/.config/herdr/config.toml
```

적용: herdr에서 `prefix+shift+r`, 또는 `herdr server reload-config`.

prefix는 `ctrl+space` — tmux와 같다. 키 전체는 herdr 안에서 `prefix+?`.
tmux를 herdr 페인 안에서 쓰면 prefix가 겹친다. tmux는 `Ctrl+Space`를 한 번 더 보내 `send-prefix`한다.

공식 에이전트 스킬 (`/herdr`):

```bash
npx skills add herdrdev/herdr --skill herdr -g
```

## 마켓플레이스에서 쓰는 플러그인

지금 머신에 켜 둔 것.

| 플러그인 | 설치 | 하는 일 |
|---|---|---|
| [herdr-nvim](https://github.com/ChmaraX/herdr-nvim) | `herdr plugin install ChmaraX/herdr-nvim --yes` | nvim 사이드바 |
| agent-numbers | `herdr plugin link "$REPO/herdr/plugins/agent-numbers"` | 워크스페이스/탭 `1:` 와 에이전트 `$n` |

확인: `herdr plugin list`

점프: 워크스페이스 `Ctrl+Space` `Shift+1..9`, 탭 `Ctrl+Space` `1..9`, 에이전트 `Ctrl+1..9`.

페인 이동은 herdr 기본 `prefix+h/j/k/l` (`Ctrl+Space` 다음 `h/j/k/l`).

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
