// /deck:help — deck 이 하는 일과 명령을 한 장으로. 줄마다 [무엇, 설명].
import { cellWidth } from './board'

export type HelpSection = { title: string; rows: [string, string][] }

export const HELP: HelpSection[] = [
  {
    title: '명령',
    rows: [
      ['/deck:pin [off]', '직전 답의 표(없으면 답 전체)를 옆 pane 에 고정 · off 로 내림'],
      ['/deck:queue [list]', 'Decision Queue 에 이 세션 넣기·빼기 (herdr) · list 로 보기'],
      ['/deck:pet [off]', '펫을 이 세션에서 띄우기 · off 로 숨기기'],
      ['/deck:config', '설정 보기 · /deck:config <이름> <값> 으로 바꾸기'],
      ['/deck:sync', 'push 한 deck 을 두 설정 폴더에 깔고 쉬는 세션 리로드'],
      ['/deck:help', '이 안내'],
    ],
  },
  {
    title: '설정 — /deck:config <이름> <값>',
    rows: [
      ['style', 'clean | sketch — 그림을 반듯하게 · 손그림으로'],
      ['pet', 'slime | off — 펫을 아예 끄려면 off'],
      ['scale', '0.5~2 — 다이어그램 크기'],
      ['max_rows', '5~120 — 그림 하나의 최대 줄 수'],
      ['cell_aspect', '1~4 — 칸 높이÷너비, 그림이 늘어나 보이면 줄인다'],
      ['queue_cap', '1~9 — Decision Queue 칸 수'],
    ],
  },
  {
    title: '저절로',
    rows: [
      ['계기판', '입력창 위 두 줄 — 경로·브랜치·모델·CI / 큐·CTX·5H·7D'],
      ['그림', '답 속 ```mermaid · ```chart · ![](경로) 를 그림으로 — ⤢ 크게 · ▴ 접기 · ↓ PNG'],
      ['커밋 검문', '서명 줄·add -A·제목 type 같은 커밋 규칙에 걸리면 실행 전에 돌려보낸다'],
      ['펫', '계기판 오른쪽 슬라임 — 일하면 흐르고, 쉬면 숨 쉬고, 오류엔 시무룩'],
    ],
  },
]

// 명령 결과로 대화에 찍을 글 — 왼쪽 열을 화면 칸 폭으로 맞춘다(한글은 두 칸).
export function helpText(): string {
  const w = Math.max(...HELP.flatMap(sec => sec.rows.map(([k]) => cellWidth(k)))) + 2
  return '🛫 Flight Deck\n\n' + HELP.map(sec => [sec.title, ...sec.rows.map(([k, d]) => `  ${k}${' '.repeat(w - cellWidth(k))}${d}`)].join('\n')).join('\n\n')
}
