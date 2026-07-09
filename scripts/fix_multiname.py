import os
import pymysql, re

c = pymysql.connect(host=os.environ.get('DB_HOST', '127.0.0.1'), user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''), database=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4')
cur = c.cursor()

# 找含中文逗号或×的材料(未正确分词的)
cur.execute("SELECT id, item_id, name FROM item WHERE type='material' AND (name LIKE '%\uff0c%' OR name LIKE '%\u00d7%')")
rows = cur.fetchall()
print(f'需要修复: {len(rows)} 条')

fixed = 0
for id_, item_id, name in rows:
    # 提取第一个真正的材料名（去掉逗号后面的，去掉×N数量标记）
    # 例如: "冰晶翼×2，冰丝触须×1" → "冰晶翼"
    # 例如: "暗蝠翼×2" → "暗蝠翼"
    first = name.split('\uff0c')[0]  # 取中文逗号前面的
    first = re.sub(r'\u00d7\d+', '', first).strip()  # 去掉×N
    if first and first != name:
        print(f'  {item_id}: |{name}| → |{first}|')
        cur.execute('UPDATE item SET name=%s WHERE id=%s', (first, id_))
        fixed += 1

c.commit()
print(f'\n修复了 {fixed} 条')
print('Done!')
c.close()
