"""填充 mob.level：从文档品阶映射 一阶→1, 二阶→2, 三阶→3"""
import json, re, pymysql
from docx import Document

doc = Document('../rag/魔兽图鉴.docx')

level_map = {}  # mob_id → level (1/2/3)
tier_map = {'一阶': 1, '二阶': 2, '三阶': 3}
mob_id = None

for p in doc.paragraphs:
    t = p.text.strip()
    if not t:
        continue
    if t.startswith('【ID】WB-'):
        mob_id = re.search(r'WB-\d+', t).group()
    elif t.startswith('【品阶】') and mob_id:
        tier = t.replace('【品阶】', '').strip()
        for k, v in tier_map.items():
            if tier.startswith(k):
                level_map[mob_id] = v
                break

print(f'解析到 {len(level_map)} 条 level 映射')
for k, v in list(level_map.items())[:5]:
    print(f'  {k}: level={v}')

# 更新数据库
c = pymysql.connect(host='os.environ.get("DB_HOST", "127.0.0.1")', user='root', password='os.environ.get("DB_PASSWORD", "")', database='dqdl', charset='utf8mb4', connect_timeout=10)
cur = c.cursor()
updated = 0
for mob_id, lv in level_map.items():
    cur.execute("UPDATE mob SET level = %s WHERE mob_id = %s AND level = 0", (lv, mob_id))
    if cur.rowcount:
        updated += 1
c.commit()

# 检查结果
cur.execute("SELECT level, COUNT(*) FROM mob GROUP BY level ORDER BY level")
print(f'更新了 {updated} 行')
for lv, cnt in cur.fetchall():
    print(f'  level={lv}: {cnt} 只')
c.close()
print('Done!')
