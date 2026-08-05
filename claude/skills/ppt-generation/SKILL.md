---
name: ppt-generation
description: Use this skill when the user requests to generate, create, or make presentations (PPT/PPTX). Default workflow uses HTML+CSS slides rendered locally via Playwright (offline, pixel-perfect, Korean-friendly). AI image-generation path is provided as an alternative.
---

# PPT Generation Skill

종환님 머신 전용 — HTML/CSS로 1920×1080 슬라이드를 직접 코딩하고 Playwright로 PNG를 찍은 뒤 python-pptx로 PPTX를 컴파일한다. 인터넷 없이 동작하고 한글/레이아웃을 정밀 제어할 수 있어 **기본 워크플로우로 채택**.

AI 이미지 생성 경로(`/mnt/skills/public/image-generation`)는 종환님 머신엔 없으므로 사용 금지. 그 워크플로우는 문서 맨 아래 "Alternative" 섹션에 보관만 한다.

---

## Primary Workflow — HTML + Playwright (Local)

### 0. 작업 디렉터리 셋업

```bash
mkdir -p /tmp/<project>/screenshots
cd /tmp/<project>
```

스킬에 박혀 있는 템플릿/스크립트 한 번에 복사:

```bash
cp /home/jongdeug/.claude/skills/ppt-generation/templates/slide-base.html /tmp/<project>/slide01.html
cp /home/jongdeug/.claude/skills/ppt-generation/scripts/render.js        /tmp/<project>/render.js
cp /home/jongdeug/.claude/skills/ppt-generation/scripts/compile.py       /tmp/<project>/compile.py
```

### 1. 슬라이드 기획

각 슬라이드의 역할/메시지를 한 줄씩 적은 outline 작성 후 사용자 확인. 5~10장이 표준.

### 2. HTML 작성 (`slide01.html` … `slideNN.html`)

- 파일명은 `slide01.html`, `slide02.html` … 두 자리 패딩 필수 (정렬 안전)
- 1920×1080 고정. 콘텐츠가 1080을 넘어가면 잘림 → **무조건 viewport 안에 들어와야 함**
- `templates/slide-base.html`을 시작점으로 쓰고 그 위에 콘텐츠만 얹기
- 디자인 일관성: 모든 슬라이드가 같은 top-bar / 폰트 / 배경 / 카드 스타일을 공유해야 함

### 3. Playwright 렌더링

```bash
NODE_PATH=/home/jongdeug/.claude/channels/telegram/jongdeug/scripts/node_modules \
  node /tmp/<project>/render.js
```

- playwright 모듈은 종환님 머신에서 위 경로에만 설치돼 있다 → **반드시 NODE_PATH 지정**
- `render.js`는 `slide*.html`을 자동 검색해서 동일한 이름의 PNG를 `screenshots/`에 떨군다

### 4. ⭐ Visual QA — 반드시 PNG를 직접 본다

렌더링 직후 **모든 슬라이드 PNG를 Read 툴로 열어 육안 검수**. 이 단계 빼먹으면 사고남.

```
Read /tmp/<project>/screenshots/slide01.png
Read /tmp/<project>/screenshots/slide02.png
...
```

체크리스트:
- [ ] 콘텐츠가 1080px 안에 다 들어와 있나? (잘린 부분 없나)
- [ ] 한글이 □□□ 로 깨지지 않았나? (Noto Sans KR 폴백 잘 잡혔나)
- [ ] 이모지/아이콘이 빈 네모로 안 나오나? (Font Awesome 제대로 로드됐나)
- [ ] 디자인 톤이 모든 슬라이드에서 일관적인가? (top-bar/배경/폰트)
- [ ] 텍스트가 카드 박스를 넘쳐 흐르지 않나?

이상하면 그 슬라이드만 HTML 수정 후 → "단일 슬라이드 재생성" 절차로 갱신.

### 5. PPTX 컴파일

```bash
python3 /tmp/<project>/compile.py
```

- `compile.py`는 `screenshots/slide*.png`를 sorted 순서로 묶어 `<project>.pptx`를 만든다
- 출력 파일명은 컴파일 스크립트 상단에서 `OUTPUT_PATH` 변수로 조정

### 6. 텔레그램 전송

```python
mcp__plugin_telegram_telegram__reply(
  chat_id="<id>",
  text="...요약 텍스트...",
  files=["/tmp/<project>/<project>.pptx"]
)
```

DM(`5270356206`)인지 그룹 토픽인지 확인 후 `chat_id`/`message_thread_id`를 정확히 넘긴다.

---

## ⚠️ 렌더링 규칙 (절대 어기지 말 것)

### R1. 이모지 절대 금지 → Font Awesome 사용

Raspberry Pi에는 컬러 이모지 폰트가 없어서 이모지가 빈 네모(□)로 렌더링됨. **SVG `<text>` 안에 이모지 넣는 건 특히 금지** (지난번 슬라이드 흐름도가 깨진 진짜 원인).

```html
<!-- ❌ 금지 -->
<div>📡 신호</div>
<svg><text>🤖 Agent</text></svg>

<!-- ✅ 올바른 방법 -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<div><i class="fa-solid fa-satellite-dish"></i> 신호</div>
```

### R2. 코드블록 안에 한글 주석 금지

JetBrains Mono는 한글을 지원하지 않음 → `font-family: 'JetBrains Mono', monospace` 요소 안에 한글 넣으면 □□□□ 렌더링.

```html
<!-- ❌ -->
<div style="font-family: 'JetBrains Mono', monospace">// 텔레그램 메시지 파싱</div>

<!-- ✅ 영문 주석 -->
<div style="font-family: 'JetBrains Mono', monospace">// parse telegram message</div>

<!-- ✅ 또는 폰트 폴백 추가 -->
font-family: 'JetBrains Mono', 'Noto Sans KR', monospace;
```

### R3. 한글 폰트 반드시 지정

```html
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800;900&family=Noto+Sans+KR:wght@300;400;700;900&family=JetBrains+Mono:wght@400;600&display=swap');
body { font-family: 'Inter', 'Noto Sans KR', sans-serif; }
</style>
```

Noto Sans KR은 항상 Inter 폴백으로 같이 임포트.

### R4. 슬라이드 크기 고정

```css
body { width: 1920px; height: 1080px; overflow: hidden; }
```

`overflow: hidden` 대신 `auto`/`visible` 쓰면 안 됨. 잘리면 잘린 걸 보고 인지해야 한다.

### R5. 1080px 오버플로우 가드

콘텐츠가 1080을 넘기면 PNG 하단부터 잘려 나간다. 다음 패턴으로 방어:
- 큰 섹션을 `display:flex; height:780px` 같이 명시적 높이로 박는다
- 카드 안 텍스트는 `font-size`를 14~16px로 잡고 `line-height: 1.6~1.8`
- 슬라이드당 카드 6개 이상 들어가면 grid로 강제 정렬
- 의심스러우면 첫 슬라이드 1장 먼저 렌더링해서 Read로 확인 → OK 나오면 나머지 진행

---

## 🎨 카드 기반 파이프라인 패턴 (강제)

흐름도/단계 표현 시 SVG 다이어그램 대신 **flexbox 카드 + chevron 화살표** 패턴을 사용한다. 시도했던 SVG 흐름도는 이모지 깨짐 + 정렬 어긋남으로 5번 갈아엎었음. 다음 패턴이 검증된 정답:

```html
<div style="display:flex;align-items:stretch;gap:0;">
  <!-- Stage 1 -->
  <div style="flex:1;background:rgba(6,182,212,0.06);border:1.5px solid rgba(6,182,212,0.2);border-radius:20px;padding:28px;display:flex;flex-direction:column;align-items:center;text-align:center;">
    <div style="width:72px;height:72px;border-radius:20px;background:rgba(6,182,212,0.15);display:flex;align-items:center;justify-content:center;margin-bottom:16px;">
      <i class="fa-solid fa-mobile-screen-button" style="font-size:32px;color:#06b6d4;"></i>
    </div>
    <div style="font-size:13px;font-weight:700;color:#06b6d4;letter-spacing:2px;margin-bottom:6px;">STEP 1</div>
    <div style="font-size:20px;font-weight:800;margin-bottom:6px;">메시지 수신</div>
    <div style="font-size:14px;color:#8b949e;line-height:1.6;">사용자가 텔레그램으로<br>메시지 또는 명령어 전송</div>
  </div>

  <!-- Chevron between stages -->
  <div style="width:40px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
    <i class="fa-solid fa-chevron-right" style="font-size:24px;color:#4b5563;"></i>
  </div>

  <!-- Stage 2 ... 동일 패턴 -->
</div>
```

핵심 규칙:
- 카드는 `flex:1` 균등 분할
- chevron은 `width:40px; flex-shrink:0`
- 카드별로 색상만 바꿔서 단계 구분 (`#06b6d4 → #8b5cf6 → #6366f1 → #f59e0b → #3fb950`)
- 단계 5개가 표준. 6개 이상이면 줄 바꿈 (2단 grid)

---

## 🧰 디자인 시스템 (글래스모피즘 다크 테마)

```css
/* 배경 */
background: linear-gradient(135deg, #0a0e1a 0%, #0d1530 50%, #080c1e 100%);

/* 상단 바 */
.top-bar { position:absolute; top:0; left:0; right:0; height:4px;
  background: linear-gradient(90deg, #6366f1, #06b6d4); }

/* 카드 */
background: rgba(255,255,255,0.03~0.06);
border: 1px solid rgba(255,255,255,0.07~0.1);
border-radius: 18~28px;

/* 색상 팔레트 */
--cyan:        #06b6d4;   --light-cyan:   #67e8f9;
--indigo:      #6366f1;   --light-indigo: #a5b4fc;
--purple:      #8b5cf6;   --light-purple: #c4b5fd;
--amber:       #f59e0b;
--green:       #3fb950;
--red:         #f85149;
--text-main:   #e6edf3;
--text-muted:  #8b949e;
--text-faint:  #4b5563;

/* 폰트 사이즈 스케일 */
H1(title):       44~54px / weight 800
H1 sub:          20~22px / color #8b949e
section heading: 18~24px / weight 700
body:            14~16px / line-height 1.6~1.8
mono caption:    12~13px / JetBrains Mono
```

---

## 🔁 단일 슬라이드 재생성 워크플로우

8장 중 한 장만 마음에 안 들 때:

1. 해당 HTML만 수정 (`slide05.html`)
2. 그 한 장만 렌더링:
   ```bash
   NODE_PATH=/home/jongdeug/.claude/channels/telegram/jongdeug/scripts/node_modules \
     node /tmp/<project>/render.js --only 5
   ```
3. Read로 PNG 확인
4. PPTX 재컴파일:
   ```bash
   python3 /tmp/<project>/compile.py
   ```
5. 텔레그램으로 새 PPTX 전송 (수정된 부분 명시)

`render.js`는 `--only N` 플래그를 지원해서 특정 번호만 다시 그린다.

---

## 🏷 종환님 PC 특화 메타데이터

| 항목 | 값 |
|---|---|
| Playwright 모듈 위치 | `/home/jongdeug/.claude/channels/telegram/jongdeug/scripts/node_modules` |
| 호출 시 환경변수 | `NODE_PATH=...scripts/node_modules` (필수) |
| Chromium 옵션 | `--no-sandbox --disable-setuid-sandbox` (Raspberry Pi 필수) |
| 출력 디렉터리 | `/tmp/<project>/screenshots/` |
| PPTX 슬라이드 크기 | 20" × 11.25" (= 1920×1080 @ 96dpi) |
| 텔레그램 DM (jongdeug) | `chat_id: 5270356206` |
| 텔레그램 DM (0deug)    | `chat_id: 8662519641` |
| 개발 그룹              | `chat_id: -1003593346551` |
| 작가 그룹              | `chat_id: -1003766203279` |
| Python PPTX 라이브러리 | `python3 -c "import pptx"` 로 확인 후 사용 |

---

## 📋 풀 워크플로우 체크리스트

```
[ ] 1. 작업 디렉터리 mkdir + 템플릿 복사
[ ] 2. 슬라이드 outline 사용자에게 보여주고 OK 받기
[ ] 3. slide01.html 작성 (디자인 토큰 확정)
[ ] 4. slide01만 먼저 렌더링 → Read로 확인 → 톤 OK 확인
[ ] 5. slide02 ~ slideNN 작성
[ ] 6. 전체 렌더링
[ ] 7. ⭐ 모든 PNG를 Read로 확인 (Visual QA)
[ ] 8. 이상한 슬라이드 있으면 재작업
[ ] 9. compile.py 실행 → PPTX 생성
[ ] 10. mcp__plugin_telegram_telegram__reply 로 PPTX 전송
[ ] 11. 사용자에게 슬라이드 구조 한 줄씩 요약 전달
```

---

## Alternative: Cloud-only AI Image Generation

`/mnt/skills/public/image-generation`을 쓸 수 있는 환경(Anthropic 클라우드 등)에서만 의미 있는 경로. **종환님 로컬 머신에서는 사용 금지** — 해당 경로 자체가 없음.

이 경로를 써야 한다면 아래 스타일 가이드만 참고하면 된다:

| Style | Description | Best For |
|-------|-------------|----------|
| `glassmorphism` | Frosted glass + vibrant gradient | Tech, AI/SaaS, futuristic pitches |
| `dark-premium` | Black + luminous accent | Premium, executive, luxury brand |
| `gradient-modern` | Bold mesh gradient | Startups, creative agencies |
| `neo-brutalist` | High contrast, raw, anti-design | Edgy brands, Gen-Z |
| `3d-isometric` | Clean iso illustrations | Tech explainers, SaaS |
| `editorial` | Magazine layouts | Annual reports, thought leadership |
| `minimal-swiss` | Grid + Helvetica | Architecture, premium consulting |
| `keynote` | Apple WWDC aesthetic | Product reveals, inspirational talks |

워크플로우(과거 버전 보존):

1. presentation-plan.json 작성 (`style`, `style_guidelines`, `slides[]`)
2. `/mnt/skills/public/image-generation/scripts/generate.py`로 슬라이드 1장 생성
3. 슬라이드 2부터는 직전 슬라이드를 `--reference-images`로 넘겨 일관성 유지
4. `/mnt/skills/public/ppt-generation/scripts/generate.py`로 PPTX 컴파일

종환님 머신에서는 **절대 시도하지 말 것**. 위 경로 없음.

---

## Notes

### 핵심 품질 가이드

- **여백을 두려워하지 말 것** — 40~60% 여백이 프리미엄 느낌의 핵심
- **슬라이드당 한 메시지** — 카드를 6개 이상 욱여넣지 말고 다음 슬라이드로 분리
- **타이포그래피 위계** — 헤드라인 44~54px, 본문 14~16px, 차이가 클수록 깔끔
- **컬러 절제** — 메인 팔레트 1개 + 액센트 1~2개 (cyan/indigo/purple 묶음 권장)
- **모든 슬라이드의 top-bar 동일** — 일관성의 가장 강력한 신호

### 자주 하는 실수

- ❌ SVG `<text>` 안에 이모지 넣기 → 깨짐
- ❌ 코드블록에 한글 주석 → 사각형 깨짐
- ❌ 슬라이드 콘텐츠 1080px 초과 → 하단 잘림
- ❌ 매번 render.js/compile.py 새로 짜기 → 이 스킬의 scripts/ 사용
- ❌ 렌더링 후 PNG 안 보고 PPTX 전송 → 사고남
- ❌ playwright NODE_PATH 누락 → `Cannot find module 'playwright'`
- ❌ slide.html 파일명 한 자리 (slide1.html) → sorted 순서 깨짐
