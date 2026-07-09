"""补充缺失的木属性魔核到item表"""
import os
import pymysql, json

DB = {
    'host': os.environ.get('DB_HOST', '127.0.0.1'),
    'port': 3306,
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', ''),
    'database': os.environ.get('DB_DATABASE', 'dqdl'),
    'charset': 'utf8mb4',
}

conn = pymysql.connect(**DB)
cur = conn.cursor()

# 查找缺失的mh-m item_id
cur.execute("SELECT DISTINCT item_id FROM item WHERE item_id LIKE 'mh-m%'")
existing = set(r[0] for r in cur.fetchall())
print(f"已有mh-m: {sorted(existing)}")

cur.execute('SELECT mob_id, drops FROM mob')
all_mh_m = set()
for mob_id, drops_json in cur.fetchall():
    for d in json.loads(drops_json):
        if d['item_id'].startswith('mh-m'):
            all_mh_m.add(d['item_id'])

missing = sorted(all_mh_m - existing)
print(f"缺失: {missing}")

tier_map = {'1': '一阶', '2': '二阶', '3': '三阶'}
qual_map = {'1': '劣质', '2': '普通', '3': '优质'}

for mid in missing:
    parts = mid.split('-')  # mh, m1, 1
    tier_num = parts[1][1]   # '1'
    quality = parts[2]       # '1'
    tier = tier_map.get(tier_num, '二阶')
    qual = qual_map.get(quality, '劣质')
    name = f'{qual}{tier}木属性魔核'
    base_price = {'1': 50, '2': 300, '3': 1000}.get(quality, 50)
    tier_mult = {'1': 1, '2': 3, '3': 7}.get(tier_num, 1)
    price = base_price * tier_mult
    desc = f'{qual}{tier}木属性魔核，可用于{qual}级木系药剂和装备的炼制。'
    cur.execute(
        'INSERT INTO item (item_id, name, type, price, description) VALUES (%s, %s, %s, %s, %s)',
        (mid, name, '魔核', price, desc)
    )
    print(f"  + {mid} {name} {price}G")

conn.commit()

# 验证
cur.execute('SELECT COUNT(*) FROM item WHERE type = %s', ('魔核',))
print(f"\n魔核总数: {cur.fetchone()[0]}")
cur.execute('SELECT COUNT(*) FROM item')
print(f"item总数: {cur.fetchone()[0]}")

# 再次检查所有drops引用
cur.execute('SELECT mob_id, drops FROM mob WHERE drops IS NOT NULL')
mismatch = 0
for mob_id, drops_json in cur.fetchall():
    for d in json.loads(drops_json):
        cur2 = conn.cursor()
        cur2.execute("SELECT COUNT(*) FROM item WHERE item_id = %s", (d['item_id'],))
        if cur2.fetchone()[0] == 0:
            print(f"  [MISSING] {mob_id} -> {d['item_id']} ({d['name']})")
            mismatch += 1

print(f"\n掉落物引用缺失: {mismatch}")
conn.close()
