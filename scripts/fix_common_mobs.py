# -*- coding: utf-8 -*-
import pymysql, json, sys
sys.stdout.reconfigure(encoding='utf-8')

conn = pymysql.connect(host='os.environ.get("DB_HOST", "127.0.0.1")', port=3306, user='root', password='os.environ.get("DB_PASSWORD", "")', database='dqdl', charset='utf8mb4', autocommit=True)
cur = conn.cursor()

cur.execute("SELECT id, name, common_mobs FROM location WHERE common_mobs IS NOT NULL")
rows = cur.fetchall()

fixed = 0
for loc_id, name, mobs_str in rows:
    try:
        mobs = json.loads(mobs_str)
    except:
        continue
    # 过滤掉非 WB- 开头的 mob_id
    clean = [m for m in mobs if str(m.get('mob_id', '')).startswith('WB-')]
    if len(clean) != len(mobs):
        removed = [m.get('name') for m in mobs if not str(m.get('mob_id', '')).startswith('WB-')]
        cur.execute("UPDATE location SET common_mobs=%s WHERE id=%s",
                    (json.dumps(clean, ensure_ascii=False) if clean else None, loc_id))
        print(f"  修复 [{loc_id}] {name}: 移除 {removed}")
        fixed += 1

print(f"\n共修复 {fixed} 条记录")
conn.close()
