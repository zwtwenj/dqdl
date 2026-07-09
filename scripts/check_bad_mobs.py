# -*- coding: utf-8 -*-
import os
import pymysql, json, sys
sys.stdout.reconfigure(encoding='utf-8')

conn = pymysql.connect(host=os.environ.get('DB_HOST', '127.0.0.1'), port=3306, user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''), database=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4')
cur = conn.cursor()

# 查所有 wild 的 common_mobs
cur.execute("SELECT id, name, common_mobs FROM location WHERE loc_type='wild' AND common_mobs IS NOT NULL")
rows = cur.fetchall()

print(f"共 {len(rows)} 个 wild 节点有 common_mobs\n")
for loc_id, name, mobs_str in rows:
    try:
        mobs = json.loads(mobs_str)
    except:
        print(f"  [{loc_id}] {name}: JSON解析失败 -> {mobs_str[:80]}")
        continue
    # 找出看起来不像怪物名的条目（含"魔核"、"材料"、"丹"等关键词）
    bad = [m for m in mobs if any(kw in m.get('name','') for kw in ['魔核', '材料', '丹药', '草药', '矿石', '属性', '劣质', '精品', '丹'])]
    if bad:
        print(f"  ⚠️  [{loc_id}] {name}:")
        for b in bad:
            print(f"       - {b}")
        print(f"     全部mobs: {[m.get('name') for m in mobs]}")

conn.close()
