import os
import pymysql
conn = pymysql.connect(host=os.environ.get('DB_HOST', '127.0.0.1'), port=3306, user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''), database=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4')
cur = conn.cursor()
cur.execute('SET FOREIGN_KEY_CHECKS=0')
cur.execute('TRUNCATE TABLE location')
cur.execute('TRUNCATE TABLE backpack')
cur.execute('TRUNCATE TABLE player')
cur.execute('TRUNCATE TABLE task')
cur.execute('SET FOREIGN_KEY_CHECKS=1')
conn.commit()
print('已清空: location, backpack, player, task')
conn.close()