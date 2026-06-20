import pymysql
import json

conn = pymysql.connect(
    host='os.environ.get("DB_HOST", "127.0.0.1")', port=3306,
    user='root', password='os.environ.get("DB_PASSWORD", "")',
    db='dqdl', charset='utf8mb4'
)
cur = conn.cursor()

# 查找佣兵公会 NPC
cur.execute("""
    SELECT sn.id, sn.name, sn.location_id, l.name as loc_name, nr.name as role_name
    FROM static_npc sn
    JOIN npc_role nr ON sn.role_id = nr.id
    JOIN location l ON sn.location_id = l.id
    WHERE nr.name LIKE '%佣兵%' OR l.name LIKE '%佣兵%'
    LIMIT 20
""")
rows = cur.fetchall()
print(f"佣兵相关NPC ({len(rows)}条):")
for r in rows:
    print(f"  npc_id={r[0]}, name={r[1]}, location_id={r[2]}, loc_name={r[3]}, role={r[4]}")

# 查找 dialog_event id=2
print()
cur.execute("SELECT * FROM dialog_event WHERE id = 2")
row = cur.fetchone()
if row:
    print(f"dialog_event id=2: id={row[0]}, role_id={row[1]}, text={row[2]}, event={row[3]}")

# 查找 dialog_event id=1
cur.execute("SELECT * FROM dialog_event WHERE id = 1")
row = cur.fetchone()
if row:
    print(f"dialog_event id=1: id={row[0]}, role_id={row[1]}, text={row[2]}, event={row[3]}")

conn.close()
