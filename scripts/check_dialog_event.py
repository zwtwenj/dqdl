import pymysql
conn = pymysql.connect(host='os.environ.get("DB_HOST", "127.0.0.1")', port=3306, user='root', password='os.environ.get("DB_PASSWORD", "")', database='dqdl', charset='utf8mb4')
cur = conn.cursor()
cur.execute("SELECT id, text, event FROM dialog_event ORDER BY id")
for row in cur.fetchall():
    print(row)
conn.close()
