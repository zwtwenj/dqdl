import os
import pymysql
c = pymysql.connect(host=os.environ.get('DB_HOST', '127.0.0.1'), user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''), database=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4', connect_timeout=10)
cur = c.cursor()
cur.execute("UPDATE location_gen_rule SET danger_range = '1-3' WHERE danger_range != '1-3'")
c.commit()
cur.execute("SELECT id, depth, loc_type, danger_range FROM location_gen_rule")
for r in cur.fetchall():
    print(r)
c.close()
print('Done!')
