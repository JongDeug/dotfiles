// herdr 데스크톱 앱의 Pictures 패널로 그림 하나를 보낸다: ~/.config/herdr-app/pictures/ 에 PNG 와 index.json.
// stdin: { title, png?: base64 | file?: PNG 경로, show?: true }. 같은 그림(내용 해시)은 다시 안 쓰고 자리도 그대로.
// 패널은 show: true(사람이 버튼을 눌렀을 때)일 때만 연다. 그냥 온 그림은 목록에만 넣는다.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'

const KEEP = 60
const app = process.env.HERDR_APP_HOME || `${homedir()}/.config/herdr-app`
const dir = `${app}/pictures`
const indexFile = `${dir}/index.json`
const job = JSON.parse(readFileSync(0, 'utf8'))
const bytes = job.png ? Buffer.from(job.png, 'base64') : readFileSync(job.file)
const key = createHash('sha1').update(bytes).digest('hex').slice(0, 16)

mkdirSync(dir, { recursive: true })
let index = { items: [] }
try { if (existsSync(indexFile)) index = JSON.parse(readFileSync(indexFile, 'utf8')) } catch {}
let item = index.items.find(i => i.key === key)
const created = !item
if (!item) {
  writeFileSync(`${dir}/${key}.png`, bytes)
  const now = new Date(), p = n => String(n).padStart(2, '0')
  item = { key, file: `pictures/${key}.png`, title: String(job.title ?? '').slice(0, 120), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20),
    at: now.toISOString(), label: `${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}` }
  index.items.unshift(item)
  for (const old of index.items.splice(KEEP)) try { unlinkSync(`${app}/${old.file}`) } catch {}
}
const show = job.show === true
if (show || created) index.current = key
writeFileSync(`${indexFile}.tmp`, JSON.stringify(index))
renameSync(`${indexFile}.tmp`, indexFile)
if (show) {
  spawnSync('herdr-app', ['do', 'layout.select', '--stack', 'panel-body', '--child', 'pictures'], { stdio: 'ignore' })
  spawnSync('herdr-app', ['do', 'layout.show', '--id', 'panel'], { stdio: 'ignore' })
}
console.log(JSON.stringify({ key, created, show }))
