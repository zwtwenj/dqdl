"""检查掉落物名称中的括号描述问题"""
import os
import pymysql, json

c = pymysql.connect(host=os.environ.get('DB_HOST', '127.0.0.1'), user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''), database=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4', connect_timeout=10)
cur = c.cursor()

# 1. item表中 "沙蝎尾钩"
cur.execute("SELECT item_id, name, description FROM item WHERE name LIKE %s", ('%沙蝎尾钩%',))
print('=== item表中的沙蝎尾钩 ===')
for r in cur.fetchall():
    print(f'  {r[0]} | {r[1]} | desc={r[2]}')

# 2. mob表中 WB-012 的 drops  
cur.execute("SELECT mob_id, name, drops FROM mob WHERE mob_id=%s", ('WB-012',))
r = cur.fetchone()
print(f'\n=== mob表 {r[0]} {r[1]} drops ===')
for d in json.loads(r[2]):
    print(f'  {d["item_id"]} | {d["name"]}')

# 3. 统计mob drops中带括号的名称
cur.execute("SELECT mob_id, name, drops FROM mob WHERE drops IS NOT NULL")
brack_drops = 0
total_drops = 0
samples = []
for mob_id, mob_name, drops_text in cur.fetchall():
    drops = json.loads(drops_text)
    for d in drops:
        total_drops += 1
        if '（' in d.get('name', ''):
            brack_drops += 1
            if len(samples) < 10:
                samples.append(d['name'])

print(f'\n=== mob drops 统计 ===')
print(f'  总掉落条目: {total_drops}')
print(f'  名称含括号: {brack_drops}')
print(f'  示例:')
for s in samples:
    print(f'    {s}')

# 4. 统计 item 表材料中含括号的
cur.execute("SELECT COUNT(*) FROM item WHERE name LIKE '%（%' AND type=%s", ('material',))
mat_brack = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM item WHERE type=%s", ('material',))
mat_total = cur.fetchone()[0]
print(f'\n=== item表统计 ===')
print(f'  材料含括号: {mat_brack}/{mat_total}')

c.close()
