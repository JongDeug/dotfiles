---
name: hwpx
description: "HWPX 문서(.hwpx 파일)를 생성, 읽기, 편집, 템플릿 치환하는 스킬. '한글 문서', 'hwpx', 'HWPX', '한글파일', '.hwpx 파일 만들어줘', 'HWP 문서 생성', '보고서', '공문', '기안문', '한글로 작성' 등의 키워드가 나오면 반드시 이 스킬을 사용할 것. 한글과컴퓨터(한컴)의 HWPX 포맷(KS X 6101/OWPML 기반, ZIP+XML 구조)을 python-hwpx 라이브러리로 다룬다. 보고서 양식이 필요하면 assets/ 폴더의 레퍼런스 템플릿을 활용한다."
---

# HWPX 문서 생성·편집 스킬

## 환경 설정

```bash
SKILL_DIR=~/.claude/skills/hwpx
VENV=~/.claude/skills/ppt-creator/.venv
PYTHON=$VENV/bin/python3

# 기본 양식 경로
TEMPLATE=$SKILL_DIR/assets/report-template.hwpx

# 출력 경로 — 사용자(workspace)마다 다름. AGENTS.md에서 확인할 것.
# jongdeug: ~/.claude/channels/telegram/jongdeug/obsidian/Project/
# 0deug:    ~/.openclaw/workspace-0deug/obsidian/Project/
OUTPUT_DIR=<워크스페이스별 Obsidian 경로>/Project/
```

---

## ⚠️⚠️⚠️ 최우선 규칙: 양식(템플릿) 선택 정책 ⚠️⚠️⚠️

> **HWPX 문서를 만들 때 반드시 아래 순서를 따른다. 예외 없음.**

### 1단계: 사용자 업로드 양식이 있는가?
사용자가 `.hwpx` 양식 파일을 업로드했다면 해당 파일을 템플릿으로 사용.

### 2단계: 기본 제공 양식 사용
- 보고서 → `$SKILL_DIR/assets/report-template.hwpx`

### 3단계: HwpxDocument.new()는 최후의 수단
단순한 메모·목록 수준에만 허용. 보고서, 공문 등은 절대 `new()`로 만들지 않는다.

---

## ⚠️ 양식 활용 시 필수 워크플로우

```
[1] 양식 파일을 /tmp/ 로 복사
     ↓
[2] ObjectFinder로 양식 내 텍스트 전수 조사
     ↓
[3] 플레이스홀더 목록 작성 (어떤 텍스트를 뭘로 바꿀지 매핑)
     ↓
[4] ZIP-level 전체 치환 (표 내부 포함)
     ↓
[5] 네임스페이스 후처리 (fix_namespaces.py)
     ↓
[6] ObjectFinder로 치환 결과 검증
     ↓
[7] <OBSIDIAN_DIR>/Project/ 로 복사 (워크스페이스별 경로 확인)
```

### 핵심: HwpxDocument.open()은 사용하지 않는다
ZIP-level 치환만 사용하는 것이 안전하다.

---

## ⚠️ 이미지 교체 필수 (표지 로고 삭제)

기본 양식(`report-template.hwpx`)의 표지에는 **Brother 기업 로고 이미지(`BinData/image1.png`)가 포함**되어 있다.
보고서 생성 시 반드시 아래 코드로 빈 이미지로 교체해야 한다.

```python
import struct, zlib

def make_blank_png():
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0))
    idat = chunk(b'IDAT', zlib.compress(b'\x00\xff\xff\xff'))
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

def zip_remove_logo(src, dst):
    """BinData/image1.png를 빈 이미지로 교체"""
    blank = make_blank_png()
    tmp = dst + ".tmp"
    with zipfile.ZipFile(src, "r") as zin:
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename == 'BinData/image1.png':
                    zout.writestr(item, blank)
                else:
                    zout.writestr(item, zin.read(item.filename))
    if os.path.exists(dst): os.remove(dst)
    os.rename(tmp, dst)
```

> 워크플로우에서 **fix_namespaces.py 실행 직전**에 `zip_remove_logo(WORK, WORK)` 호출할 것.

---

## ZIP-level 치환 함수 (직접 구현)

```python
import zipfile, os

def zip_replace(src_path, dst_path, replacements):
    """HWPX ZIP 내 모든 XML에서 텍스트 치환 (표 내부 포함)"""
    tmp = dst_path + ".tmp"
    with zipfile.ZipFile(src_path, "r") as zin:
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename.startswith("Contents/") and item.filename.endswith(".xml"):
                    text = data.decode("utf-8")
                    for old, new in replacements.items():
                        text = text.replace(old, new)
                    data = text.encode("utf-8")
                zout.writestr(item, data)
    if os.path.exists(dst_path):
        os.remove(dst_path)
    os.rename(tmp, dst_path)

def zip_replace_sequential(src_path, dst_path, old, new_list):
    """section XML에서 old를 순서대로 new_list 값으로 하나씩 치환"""
    tmp = dst_path + ".tmp"
    with zipfile.ZipFile(src_path, "r") as zin:
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if "section" in item.filename and item.filename.endswith(".xml"):
                    text = data.decode("utf-8")
                    for new_val in new_list:
                        text = text.replace(old, new_val, 1)
                    data = text.encode("utf-8")
                zout.writestr(item, data)
    if os.path.exists(dst_path):
        os.remove(dst_path)
    os.rename(tmp, dst_path)
```

---

## 양식 내 텍스트 전수 조사 방법

```python
import sys
sys.path.insert(0, '/home/jongdeug/.claude/skills/ppt-creator/.venv/lib/python3.12/site-packages')
from hwpx import ObjectFinder

finder = ObjectFinder("양식파일.hwpx")
results = finder.find_all(tag="t")
for r in results:
    if r.text and r.text.strip():
        print(repr(r.text))
```

---

## 기본 양식(report-template.hwpx) 활용 가이드

### 양식 구조

```
1쪽: 표지      → 기관명(30pt) + 보고서 제목(25pt) + 작성일(25pt)
2쪽: 목차      → 로마숫자(Ⅰ~Ⅴ) + 제목 + 페이지, 붙임/참고
3쪽~: 본문     → 결재란 + 제목(22pt) + 섹션 바(Ⅰ~Ⅳ) + □○―※ 계층 본문
```

### 본문 기호 체계

```
1단계:  □    (HY헤드라인M 16pt)
2단계:  ○    (휴먼명조 15pt)
3단계:  ―    (휴먼명조 15pt)
4단계:  ※    (한양중고딕 13pt)
```

### 치환 가능한 플레이스홀더

| 플레이스홀더 | 위치 | 치환 방법 |
|------------|------|----------|
| `브라더 공기관` | 표지 기관명 | 일괄 치환 |
| `기본 보고서 양식` | 표지 제목 | 일괄 치환 |
| `2024. 5. 23.` | 표지 작성일 | 일괄 치환 |
| `제 목` | 본문 페이지 제목 | 일괄 치환 |
| `헤드라인M 폰트 16포인트(문단 위 15)` | □ 본문 (8개) | **순차 치환** |
| `  ○ 휴면명조 15포인트(문단위 10)` | ○ 본문 (8개) | **순차 치환** |
| `   ― 휴면명조 15포인트(문단 위 6)` | ― 본문 (8개) | **순차 치환** |
| `     ※ 중고딕 13포인트(문단 위 3)` | ※ 주석 (7개) | **순차 치환** |

---

## 전체 코드 예시

```python
import shutil, subprocess, sys
sys.path.insert(0, '/home/jongdeug/.claude/skills/ppt-creator/.venv/lib/python3.12/site-packages')

SKILL_DIR = '/home/jongdeug/.claude/skills/hwpx'
OUTPUT = '<OBSIDIAN_DIR>/Project/report.hwpx'  # 워크스페이스별 경로로 대체

# 1. 양식 복사
shutil.copy(f'{SKILL_DIR}/assets/report-template.hwpx', '/tmp/work.hwpx')

# 2. 일괄 치환
zip_replace('/tmp/work.hwpx', '/tmp/work.hwpx', {
    '브라더 공기관': '실제 기관명',
    '기본 보고서 양식': '실제 보고서 제목',
    '2024. 5. 23.': '2026. 4. 3.',
    '제 목': '실제 보고서 제목',
})

# 3. 순차 치환 (□ 항목)
zip_replace_sequential('/tmp/work.hwpx', '/tmp/work.hwpx',
    '헤드라인M 폰트 16포인트(문단 위 15)',
    ['첫번째 내용', '두번째 내용', '', '', '', '', '', '']
)

# 4. 네임스페이스 후처리 (필수!)
subprocess.run(
    ['python3', f'{SKILL_DIR}/scripts/fix_namespaces.py', '/tmp/work.hwpx'],
    check=True
)

# 5. Obsidian으로 복사
shutil.copy('/tmp/work.hwpx', OUTPUT)
print(f'완료: {OUTPUT}')
```

---

## ⚠️ 필수 후처리: 네임스페이스 수정

> **빠뜨리면 한글 Viewer에서 빈 페이지로 표시됨.**

```python
subprocess.run(
    ['python3', '/home/jongdeug/.claude/skills/hwpx/scripts/fix_namespaces.py', 'output.hwpx'],
    check=True
)
```

---

## 문서 유형별 스타일 가이드

- 보고서(내부 보고용) → `references/report-style.md` 먼저 읽을 것
- 공문서(기안문) → `references/official-doc-style.md` 먼저 읽을 것
- 저수준 XML 조작 → `references/xml-internals.md` 읽을 것

---

## 주의사항

1. **양식 우선**: 사용자 업로드 양식 > 기본 제공 양식 > HwpxDocument.new()
2. **ZIP-level 치환 우선**: HwpxDocument.open()보다 안전하고 호환성이 높다
3. **네임스페이스 후처리 필수**: 모든 저장/치환 후 `fix_namespaces.py` 실행
4. **순차 치환 주의**: 동일 플레이스홀더 여러 개면 `zip_replace_sequential` 사용
5. **공문서 날짜 형식**: `2026-04-03`이 아닌 `2026. 4. 3.`
6. **출력 경로**: 워크스페이스 AGENTS.md에서 Obsidian 경로 확인 후 저장 (jongdeug: `~/.claude/channels/telegram/jongdeug/obsidian/Project/`, 0deug: `~/.openclaw/workspace-0deug/obsidian/Project/`)
7. **Python 경로**: 반드시 `sys.path.insert(0, '~/.claude/skills/ppt-creator/.venv/lib/python3.12/site-packages')` 추가
