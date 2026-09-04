# GitHub 저장소 파일 업로드/삭제
# 토큰은 (1) 작업폴더의 cfg.json 또는 (2) 환경변수에서 읽는다 — 이 파일 자체엔 비밀 없음.
import os, base64, json, urllib.request, urllib.error
def _cfg():
    try:
        with open('cfg.json', encoding='utf-8') as f: return json.load(f)
    except Exception:
        return {}
_C = _cfg()
REPO = _C.get('GH_REPO') or os.environ.get('GH_REPO')
TOK  = _C.get('GH_TOKEN') or os.environ.get('GH_TOKEN')
BASE = 'https://api.github.com/repos/' + REPO + '/contents/'
HDR = {'Authorization': 'Bearer ' + TOK, 'Accept': 'application/vnd.github+json',
       'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'kitman-routine'}
def gh_sha(path):
    req = urllib.request.Request(BASE + path + '?ref=main', headers=HDR)
    try:
        return json.load(urllib.request.urlopen(req, timeout=60)).get('sha')
    except urllib.error.HTTPError as e:
        if e.code == 404: return None
        raise
def gh_get_json(path):
    req = urllib.request.Request(BASE + path + '?ref=main', headers=HDR)
    try:
        j = json.load(urllib.request.urlopen(req, timeout=60))
        return json.loads(base64.b64decode(j['content']).decode('utf-8')), j.get('sha')
    except urllib.error.HTTPError as e:
        if e.code == 404: return None, None
        raise
def gh_put(path, raw, message):
    body = {'message': message, 'branch': 'main', 'content': base64.b64encode(raw).decode()}
    sha = gh_sha(path)
    if sha: body['sha'] = sha
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), method='PUT', headers=HDR)
    urllib.request.urlopen(req, timeout=120); return True
def gh_delete(path, message):
    sha = gh_sha(path)
    if not sha: return False
    body = {'message': message, 'branch': 'main', 'sha': sha}
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), method='DELETE', headers=HDR)
    urllib.request.urlopen(req, timeout=60); return True
