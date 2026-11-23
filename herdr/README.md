# herdr 데스크톱 앱 (herdr-app)

`app/` 이 `~/.config/herdr-app` 의 내 몫이다 — 키(`keys.json`), 레이아웃(`layouts/main-num.json`), mod 6개. 앱 문서는 `~/.config/herdr-app/AGENTS.md`.

```bash
sh "$REPO/herdr/app/link.sh"   # 링크 걸기. 고친 뒤에도 다시 돌린다 — 앱은 자기 폴더만 감시해서 링크를 바꿔야 다시 읽는다
```

- `layouts/` 는 폴더째 링크한다(앱이 파일을 원자적으로 바꿔 써서 파일 링크는 끊긴다). git 엔 `main-num.json` 만.
- prefix `ctrl-space` 는 `mods/prefix` 팝업이 다음 키 하나를 받는다(`, . /` 이름 변경, `⇧1-9` 워크스페이스).
- `ctrl-1~3` Decision Queue(`mods/queue`, prefix `q` 가 단 `deck.q` 라벨) · `ctrl-4~9` 워크스페이스.
- 워크스페이스·탭 번호는 `spaces-num` · `tabs-num`, 페인 이름은 앱 내장 `pane.rename`(우클릭 Rename, `prefix+/`)이고 `pane-named` 머리줄이 그린다.
- Hermes 를 Agents 목록에: Hermes 는 턴을 터미널 없는 gateway 에서 돌려 스스로 OSC 7501 을 못 보낸다. gateway 플러그인 `hermes/hc-agent-state`(→ `~/.hermes/plugins/`, `config.yaml` `plugins.enabled`)가 상태를 `state/hc-agent-state.json` 에 적고, `hermes/hermes-hc`(→ `~/.local/bin/`)가 그걸 터미널로 보낸다. 앱의 Start an agent → Hermes 는 `programs.json` 으로 `hermes-hc` 를 띄운다. 플러그인을 새로 켜면 gateway 를 다시 띄워야 읽는다.
- 꼬이면 `ctrl-alt-shift-escape` — `keys.json`·레이아웃을 옆으로 치우고 기본으로. 그 뒤 `link.sh` 로 되돌린다.
