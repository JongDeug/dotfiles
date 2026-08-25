# nvim 치트시트

외울 필요 없다. **`Space` 누르고 0.3초** 기다리면 목록이 뜬다. herdr의 `prefix+?`와 같다.

키를 검색: `Space sk` 하고 `debug`, `git` 같이 친다.

공식 전체: https://www.lazyvim.org/keymaps

leader 는 **Space**.

## 매일

| 키 | 동작 |
|---|---|
| `Esc` | Normal. 입력은 `i` |
| `Space e` | 파일 트리 (`.` 파일 기본 표시. 트리 안 `H` 로 숨김) |
| `Space ff` | 파일 찾기 (`.` 파일 포함. `.vscode/launch.json` 등) |
| `Space /` | 내용 검색 (`.` 파일 포함) |
| 피커 `Esc` 후 `H` | 숨김 on/off. `Option+h` 는 AeroSpace가 창 이동으로 먹음 |
| `gd` | 정의로 |
| `K` | hover |
| `Shift+h` / `l` | 탭 이동 |
| `Space bd` | 탭 닫기 |
| `:w` / `:q` | 저장 / 종료 |
| `Ctrl+h/j/k/l` | nvim 창 이동 |
| `Ctrl+Space` `h/j/k/l` | herdr 페인 이동 |

## Git

| 키 | 동작 |
|---|---|
| `Space gs` | diff (status) |
| `Space ge` | 변경 파일 트리 |
| `Space gt` | 커밋 그래프 |
| `Space gg` | lazygit |
| `Space hs` | 지금 hunk stage |

## Markdown

| 키 | 동작 |
|---|---|
| md 열면 | 버퍼 안에서 렌더 |
| `Space um` | 그 렌더 on/off |
| `Space cp` | 브라우저 미리보기 (저장하면 따라감) |

## herdr 사이드바

| 키 | 동작 |
|---|---|
| `Ctrl+Space v` | nvim 칸 on/off |
| `Ctrl+Space f` | 에이전트가 만진 파일 |
| `Space hc` | 줄 코멘트 → 에이전트 |
| `Space hS` | 코멘트 전송 |

## 디버그

Go / Python / TypeScript. `launch.json` 있으면 그걸 쓴다.

| 키 | 동작 |
|---|---|
| `Space db` | 브레이크포인트 |
| `Space dc` | 실행. 토스트 + 아래 터미널(ANSI 색 그대로) |
| `Space dO` | step over |
| `Space di` | step into |
| `Space do` | step out |
| `Space dt` | 중지 |
| `Space du` | 스코프/와치 패널 (필요할 때만) |
| `Space de` | 선택/커서 eval |

처음 `Space dc` 하면 Mason이 해당 언어 어댑터를 받을 수 있다.

vscode-neovim 안에서는 VS Code 디버거(`F5`)를 쓴다.
