#!/usr/bin/env python3
"""주간보고 시트 서식 정규화.

양식은 기능 개선 Row 5~11(7행) / 요청 Row 12~18(7행) 까지만 서식이 준비돼 있다.
요청이 8건 이상이면 Row 19+ 는 테두리·9pt 폰트·드롭다운이 없는 맨 셀이라 화면이 깨진다.
게다가 이전 주 탭을 복사해 오므로, 그 주에 안 쓰인 행은 서식이 빈 채로 따라온다.

이 스크립트는 값을 건드리지 않고(PASTE_FORMAT 은 값 미변경) 서식만 정규화한다.

usage:
    normalize_sheet_format.py <SHEET_NAME> <FEAT_COUNT> <REQ_COUNT> [--dry-run]
예:
    normalize_sheet_format.py '07.20~07.24' 4 10
"""
import json
import os
import sys

import requests

CRED = os.path.expanduser('~/.google_workspace_mcp/credentials/jongdeug2021@gmail.com.json')
SS = '1fDy_Npm4F_rXKTAQug-b8M5Nd4XuelBziJJSjtXgVqA'
API = 'https://sheets.googleapis.com/v4/spreadsheets/%s' % SS

FEAT_START, FEAT_END = 5, 11      # 기능 개선 영역 (양식 고정)
REQ_START = 12                    # 요청 영역 시작
TEMPLATE_REQ_END = 18             # 양식이 기본 제공하는 요청 영역 마지막 행
COL_B, COL_G = 1, 6               # 0-based. A열은 병합 때문에 서식 복사 대상에서 제외

NONE = {'style': 'NONE'}
CLOSING = {'style': 'SOLID_MEDIUM', 'color': {'red': 0, 'green': 0, 'blue': 0}}


def grid(sid, r1, r2, c1=COL_B, c2=COL_G):
    """1-based inclusive rows, 0-based inclusive cols -> GridRange"""
    return {'sheetId': sid, 'startRowIndex': r1 - 1, 'endRowIndex': r2,
            'startColumnIndex': c1, 'endColumnIndex': c2 + 1}


def copy_paste(src, dst, kinds=('PASTE_FORMAT', 'PASTE_DATA_VALIDATION')):
    # 드롭다운은 PASTE_FORMAT 에 딸려오지 않으므로 DATA_VALIDATION 을 따로 붙인다.
    return [{'copyPaste': {'source': src, 'destination': dst,
                           'pasteType': k, 'pasteOrientation': 'NORMAL'}} for k in kinds]


def main():
    args = [a for a in sys.argv[1:] if a != '--dry-run']
    dry = '--dry-run' in sys.argv
    if len(args) < 3:
        print(__doc__)
        return 2
    sheet_name, feat, req = args[0], int(args[1]), int(args[2])

    cred = json.load(open(CRED))
    h = {'Authorization': 'Bearer ' + cred['token'], 'Content-Type': 'application/json'}

    meta = requests.get(API, headers=h,
                        params={'fields': 'sheets(properties(sheetId,title),merges)'})
    if meta.status_code != 200:
        print('ERROR: 메타 조회 실패 %s %s' % (meta.status_code, meta.text[:200]))
        print('→ 토큰 만료일 수 있음. reauth_google.py 먼저 실행할 것.')
        return 1

    sheet = next((s for s in meta.json()['sheets']
                  if s['properties']['title'] == sheet_name), None)
    if sheet is None:
        print('ERROR: 시트 없음: %s' % sheet_name)
        return 1
    sid = sheet['properties']['sheetId']

    if feat > (FEAT_END - FEAT_START + 1):
        print('WARN: 기능 개선 %d건 > 영역 %d행. 초과분은 요청 영역을 침범하므로 수동 확인 필요.'
              % (feat, FEAT_END - FEAT_START + 1))

    req_end = max(TEMPLATE_REQ_END, REQ_START + req - 1)
    reqs = []

    # --- 기능 개선 영역 ---------------------------------------------------
    # 드롭다운 복원. 소스는 Row5 지만 DATA_VALIDATION 만 가져오므로 경계선은 안 번진다.
    reqs += copy_paste(grid(sid, FEAT_START, FEAT_START),
                       grid(sid, FEAT_START + 1, FEAT_END),
                       kinds=('PASTE_DATA_VALIDATION',))
    # 섹션 첫 행의 상단 경계선이 아래 행으로 번진 것을 제거 (bottom 미지정 -> 마감선 보존)
    reqs.append({'updateBorders': {'range': grid(sid, FEAT_START + 1, FEAT_END),
                                   'top': NONE, 'innerHorizontal': NONE}})

    # --- 요청 영역 --------------------------------------------------------
    if req_end > TEMPLATE_REQ_END:
        # A열 병합을 새 마지막 행까지 확장
        for m in sheet.get('merges', []):
            if (m.get('startColumnIndex') == 0
                    and m.get('startRowIndex') == REQ_START - 1):
                reqs.append({'unmergeCells': {'range': m}})
                break
        # 신규 행에 일반 행 서식 부여. 소스는 REQ_START 가 아니라 그 다음 행!
        # (REQ_START 는 섹션 첫 행이라 상단 경계선을 갖고 있어 복사하면 선이 번진다)
        reqs += copy_paste(grid(sid, REQ_START + 1, REQ_START + 1),
                           grid(sid, TEMPLATE_REQ_END + 1, req_end))
        reqs.append({'mergeCells': {
            'range': {'sheetId': sid, 'startRowIndex': REQ_START - 1,
                      'endRowIndex': req_end, 'startColumnIndex': 0, 'endColumnIndex': 1},
            'mergeType': 'MERGE_ALL'}})
        # 기존 마감선 제거 후 새 마지막 행으로 이동
        reqs.append({'updateBorders': {
            'range': grid(sid, TEMPLATE_REQ_END, TEMPLATE_REQ_END), 'bottom': NONE}})
        reqs.append({'updateBorders': {
            'range': grid(sid, req_end, req_end), 'bottom': CLOSING}})

    # 행간 경계선 정리 (섹션 첫 행 Row12 의 상단선은 유지)
    reqs.append({'updateBorders': {'range': grid(sid, REQ_START + 1, req_end),
                                   'top': NONE, 'innerHorizontal': NONE}})

    print('sheet=%s sheetId=%s feat=%d req=%d -> 요청 마지막 행 Row %d, 요청 %d건'
          % (sheet_name, sid, feat, req, req_end, len(reqs)))
    if dry:
        print(json.dumps(reqs, ensure_ascii=False, indent=2)[:2000])
        return 0

    r = requests.post(API + ':batchUpdate', headers=h,
                      data=json.dumps({'requests': reqs}))
    if r.status_code != 200:
        print('ERROR: batchUpdate 실패 %s %s' % (r.status_code, r.text[:400]))
        return 1
    print('OK: 서식 정규화 완료')
    return 0


if __name__ == '__main__':
    sys.exit(main())
