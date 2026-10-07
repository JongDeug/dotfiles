# 전역 지시 (모든 프로젝트)

## 보여 주는 페이지는 Claude Code pane 에

설명·시각화·대시보드처럼 사용자가 **볼** HTML 페이지(아티팩트 성격)를 만들면, 로컬 파일로 쓰고 대화 옆 브라우저 pane 에 띄운다.

- 파일: 코드 저장소 밖, `~/.cache/explain/YYYY-MM-DD-<slug>.html` — 한 파일에 CSS·JS 다 넣는다.
- 띄우기: terminal-browser 플러그인의 `open` 도구(`url: "file://<절대 경로>"`). 도구가 없으면 `terminal-browser new-tab file://<경로>`(pane 브라우저가 이미 떠 있을 때), 그것도 안 되면 사용자에게 `/browser file://<경로>` 를 알려 준다.
- claude.ai 아티팩트로 올리는 건 **공유하려 할 때만**(남에게 줄 링크, 폰에서 보기). 사용자가 말하지 않으면 올리지 않는다.
