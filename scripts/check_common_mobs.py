import os
import pymysql
c = pymysql.connect(host=os.environ.get('DB_HOST', '127.0.0.1'), user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''), database=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4')
cur = c.cursor()
cur.execute("SELECT id, name, LEFT(common_mobs,200) FROM location WHERE common_mobs IS NOT NULL LIMIT 5")
for r in cur.fetchall():
    print(r)
c.close()
