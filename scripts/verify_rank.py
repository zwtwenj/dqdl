import os
import json, pymysql
c = pymysql.connect(host=os.environ.get('DB_HOST', '127.0.0.1'), user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''), database=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4', connect_timeout=10)
cur = c.cursor()
cur.execute("SELECT name, common_mobs FROM location WHERE common_mobs IS NOT NULL LIMIT 3")
for name, cm in cur.fetchall():
    mobs = json.loads(cm)
    tags = [f"{m['name']}（{m.get('rank','?')}）" for m in mobs]
    print(f'{name}: {" ".join(tags)}')
c.close()
