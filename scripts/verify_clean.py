import os
import pymysql
c = pymysql.connect(host=os.environ.get('DB_HOST', '127.0.0.1'), user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''), database=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4')
cur = c.cursor()
cur.execute("SELECT COUNT(*) FROM item WHERE type='material'")
print(f'材料总数: {cur.fetchone()[0]}')
cur.execute("SELECT id, item_id, name, description FROM item WHERE description IS NOT NULL AND description!='' LIMIT 5")
print('有描述的样例:')
for r in cur.fetchall():
    print(f'  id:{r[0]} {r[1]} "{r[2]}" -> desc:"{r[3]}"')
c.close()
