import pymysql
conn = pymysql.connect(host='os.environ.get("DB_HOST", "127.0.0.1")', port=3306, user='root', password='os.environ.get("DB_PASSWORD", "")', database='dqdl', charset='utf8mb4')
cur = conn.cursor()
cur.execute("SELECT danger_level, COUNT(*) FROM location WHERE loc_type='wild' GROUP BY danger_level ORDER BY danger_level")
print('wild danger_level分布:')
for r in cur.fetchall():
    print(f'  danger={r[0]}: {r[1]}个')
cur.execute("SELECT id, name, loc_type, danger_level FROM location WHERE loc_type IN ('wild','wild2','wild3') ORDER BY danger_level, id")
print('\n所有野外地点:')
for r in cur.fetchall():
    print(f'  id={r[0]} {r[1]} {r[2]} danger={r[3]}')
conn.close()