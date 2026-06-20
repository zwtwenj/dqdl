import pymysql

conn = pymysql.connect(
    host='os.environ.get("DB_HOST", "127.0.0.1")', port=3306,
    user='root', password='os.environ.get("DB_PASSWORD", "")',
    database='dqdl', charset='utf8mb4',
    autocommit=True
)
cur = conn.cursor()

# 检查 type 字段是否已存在
cur.execute("SHOW COLUMNS FROM task LIKE 'type'")
if cur.fetchone():
    print('type 字段已存在，跳过 ALTER')
else:
    cur.execute("ALTER TABLE task ADD COLUMN `type` VARCHAR(32) NOT NULL DEFAULT 'common' AFTER status")
    print('✅ 已添加 type 字段')

conn.close()
print('完成')
