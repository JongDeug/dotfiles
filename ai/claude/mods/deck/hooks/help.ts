// /deck — deck 이 하는 일과 명령을 한 장으로. 줄마다 [무엇, 설명].
import { cellWidth } from './board'

export type HelpSection = { title: string; rows: [string, string][] }

export const HELP: HelpSection[] = [
  {
    title: '📊 계기판 — 입력창 위 두 줄',
    rows: [
      ['위치 줄', '경로 · 브랜치 · 모델 · 바뀐 파일(올리면 목록) · CI'],
      ['남은 양 줄', 'CTX · 5H · 7D 게이지와 리셋까지 · 비용 · 🔥/h · 캐시 · 작업 중/지난 턴'],
      ['좁으면', '덜 중요한 알약부터 뺀다'],
    ],
  },
  {
    title: '💾 프롬프트 캐시',
    rows: [
      ['/keepwarm', '쉬는 동안 50분마다 핑으로 캐시를 데운다 — 6h · 90m · always · off · status'],
      ['/cache', '캐시 상태 카드 — guard warn | refuse (식은 채 큰 컨텍스트를 보낼 때 막을지)'],
    ],
  },
  {
    title: '🎨 답 속 그림 — 포인터를 올리면 ⤢ 크게 보기 · ↓ PNG 저장',
    rows: [
      ['```mermaid', '흐름 · 시퀀스 · 상태 · ER 다이어그램'],
      ['```chart', 'Vega-Lite 차트 (막대 · 선 · 원)'],
      ['![설명](/경로)', '이미지 · 영상(장면 여섯 장) · 한 줄에 여러 개면 나란히'],
    ],
  },
  {
    title: '🔒 저절로 하는 일',
    rows: [
      ['커밋 검문', 'git-commit 스킬 규칙(서명 줄 · add -A · 제목 type · 브랜치 · 본문 줄바꿈·표 · 팀 레포 develop)에 걸리면 실행 전에 돌려보낸다'],
    ],
  },
  {
    title: '🛸 드론 — 계기판 오른쪽 끝 (100칸 넘을 때)',
    rows: [
      ['ARMED', '일하는 중 — 날개 빠르게, 카메라 빨강'],
      ['HOVER · RTB', '쉬는 중 · 캐시 식음(날개 멈춤)'],
      ['DAMAGED', '커밋 검문·도구 오류 뒤 20초'],
      ['LOW BAT', '5H 한도 80% 넘음'],
      ['/drone', '기체 카드 — 끝낸 턴으로 MK-I → II(50) → III(300). on · off'],
    ],
  },
  {
    title: '🔧 설정 — /plugin → deck → configure',
    rows: [
      ['style', 'clean | sketch (손그림)'],
      ['drone', 'on | idle (쉴 때만) | off'],
      ['scale · max_rows', '그림 크기 · 그림 최대 줄 수'],
      ['/deck', '이 안내'],
      ['/deck sync', 'push 한 deck 을 ~/.claude · ~/.claude-work 에 깔고, 쉬는 herdr 세션을 리로드'],
    ],
  },
]

// 명령 결과로 대화에 찍을 글 — 왼쪽 열을 화면 칸 폭으로 맞춘다(한글은 두 칸).
export function helpText(): string {
  const w = Math.max(...HELP.flatMap(sec => sec.rows.map(([k]) => cellWidth(k)))) + 2
  return '🛫 Flight Deck\n\n' + HELP.map(sec => [sec.title, ...sec.rows.map(([k, d]) => `  ${k}${' '.repeat(w - cellWidth(k))}${d}`)].join('\n')).join('\n\n')
}
