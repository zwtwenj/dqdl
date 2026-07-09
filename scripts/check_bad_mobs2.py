# -*- coding: utf-8 -*-
import os
import pymysql, json, sys
sys.stdout.reconfigure(encoding='utf-8')

conn = pymysql.connect(host=os.environ.get('DB_HOST', '127.0.0.1'), port=3306, user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''), database=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4')
cur = conn.cursor()

# 先查 mob 表有哪些字段
cur.execute("DESCRIBE mob")
cols = [r[0] for r in cur.fetchall()]
print(f"mob表字段: {cols}")

# 查 location id=13 的 common_mobs
cur.execute("SELECT id, name, common_mobs FROM location WHERE id=13")
row = cur.fetchone()
print(f"\nlocation[13]: {row[1]}")
mobs = json.loads(row[2])
print(f"common_mobs: {json.dumps(mobs, ensure_ascii=False, indent=2)}")

conn.close()
