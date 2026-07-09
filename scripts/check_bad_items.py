import os
import pymysql
c = pymysql.connect(host=os.environ.get('DB_HOST', '127.0.0.1'), user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''), database=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4')
cur = c.cursor()

# 统计含中文括号描述的材料
cur.execute("SELECT COUNT(*) FROM item WHERE type='material' AND name LIKE '%\uff08%'")
print(f'含描述的材料总数: {cur.fetchone()[0]}')

# 查看前20条样例
cur.execute("SELECT id, item_id, name FROM item WHERE type='material' AND name LIKE '%\uff08%' LIMIT 20")
for r in cur.fetchall():
    print(f'id:{r[0]:>5}  {r[1]:>8}  {r[2][:100]}')

# 统计还有哪些其他异常
cur.execute("SELECT COUNT(*) FROM item WHERE type='material' AND name LIKE '%,%'")
print(f'\n含逗号的材料: {cur.fetchone()[0]}')

cur.execute("SELECT COUNT(*) FROM item WHERE type='material' AND (name LIKE '%【%' OR name LIKE '%】%')")
print(f'含方括号: {cur.fetchone()[0]}')

cur.execute("SELECT COUNT(*) FROM item WHERE type='material' AND name LIKE '%。%'")
print(f'含句号: {cur.fetchone()[0]}')

c.close()
