import { expect, test } from 'claude-code/testing'

import { ago, cellWidth, claudeTrailer, fit, ciFromGithub, ciFromGitlab, elapsed, modelName, tokensOf, untilText } from './board'

test('CI 상태', () => {
  expect(ciFromGithub('[{"status":"completed","conclusion":"success","updatedAt":"2026-10-07T08:00:00Z","workflowName":"build","url":"u"}]')?.state).toBe('ok')
  expect(ciFromGithub('[{"status":"in_progress"}]')?.state).toBe('run')
  expect(ciFromGithub('[]')).toBe(null)
  expect(ciFromGitlab('[{"status":"failed","web_url":"w"}]')?.state).toBe('fail')
})

test('시간 표시', () => {
  expect([9, 72, 600].map(elapsed)).toEqual(['9s', '1m12s', '10m00s'])
  expect(ago(0, 30_000)).toBe('방금')
  expect(ago(0, 180_000)).toBe('3분 전')
  expect(ago(0, 7_200_000)).toBe('2시간 전')
})

test('계기판 글자', () => {
  expect([modelName('claude-opus-5-5'), modelName('claude-haiku-4-5-20251001'), modelName('claude-fable-5-1'), modelName('gpt-x')]).toEqual(['Opus 5.5', 'Haiku 4.5', 'Fable 5.1', 'gpt-x'])
  expect([untilText(42 * 60_000, 0), untilText(142 * 60_000, 0), untilText((3 * 1440 + 200) * 60_000, 0)]).toEqual(['42m', '2h 22m', '3d 3h'])
})

test('칸 수와 줄 맞추기', () => {
  expect([cellWidth('develop'), cellWidth('도구 8'), cellWidth('☕ 캐시'), cellWidth('🔥 $2.2/h'), cellWidth('⎇ ▰▱█')]).toEqual([7, 6, 7, 9, 5])
  const items = [{ w: 10, p: 0 }, { w: 5, p: 3, glue: true }, { w: 20, p: 7 }, { w: 8, p: 1 }]
  expect(fit(items, 100)).toEqual([true, true, true, true])
  expect(fit(items, 30)).toEqual([true, true, false, true])
  expect(fit(items, 15)).toEqual([true, false, false, false])
})

test('claudeTrailer: Claude 서명 줄만 잡는다', () => {
  const heredoc = `git commit -m "$(cat <<'EOF'\nfeat: x\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nEOF\n)"`
  expect(claudeTrailer(heredoc)).toBe('Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')
  expect(claudeTrailer('git commit -m "fix" -m "Claude-Session: https://claude.ai/code/x"')).toBe('Claude-Session: https://claude.ai/code/x')
  expect(claudeTrailer('git -C repo commit --trailer "Co-authored-by: claude"')).toBe('Co-authored-by: claude')
  expect(claudeTrailer('git commit -m "feat: 깨끗"')).toBeNull()
  expect(claudeTrailer('git commit -m "x" -m "Co-Authored-By: Kim <k@x.com>"')).toBeNull()
})
