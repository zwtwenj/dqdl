"""迁移脚本：给 location.common_mobs JSON 中每个魔兽补充 rank 字段"""
import os
import json, pymysql

# 加载品阶映射
with open('mob_rank_map.json', 'r', encoding='utf-8') as f:
    rank_map = json.load(f)
print(f'已加载 {len(rank_map)} 条品阶映射')

c = pymysql.connect(host=os.environ.get('DB_HOST', '127.0.0.1'), user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''), database=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4', connect_timeout=10)
cur = c.cursor()

# 查询所有有 common_mobs 的地点
cur.execute("SELECT id, name, common_mobs FROM location WHERE common_mobs IS NOT NULL")
rows = cur.fetchall()
print(f'找到 {len(rows)} 个有常见怪物的地点')

updated = 0
for loc_id, loc_name, cm_text in rows:
    try:
        mobs = json.loads(cm_text)
        if not isinstance(mobs, list):
            continue
        changed = False
        for m in mobs:
            mid = m.get('mob_id', '')
            if mid and 'rank' not in m and mid in rank_map:
                m['rank'] = rank_map[mid]
                changed = True
        if changed:
            new_text = json.dumps(mobs, ensure_ascii=False)
            cur.execute("UPDATE location SET common_mobs = %s WHERE id = %s", (new_text, loc_id))
            updated += 1
    except Exception as e:
        print(f'  地点 {loc_id}({loc_name}) 处理失败: {e}')

c.commit()
print(f'更新了 {updated} 个地点的 common_mobs')
c.close()
print('Done!')
