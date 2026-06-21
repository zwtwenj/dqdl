import requests
import json

url = 'http://localhost:5000/generate/training'
payload = {
    'player': {
        'name': '旅行者',
        'technique_name': '弄焰诀',
        'equipped_skills': [
            {'id': 1, 'name': '八极崩', 'level': 1, 'description': '玄阶高级斗技，近身爆发力极强', 'attr': 'power', 'base_damage': 10, 'rank': 31}
        ]
    },
    'mob': {'mob_id': 'WB-001', 'name': '毒花蛇', 'description': '通体斑斓的毒蛇，毒牙可麻痹猎物'},
    'battle': {'win_rate': 0, 'rounds': 1, 'style': '毫无胜算', 'player_total': 20, 'mob_total': 100},
    'location': {'name': '万蛇窟', 'description': '毒蛇盘踞的地窟'},
    'won': False,
    'drops': []
}

resp = requests.post(url, json=payload, timeout=60)
data = resp.json()
text = data.get('text', '')
with open('training_test_output.txt', 'w', encoding='utf-8') as f:
    f.write('status: ' + str(resp.status_code) + '\n')
    f.write('text: ' + text + '\n')
print('saved to training_test_output.txt')
