import urllib.request, json

def api(method, path, data=None):
    url = 'http://localhost:3000' + path
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers={'Content-Type':'application/json'}, method=method)
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())

# 1. 根节点
roots = api('GET', '/location/roots')
print('=== 1. 根节点 ===')
for r in roots:
    print(f'  id={r["id"]} {r["name"]} (depth={r["depth"]}, expanded={r["is_expanded"]})')

# 2. 展开西北区域
print('\n=== 2. 展开西北区域 (AI生成帝国) ===')
nw_id = [r['id'] for r in roots if r['name'] == '西北区域'][0]
print(f'  请求 /location/{nw_id}/children ...')
children = api('GET', f'/location/{nw_id}/children')
for c in children:
    desc = c.get('description', '') or ''
    tags = c.get('tags', []) or []
    print(f'  id={c["id"]} {c["name"]} (type={c["loc_type"]}, danger={c["danger_level"]})')
    if desc: print(f'    desc: {desc}')
    if tags: print(f'    tags: {tags}')

# 3. 展开第一个帝国
if children:
    empire = children[0]
    print(f'\n=== 3. 展开帝国 [{empire["name"]}] ===')
    cities = api('GET', f'/location/{empire["id"]}/children')
    for c in cities:
        desc = c.get('description', '') or ''
        print(f'  id={c["id"]} {c["name"]} (type={c["loc_type"]}, danger={c["danger_level"]})')
        if desc: print(f'    desc: {desc}')

    # 4. 展开第一个城市
    city_list = [c for c in cities if c['loc_type'] == 'city']
    if city_list:
        city = city_list[0]
        print(f'\n=== 4. 展开城市 [{city["name"]}] ===')
        districts = api('GET', f'/location/{city["id"]}/children')
        for d in districts:
            desc = d.get('description', '') or ''
            actions = d.get('available_actions', []) or []
            print(f'  id={d["id"]} {d["name"]} (type={d["loc_type"]}, danger={d["danger_level"]})')
            if desc: print(f'    desc: {desc}')
            if actions: print(f'    actions: {actions}')

print('\n✅ 地图懒加载测试完成')
