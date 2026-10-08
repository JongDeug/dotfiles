// 그린 결과를 ~/.cache/claude-deck/pictures/<해시>.json 에 둔다 — 리로드·재시작해도 같은 그림은 다시 안 그린다.
// 해시엔 렌더러 소스(scriptUrl 파일)도 넣어, 렌더러를 고치면 옛 그림은 저절로 안 쓰인다. 못 그린 것(throw)은 두지 않는다.
// TODO: 지우지 않고 쌓인다(그림 하나 50KB 안팎) — 커지면 오래된 것부터 지우기.
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DIR = path.join(os.homedir(), '.cache', 'claude-deck', 'pictures')

export async function cached(scriptUrl, input, draw) {
  const key = crypto.createHash('sha1').update(fs.readFileSync(new URL(scriptUrl))).update(JSON.stringify(input)).digest('hex')
  const file = path.join(DIR, `${key}.json`)
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    // 없거나 깨졌으면 새로 그린다
  }
  const out = await draw()
  try {
    fs.mkdirSync(DIR, { recursive: true })
    fs.writeFileSync(file, JSON.stringify(out))
  } catch {
    // 못 써도 그림은 돌려준다
  }
  return out
}
