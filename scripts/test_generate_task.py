import requests, json, time

BASE = 'http://localhost:3000'

# 1. 找empire节点
r = requests.get(f'{BASE}/location/roots')
roots = r.json()

empire_id = None
empire_name = ''
for root in roots:
    r2 = requests.get(f'{BASE}/location/{root["id"]}/children')
    regions = r2.json()
    for region in regions:
        r3 = requests.get(f'{BASE}/location/{region["id"]}/children')
        empires = r3.json()
        for emp in empires:
            if emp['loc_type'] == 'empire':
                empire_id = emp['id']
                empire_name = emp['name']
                break
        if empire_id:
            break
    if empire_id:
        break

print(f'empire: id={empire_id} name={empire_name}')

# 2. 展开empire（触发全量生成子树）
print('触发empire展开（生成所有后代节点）...')
r_expand = requests.get(f'{BASE}/location/{empire_id}/children')
children = r_expand.json()
print(f'empire直接子节点数量: {len(children)}')
for c in children:
    print(f'  子节点: id={c["id"]} name={c["name"]} type={c["loc_type"]} danger={c.get("danger_level",0)}')

# 3. 查找empire下的wild节点
wilds = [c for c in children if c['loc_type'] == 'wild' and c.get('danger_level',0) > 0]
print(f'\nwild节点数量（有危险度）: {len(wilds)}')
for w in wilds:
    mobs_raw = w.get('common_mobs')
    mob_count = len(json.loads(mobs_raw)) if mobs_raw else 0
    print(f'  {w["name"]} danger={w["danger_level"]} mobs={mob_count}只')

# 4. 创建测试玩家
pr = requests.post(f'{BASE}/player', json={'name': '测试侠2'})
player = pr.json()
print(f'\n玩家: id={player["id"]}')

# 5. 测试生成任务
print(f'生成战斗任务...')
r_task = requests.post(f'{BASE}/task/generate', json={
    'player_id': player['id'],
    'location_id': empire_id
})
print(f'状态码: {r_task.status_code}')
print(json.dumps(r_task.json(), ensure_ascii=False, indent=2))
