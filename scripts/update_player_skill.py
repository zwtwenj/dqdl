import os
import pymysql
import json

conn = pymysql.connect(
    host=os.environ.get('DB_HOST', '127.0.0.1'),
    port=3306,
    user=os.environ.get('DB_USER', 'root'),
    password=os.environ.get('DB_PASSWORD', ''),
    database=os.environ.get('DB_DATABASE', 'dqdl'),
    charset='utf8mb4'
)
try:
    cur = conn.cursor()
    skill = json.dumps([{'id': 1, 'level': 1, 'carry': 1}], ensure_ascii=False)
    cur.execute('UPDATE player SET skill=%s WHERE id=12', (skill,))
    conn.commit()
    print('updated rows:', cur.rowcount)
finally:
    conn.close()
