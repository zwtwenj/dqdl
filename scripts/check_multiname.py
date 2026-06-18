import pymysql
c = pymysql.connect(host='os.environ.get("DB_HOST", "127.0.0.1")', user='root', password='os.environ.get("DB_PASSWORD", "")', database='dqdl', charset='utf8mb4')
cur = c.cursor()

# 找含中文逗号的材料(未正确分词的)
cur.execute("SELECT id, item_id, name FROM item WHERE type='material' AND name LIKE '%\uff0c%'")
rows = cur.fetchall()
print(f'含中文逗号(未正确分词): {len(rows)}')
for r in rows:
    print(f'  id:{r[0]} {r[1]} |{r[2]}|')

# 找含×数量标记的
cur.execute("SELECT id, item_id, name FROM item WHERE type='material' AND name LIKE '%\u00d7%'")
rows2 = cur.fetchall()
print(f'\n含×数量标记: {len(rows2)}')
for r in rows2[:10]:
    print(f'  id:{r[0]} {r[1]} |{r[2]}|')

c.close()
