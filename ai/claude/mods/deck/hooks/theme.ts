// Flight Deck 의 색 — herdr 테마(gruvbox dark). 계기판·크게 보기·버튼이 다 여기서 가져간다.
// bin/chart.mjs · bin/mermaid.mjs 는 node 로 따로 돌아서 같은 값을 각자 적어 둔다(바꾸면 거기도).
export const C = {
  base: '#282828', // bg0 — 알약 위 글자
  surface: '#3c3836', // bg1 — 알약 바탕
  overlay: '#504945', // bg2
  text: '#ebdbb2', // fg
  sub: '#a89984', // fg4 — 흐린 글자
  yellow: '#fabd2f', // herdr 강조색 — 경로, 크게 보기 제목
  teal: '#8ec07c', // 아쿠아 — 브랜치, 비용
  peach: '#fe8019', // 주황 — 모델
  green: '#b8bb26',
  red: '#fb4934',
  blue: '#83a598', // 캐시
  mauve: '#d3869b', // 지금 도는 작업
}

// 계기판 알약 바탕용 — 위 색을 바탕(bg0)쪽으로 35% 섞어 누그러뜨린 것. 글자는 그대로 bg0.
export const SOFT: Record<string, string> = {
  [C.yellow]: '#b0892d',
  [C.teal]: '#6a8b5f',
  [C.peach]: '#b3611e',
  [C.green]: '#868827',
  [C.red]: '#b13d30',
  [C.blue]: '#637971',
  [C.mauve]: '#976573',
}
