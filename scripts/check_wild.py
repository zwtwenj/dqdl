import pymysql, json
conn = pymysql.connect(host='os.environ.get("DB_HOST", "127.0.0.1")', port=3306, user='root', password='os.environ.get("DB_PASSWORD", "")', database='dqdl', charset='utf8mb4')
cur = conn.cursor()
cur.execute('SELECT id, name, loc_type, danger_level, depth, parent_id, common_mobs FROM location WHERE loc_type LIKE "wild%" ORDER BY id')
for r in cur.fetchall():
    cm = json.loads(r[6]) if r[6] else []
    mob_names = [m.get('name','') for m in (cm or [])]
    print(f'  id={r[0]} {r[1]} type={r[2]} danger={r[3]} depth={r[4]} parent={r[5]} mobs={mob_names}')
conn.close()