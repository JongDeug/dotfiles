import { expect, test } from 'claude-code/testing'

// 테스트엔 process.spawn 구현이 없다 — /web close 가 브라우저를 띄우려 들면 이 명령 자체가 실패한다.
test('/web close 는 브라우저가 없을 때 새로 띄우지 않고 pane 만 닫는다', async ($, on) => {
  const closed: string[] = []
  on('ui.close', async (_, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  on('command.run', async () => ({ text: 'engine' }))
  const result = await $.command.run({
    command: 'web',
    args: 'close',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
  expect(result.text).toBe('브라우저를 닫았다.')
  expect(closed).toEqual(['web'])
})
