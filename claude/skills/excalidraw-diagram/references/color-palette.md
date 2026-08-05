# Color Palette & Brand Style — **draw.io 미감 (DEFAULT)**

**This is the single source of truth for all colors and brand-specific styles.**

이 팔레트는 **draw.io / diagrams.net 기본 팔레트**다. 목표는 손그림(sketchy) Excalidraw 가 아니라 **draw.io 로 그린 것처럼 반듯하고 정형화된 다이어그램**을 내는 것. 색·모서리·폰트를 아래대로 쓰면 Excalidraw JSON 이지만 draw.io 도판처럼 보인다.

---

## Shape Colors (draw.io 표준 fill/stroke 쌍)

색은 의미를 인코딩한다(장식 아님). 각 목적마다 **연한 fill + 진한 stroke** 쌍을 쓴다 — draw.io 의 시그니처 조합.

| Semantic Purpose | Fill | Stroke |
|------------------|------|--------|
| Blue — Primary/Neutral/Component | `#dae8fc` | `#6c8ebf` |
| Green — Start/Success/OK | `#d5e8d4` | `#82b366` |
| Orange — Trigger/Event/Warn | `#ffe6cc` | `#d79b00` |
| Yellow — Decision/Note | `#fff2cc` | `#d6b656` |
| Red — Error/Reset/Danger | `#f8cecc` | `#b85450` |
| Purple — AI/LLM/Special | `#e1d5e7` | `#9673a6` |
| Gray — Neutral/Inactive/Infra | `#f5f5f5` | `#666666` |

**Rule**: 항상 이 fill↔stroke 쌍을 함께 쓴다(연한 배경 + 진한 테두리). 비활성/부차 요소는 `strokeStyle: "dashed"` 로.

---

## Text Colors

draw.io 는 대부분 **진한 회색 하나(`#333333`)** 로 통일한다 — 연한 pastel fill 위에서도 이 색을 유지한다(흰 글씨 X).

| Level | Color | Use For |
|-------|-------|---------|
| 기본 텍스트/라벨 | `#333333` | 노드 라벨, 대부분의 텍스트 |
| 강조 제목 | `#1a1a1a` | 다이어그램 제목·큰 섹션명 |
| 보조/메타 | `#666666` | 주석·부가 설명·수치 라벨 |

pastel fill 안의 텍스트도 `#333333` (draw.io 규약). 다크 fill 을 쓸 경우에만 `#ffffff`.

---

## Fonts (draw.io = 산세리프 기본)

| 용도 | fontFamily | 비고 |
|------|-----------|------|
| 라벨·제목·설명 (기본) | **`2`** (Helvetica 계열 산세리프) | draw.io 기본. 대부분의 텍스트 |
| 코드·ID·SQL·리터럴 값 | `3` (mono) | 실제 코드/식별자일 때만 |

`fontSize`: **13~16 (소형·일관)**. 제목만 `20~24`. 손그림 폰트(`fontFamily: 1`)는 draw.io 미감이 아니므로 **쓰지 않는다**.

---

## Evidence Artifact (코드/데이터 조각)

draw.io 미감에선 코드도 밝게: 회색 박스 + 진한 mono 텍스트.

| Artifact | Background | Text Color | Font |
|----------|-----------|------------|------|
| Code / JSON / SQL 조각 | `#f5f5f5` (또는 `#eeeeee`) | `#333333` | `fontFamily: 3` |

(강한 대비가 꼭 필요한 경우에만 다크 `#1e293b` + 밝은 텍스트.)

---

## Shape & Stroke Defaults (draw.io 룩의 핵심)

| Property | Value | 이유 |
|----------|-------|------|
| `roughness` | **`0`** | 손그림 금지 — 반듯한 선 (draw.io 시그니처) |
| `fillStyle` | **`"solid"`** | 해칭 금지 — 꽉 찬 색 |
| rectangle `roundness` | **`null`** | 샤프한 90° 모서리 (draw.io 기본). 둥근 모서리는 의도적 "soft" 노드에만 |
| `strokeWidth` | `1`(선·부차) ~ `2`(노드·주요 흐름) | 얇고 균일 |
| `opacity` | `100` | 투명도로 위계 만들지 말 것 |

---

## Arrows / Connectors

| Property | Value |
|---------|-------|
| `strokeColor` | 출발 노드의 stroke 색(위 쌍) 또는 `#333333` |
| `roundness` | `null` (샤프) |
| 라우팅 | **직선(2-point) 기본.** 박스를 우회하거나 계층을 표현할 때만 **직교(elbow)** — `points` 에 90° 꺾임점을 넣는다: L자 `[[0,0],[dx,0],[dx,dy]]`, Z자 `[[0,0],[dx/2,0],[dx/2,dy],[dx,dy]]`. 대각 꺾임은 피한다. |
| `endArrowhead` | `"arrow"` |

---

## Background

| Property | Value |
|----------|-------|
| Canvas background (`appState.viewBackgroundColor`) | `#ffffff` |
