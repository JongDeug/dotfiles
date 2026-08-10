#!/usr/bin/env python3
"""Google Workspace MCP 자격증명 복구.

MCP의 `start_google_auth` 가 내주는 인증 URL은 콜백을 `localhost:8000` 으로 받는데,
이 머신은 도커 컨테이너(KrakenD)가 8000을 선점하고 있어 콜백이 404로 죽는다.
이 스크립트는 콜백 포트를 직접 열고 PKCE 토큰 교환까지 끝내 credential 파일을 갱신한다.
MCP는 매 호출마다 이 파일을 읽으므로 재시작·reconnect 가 필요 없다.

실행 (백그라운드 권장 — 사용자가 브라우저 인증할 때까지 대기한다):
    nohup /home/jongdeug/google_workspace_mcp/.venv/bin/python3 \
        ~/.claude/skills/weekly-report/scripts/reauth_google.py > /tmp/reauth.log 2>&1 &

로그를 폴링해서:
  - "REFRESHED"  → 재인증 불필요, 바로 진행
  - "AUTH_URL: <url>" → 이 URL을 코드블록 원문으로 사용자에게 제시 (복붙용)
  - "SAVED"      → 인증 완료, 시트 작업 진행 가능
"""
import base64
import datetime
import hashlib
import http.server
import json
import os
import socketserver
import sys
import time
import urllib.parse

import requests

CRED = os.path.expanduser('~/.google_workspace_mcp/credentials/jongdeug2021@gmail.com.json')
PORT = 8765
REDIRECT = 'http://localhost:%d/oauth2callback' % PORT
TIMEOUT_SEC = 600


def log(msg):
    print(msg, flush=True)


def save(cred, token_resp):
    cred['token'] = token_resp['access_token']
    if token_resp.get('refresh_token'):
        cred['refresh_token'] = token_resp['refresh_token']
    exp = datetime.datetime.utcnow() + datetime.timedelta(
        seconds=token_resp.get('expires_in', 3600) - 60)
    cred['expiry'] = exp.isoformat()
    with open(CRED, 'w') as f:
        json.dump(cred, f)


def try_refresh(cred):
    """저장된 refresh_token 으로 갱신 시도. 성공하면 True."""
    r = requests.post('https://oauth2.googleapis.com/token', data={
        'client_id': cred['client_id'],
        'client_secret': cred['client_secret'],
        'refresh_token': cred['refresh_token'],
        'grant_type': 'refresh_token',
    })
    if r.status_code == 200:
        save(cred, r.json())
        return True
    # invalid_grant = 만료·폐기됨 → 전체 재인증 필요
    log('refresh failed: %s' % r.text[:200])
    return False


def main():
    if not os.path.exists(CRED):
        log('ERROR: credential 파일 없음: %s' % CRED)
        return 1
    cred = json.load(open(CRED))

    if cred.get('refresh_token') and try_refresh(cred):
        log('REFRESHED')
        return 0

    verifier = base64.urlsafe_b64encode(os.urandom(64)).decode().rstrip('=')
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')

    params = {
        'response_type': 'code',
        'client_id': cred['client_id'],
        'redirect_uri': REDIRECT,
        'scope': ' '.join(cred['scopes']),
        'access_type': 'offline',
        'prompt': 'consent',
        'code_challenge': challenge,
        'code_challenge_method': 'S256',
        'state': 'weeklyreport',
    }
    log('AUTH_URL: https://accounts.google.com/o/oauth2/auth?'
        + urllib.parse.urlencode(params))

    captured = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(self.path).query))
            if 'code' in q or 'error' in q:
                captured.update(q)
                body = ('<h2>인증 완료. 터미널로 돌아가세요.</h2>' if 'code' in q
                        else '<h2>인증 실패: %s</h2>' % q.get('error'))
            else:
                body = '<h2>대기 중</h2>'
            b = body.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def log_message(self, *a):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    deadline = time.monotonic() + TIMEOUT_SEC
    with socketserver.TCPServer(('127.0.0.1', PORT), Handler) as httpd:
        # 짧은 폴링 간격 + 전체 데드라인. favicon 등 부수 요청이 와도 오탐하지 않는다.
        httpd.timeout = 5
        while not captured and time.monotonic() < deadline:
            httpd.handle_request()

    if not captured:
        log('TIMEOUT: 인증 대기 시간 초과')
        return 1

    if 'error' in captured:
        log('ERROR: %s' % captured['error'])
        return 1

    r = requests.post('https://oauth2.googleapis.com/token', data={
        'code': captured['code'],
        'client_id': cred['client_id'],
        'client_secret': cred['client_secret'],
        'redirect_uri': REDIRECT,
        'grant_type': 'authorization_code',
        'code_verifier': verifier,
    })
    if r.status_code != 200:
        log('EXCHANGE_FAIL %s %s' % (r.status_code, r.text[:300]))
        return 1

    save(cred, r.json())
    log('SAVED')
    return 0


if __name__ == '__main__':
    sys.exit(main())
