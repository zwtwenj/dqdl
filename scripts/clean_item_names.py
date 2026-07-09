import os
import pymysql, re

c = pymysql.connect(host=os.environ.get('DB_HOST', '127.0.0.1'), user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''), database=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4')
cur = c.cursor()

# 1. 处理含中文括号的材料 — 提取描述到 description 字段
cur.execute("SELECT id, item_id, name FROM item WHERE type='material' AND name LIKE '%\uff08%'")
rows = cur.fetchall()
print(f'处理含括号描述的材料: {len(rows)} 条')

cleaned = 0
for id_, item_id, name in rows:
    # 取最后一个 （之前的内容作为纯名称
    # 例如 "冰晶蟹的螯钳（可制冰系钝器或低温切割工具）" → name="冰晶蟹的螯钳", desc="可制冰系钝器或低温切割工具"
    # 又如 "后腿肌肉（富含微量雷电能量，食之可短暂提神）。" → 先处理句号
    # 用正则匹配最后一个 （...） 
    m = re.search(r'（([^）]*)）\s*。?\s*$', name)
    if m:
        pure_name = name[:m.start()].strip()
        desc = m.group(1).strip()
        cur.execute('UPDATE item SET name=%s, description=%s WHERE id=%s', (pure_name, desc, id_))
        cleaned += 1
    else:
        # 括号不在末尾，可能中间有括号 — 检查
        if '（' in name and '）' in name:
            # 尝试提取所有括号内容
            parts = re.split(r'[（）]', name)
            pure_name = parts[0].strip()
            descs = [p.strip() for p in parts[1::2] if p.strip()]
            desc = '；'.join(descs)
            cur.execute('UPDATE item SET name=%s, description=%s WHERE id=%s', (pure_name, desc, id_))
            cleaned += 1

print(f'  → 已清理 {cleaned} 条')

# 2. 处理末尾句号（不含括号的）
cur.execute("SELECT id, item_id, name FROM item WHERE type='material' AND name LIKE '%。' AND name NOT LIKE '%\uff08%'")
rows = cur.fetchall()
print(f'处理末尾句号: {len(rows)} 条')
for id_, item_id, name in rows:
    pure_name = name.rstrip('。').strip()
    cur.execute('UPDATE item SET name=%s WHERE id=%s', (pure_name, id_))
print(f'  → 已清理 {len(rows)} 条')

# 3. 处理同时有括号+句号的
cur.execute("SELECT id, item_id, name FROM item WHERE type='material' AND name LIKE '%\uff08%' AND name LIKE '%。'")
rows = cur.fetchall()
print(f'处理括号+句号组合: {len(rows)} 条')
for id_, item_id, name in rows:
    m = re.search(r'（([^）]*)）\s*。?\s*$', name)
    if m:
        pure_name = name[:m.start()].strip()
        desc = m.group(1).strip()
        cur.execute('UPDATE item SET name=%s, description=%s WHERE id=%s', (pure_name, desc, id_))
print(f'  → 已清理 {len(rows)} 条')

c.commit()

# 最终统计
cur.execute("SELECT COUNT(*) FROM item WHERE type='material' AND name LIKE '%（%'")
print(f'\n残留含括号: {cur.fetchone()[0]}')
cur.execute("SELECT COUNT(*) FROM item WHERE type='material' AND name LIKE '%。'")
print(f'残留含句号: {cur.fetchone()[0]}')
cur.execute("SELECT COUNT(*) FROM item WHERE type='material' AND description IS NOT NULL AND description != ''")
print(f'已有描述的材料: {cur.fetchone()[0]}')

c.close()
print('\nDone!')
