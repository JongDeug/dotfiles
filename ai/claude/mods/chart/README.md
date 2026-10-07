# chart

답 속 ```` ```chart ```` 블록(Vega-Lite JSON)을 그래프 그림으로 그리는 mod. ```` ```vega-lite ```` 도 같다.

````
```chart
{"title":"9월 지출","data":{"values":[{"분류":"식비","원":420000},{"분류":"교통","원":98000}]},
 "mark":"bar","encoding":{"x":{"field":"분류"},"y":{"field":"원","type":"quantitative"}}}
```
````

- 폭·높이·색은 비워 두면 터미널 폭과 Catppuccin 계열 색에 맞춘다. 배경 투명, 한글 라벨(Apple SD Gothic Neo).
- Claude 에게 "숫자는 chart 블록으로 그릴 수 있다"는 안내를 붙인다 — 비교·추이·분류별 합계를 물으면 알아서 그린다.
- 렌더: `bin/render.mjs` (vega-lite → vega → SVG → resvg PNG 2배). 못 그리면 코드 그대로 두고 아래에 이유를 단다.
- 그림 요소(kitty 그래픽)가 되는 터미널 필요 — herdr 안이면 `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`.
- **크게 보기 · PNG 저장** — 차트에 포인터를 올리면 밑에 `⤢ 크게 보기` `↓ PNG 저장`. 크게 보기는 pane 크기에 맞춰 다시 그리고, 저장은 `~/Downloads`.
- **나란히** — `{"hconcat":[…,…]}` 면 폭을 나눠 갖는다.
