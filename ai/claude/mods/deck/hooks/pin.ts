// /pin 이 고정할 것: 답의 마지막 표, 표가 없으면 답 전체. 제목은 표 바로 위 글 줄(없으면 '고정').
export type Pin = { title: string; text: string }

export function pickPin(reply: string): Pin | null {
  const lines = reply.trimEnd().split('\n')
  let end = -1
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i]!.trimStart().startsWith('|')) { end = i; break }
  if (end < 0) return reply.trim() ? { title: '고정', text: reply.trim() } : null
  let start = end
  while (start > 0 && lines[start - 1]!.trimStart().startsWith('|')) start--
  let above = start - 1
  while (above >= 0 && !lines[above]!.trim()) above--
  const title = above >= 0 ? lines[above]!.replace(/[*#`_>]/g, '').replace(/[:：]\s*$/, '').trim().slice(0, 40) : ''
  return { title: title || '고정', text: lines.slice(start, end + 1).join('\n') }
}
