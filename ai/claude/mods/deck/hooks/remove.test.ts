import { expect, test } from 'claude-code/testing'

import { askText, decorate, disposable, porcelain, readRemoves, tokenize, whyOf } from './remove'

test('따옴표 속 rm · ; 는 명령이 아니다', () => {
  expect(tokenize(`echo "rm -rf /; x" && rm 'a b'`).map(t => t.text)).toEqual(['echo', 'rm -rf /; x', '\0', 'rm', 'a b'])
  expect(readRemoves('git commit -m "fix: rm 버그"', '/w', '/h')).toEqual([])
  expect(readRemoves('grep -rn rm src', '/w', '/h')).toEqual([])
})

test('rm 대상은 cd 를 따라 절대 경로로, 글롭·변수·xargs 는 확정 못 함', () => {
  const [a] = readRemoves('cd app && sudo rm -rf -- build/ ./old.log ~/x "$TMP"/y *.bak', '/w', '/h')
  expect(a!.kind).toBe('rm')
  expect(a!.targets).toEqual(['/w/app/build', '/w/app/old.log', '/h/x'])
  expect(a!.unresolved).toEqual(['$TMP/y', '*.bak'])
  expect(readRemoves('find . -name x | xargs rm', '/w', '/h')[0]!.unresolved).toEqual(['(xargs 입력)'])
  expect(readRemoves('FOO=1 /bin/rm ../a', '/w/b', '/h')[0]!.targets).toEqual(['/w/a'])
})

test('git clean 은 -f 일 때만, 미리 보기는 -n 으로', () => {
  expect(readRemoves('git clean -n', '/w', '/h')).toEqual([])
  expect(readRemoves('git clean -dn', '/w', '/h')).toEqual([])
  const [c] = readRemoves('git -C repo clean -fdx', '/w', '/h')
  expect([c!.kind, c!.dir, c!.cleanArgs]).toEqual(['clean', '/w/repo', ['-n', '-dx']])
})

test('묻지 않는 곳은 임시 폴더와 산출물 폴더', () => {
  expect(disposable('/tmp/x', ['/tmp'])).toBe(true)
  expect(disposable('/w/app/node_modules/.vite', [])).toBe(true)
  expect(disposable('/w/app/src', ['/tmp'])).toBe(false)
  expect(disposable('/tmpfile', ['/tmp'])).toBe(false)
})

test('git 칸 나누기: 밖·추적 안 함·무시·고친 채는 되살릴 수 없다', () => {
  const codes = porcelain('?? notes/draft.md\0!! .env.local\0 M src/app.ts\0R  new.ts\0old.ts\0')
  expect([...codes.entries()]).toEqual([['notes/draft.md', '??'], ['.env.local', '!!'], ['src/app.ts', ' M'], ['new.ts', 'R ']])
  expect([whyOf(undefined, false), whyOf('??', true), whyOf('!!', true), whyOf(' M', true), whyOf(undefined, true)]).toEqual(['outside', 'untracked', 'ignored', 'modified', 'clean'])
})

test('질문창 요약과 미리 보기', () => {
  const { summary, preview } = askText({
    command: 'rm -rf build notes', dir: '/h/chaos', home: '/h', more: false, unresolved: [], kb: 3482,
    entries: [{ path: '/h/chaos/notes/draft.md', why: 'untracked' }, { path: '/h/chaos/build/a.js', why: 'clean' }, { path: '/h/chaos/gone', why: 'missing' }],
  })
  expect(summary).toBe('파일 2개 · 3.4MB — 되살릴 수 없는 것 1개')
  expect(preview).toBe(['$ rm -rf build notes', '위치 ~/chaos', '', '✗ 되살릴 수 없음  1', '  notes/draft.md  (추적 안 함)', '✓ git 으로 되살림  1', '  build/a.js', '· 없는 경로  1', '  gone'].join('\n'))
})

test('deck 이 띄운 그 질문에만 설명·미리 보기를 단다', () => {
  const a = { summary: 'S', preview: 'P' }
  const qs = [{ question: 'Q?', header: '삭제 검수', multiSelect: false, options: [{ label: '삭제 진행' }, { label: '취소' }] }]
  expect(decorate(qs, 'Q?', a)).toEqual([{ ...qs[0], options: [{ label: '삭제 진행', description: 'S', preview: 'P' }, { label: '취소', description: '명령을 막고 Claude 에게 취소됐다고 알린다', preview: 'P' }] }])
  expect(decorate(qs, 'other?', a)).toBe(null)
  expect(decorate([...qs, ...qs], 'Q?', a)).toBe(null)
})
