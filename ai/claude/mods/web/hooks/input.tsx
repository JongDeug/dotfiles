import type { ClientModule, JsonValue } from 'claude-code'

// 페이지 그림 위에 겹친 빈 영역. 클릭과(클릭하면 포커스가 와서) 키 입력만 받아 훅 모듈로 넘긴다.
// 좌표는 영역에 대한 0~1 비율 — 페이지 크기는 보조 프로세스만 안다.
const PageInput: ClientModule<JsonValue, boolean> = (_, s) => {
  if (s.state === undefined) {
    s.onPointer(e => {
      if (e.type !== 'up' || s.columns === 0 || s.rows === 0) return
      s.post({ type: 'click', x: (e.fine?.x ?? e.x + 0.5) / s.columns, y: (e.fine?.y ?? e.y + 0.5) / s.rows })
    })
    s.onKey(k => s.post({ type: 'key', key: k.key, ctrl: k.ctrl ?? false, meta: k.meta ?? false, shift: k.shift ?? false }))
    s.setState(true)
  }
  const { Box } = s.elements
  return <Box width={s.columns} height={s.rows} />
}

export default PageInput
