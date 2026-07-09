import os
import pymysql

conn = pymysql.connect(
    host=os.environ.get('DB_HOST', '127.0.0.1'), port=3306,
    user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''),
    db=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4'
)
cur = conn.cursor()

# 检查字段是否存在
cur.execute("DESCRIBE task")
cols = [row[0] for row in cur.fetchall()]
print("当前字段:", cols)

if 'delivery' not in cols:
    cur.execute("ALTER TABLE task ADD COLUMN delivery TEXT NULL AFTER `type`")
    conn.commit()
    print("delivery 字段已添加")
else:
    print("delivery 字段已存在，跳过")

conn.close()
