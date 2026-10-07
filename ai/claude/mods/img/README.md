# img

이미지를 Claude Code 대화 안에 그림으로 보여 주는 mod.

- **Read 로 읽은 이미지** — 그 도구 줄 바로 아래에 그림.
- **답 속 이미지 줄** — 한 줄을 통째로 차지한 `![설명](/절대/경로.png)` 은 그 자리에 그림, 밑에 설명. 문장 중간의 이미지 문법·웹 URL 은 글로 둔다.
- **나란히 비교** — 한 줄에 `![v6](/a.png) ![v7](/b.png)` 처럼 여러 장이면 폭을 나눠 나란히.
- **영상** — `![비행](/경로.mp4)` 은 길이를 6등분한 프레임 6장을 3×2 한 장으로(ffmpeg).
- Claude 에게 "이 터미널은 그림을 보여 준다"는 안내를 붙여, 결과 이미지를 보여 줄 때 이 문법을 쓰게 한다.

PNG·JPG·GIF·WEBP·HEIC 등을 macOS `sips` 로 PNG 로 바꿔 `~/.cache/claude-img` 에 둔다(`bin/convert.sh`). 긴 변 1600px 를 넘을 때만 줄인다. 그림 요소(kitty 그래픽)가 되는 터미널 필요 — herdr 안이면 `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`.

## 설정 (`/plugin` → img → configure)

| 키 | 기본 | |
|---|---|---|
| `max_rows` | `30` | 그림 하나의 최대 높이(줄) |
| `cell_aspect` | `2.2` | 칸 높이÷너비. 그림이 길쭉하면 줄이고 납작하면 키운다 |
