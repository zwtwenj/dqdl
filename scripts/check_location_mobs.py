import pymysql
import json

conn = pymysql.connect(
    host='os.environ.get("DB_HOST", "127.0.0.1")',
    port=3306,
    user='root',
    password='os.environ.get("DB_PASSWORD", "")',
    db='dqdl',
    charset='utf8mb4'
)
cur = conn.cursor()

cur.execute("SELECT id, name, common_mobs FROM location WHERE id = 73")
row = cur.fetchone()
if row:
    print(f"ID: {row[0]}, Name: {row[1]}")
    print(f"common_mobs raw:\n{row[2]}")
    try:
        mobs = json.loads(row[2])
        print(f"\n解析后共 {len(mobs)} 条：")
        for i, m in enumerate(mobs):
            print(f"  [{i}] {m}")
    except Exception as e:
        print(f"解析失败: {e}")
else:
    print("未找到 id=73 的地点")

conn.close()
