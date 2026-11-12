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

## 데스크톱 앱 (herdr-app)

`app/` 이 `~/.config/herdr-app` 의 내 몫이다 — 키(`keys.json`), 레이아웃(`layouts/main-num.json`), mod 6개. 앱 문서는 `~/.config/herdr-app/AGENTS.md`.

```bash
sh "$REPO/herdr/app/link.sh"   # 링크 걸기. 고친 뒤에도 다시 돌린다 — 앱은 자기 폴더만 감시해서 링크를 바꿔야 다시 읽는다
```

- `layouts/` 는 폴더째 링크한다(앱이 파일을 원자적으로 바꿔 써서 파일 링크는 끊긴다). git 엔 `main-num.json` 만.
- prefix `ctrl-space` 는 `mods/prefix` 팝업이 다음 키 하나를 받는다 — TUI 와 같은 배치(`, . /` 이름 변경, `⇧1-9` 워크스페이스).
- `ctrl-1~3` Decision Queue(`mods/queue`, `/deck:queue` 가 단 `deck.q` 라벨) · `ctrl-4~9` 워크스페이스.
- 워크스페이스·탭 번호는 `spaces-num` · `tabs-num`, 페인 이름(`prefix+/`)은 터미널 라벨 `pane.name` 을 `pane-named` 머리줄이 그린다.
- Hermes 를 Agents 목록에: Hermes 는 턴을 터미널 없는 gateway 에서 돌려 스스로 OSC 7501 을 못 보낸다. gateway 플러그인 `hermes/hc-agent-state`(→ `~/.hermes/plugins/`, `config.yaml` `plugins.enabled`)가 상태를 `state/hc-agent-state.json` 에 적고, `hermes/hermes-hc`(→ `~/.local/bin/`)가 그걸 터미널로 보낸다. 앱의 Start an agent → Hermes 는 `programs.json` 으로 `hermes-hc` 를 띄운다. 플러그인을 새로 켜면 gateway 를 다시 띄워야 읽는다.
- 꼬이면 `ctrl-alt-shift-escape` — `keys.json`·레이아웃을 옆으로 치우고 기본으로. 그 뒤 `link.sh` 로 되돌린다.

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
