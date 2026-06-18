import requests
r = requests.patch('http://localhost:3000/player/38/position', json={'position': '斗气大陆 > 中州 > 鼎渊帝国 > 枯骨药谷'})
print(f'状态: {r.status_code}')
print(f'响应: {r.text[:500]}')
