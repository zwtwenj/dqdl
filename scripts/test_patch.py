import urllib.request, json

data = json.dumps({'position': '斗气大陆 > 中州 > 鼎渊帝国 > 枯骨药谷'}).encode()
req = urllib.request.Request('http://localhost:3000/player/38/position', data=data, method='PATCH', headers={'Content-Type': 'application/json'})
try:
    resp = urllib.request.urlopen(req)
    print(f'状态: {resp.status} {resp.reason}')
    print(f'响应: {resp.read().decode()[:200]}')
except urllib.error.HTTPError as e:
    print(f'状态: {e.code}')
    print(f'响应: {e.read().decode()[:500]}')
