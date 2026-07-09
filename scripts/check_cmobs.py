import os
import pymysql, json
conn = pymysql.connect(host=os.environ.get('DB_HOST', '127.0.0.1'), port=3306, user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''), database=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4')
cur = conn.cursor()
cur.execute("SELECT id, name, common_mobs FROM location WHERE common_mobs IS NOT NULL AND common_mobs != ''")
for r in cur.fetchall():
    mobs = json.loads(r[2]) if r[2] else []
    print(f'  [{r[0]}] {r[1]}:')
    for m in mobs:
        print(f'    {m}')
conn.close()