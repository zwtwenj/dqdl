import pymysql, json
c = pymysql.connect(host='os.environ.get("DB_HOST", "127.0.0.1")', user='root', password='os.environ.get("DB_PASSWORD", "")', database='dqdl', charset='utf8mb4', connect_timeout=10)
cur = c.cursor()

# 抽查几个 mob 的 drops
for mid in ['WB-001', 'WB-010', 'WB-011', 'WB-012', 'WB-050', 'WB-100', 'WB-200', 'WB-300']:
    cur.execute("SELECT mob_id, name, level, power, intelligence, quick, stamina, attribute, drops FROM mob WHERE mob_id=%s", (mid,))
    r = cur.fetchone()
    if r:
        drops = json.loads(r[8]) if r[8] else []
        dnames = [d.get('name', '?')[:30] for d in drops[:3]]
        print(f'{r[0]} {r[1]} level={r[2]} attr=({r[3]},{r[4]},{r[5]},{r[6]}) element={r[7]} drops({len(drops)}): {dnames}')
    else:
        print(f'{mid}: NOT FOUND')

# 统计 drops 为空/非空的 mob
cur.execute("SELECT COUNT(*) FROM mob WHERE drops IS NULL OR drops = '[]'")
empty = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM mob WHERE drops IS NOT NULL AND drops != '[]'")
has = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM mob")
total = cur.fetchone()[0]
print(f'\n有掉落: {has}, 无掉落: {empty}, 总计: {total}')

# 看下 attr 全为 0 的
cur.execute("SELECT COUNT(*) FROM mob WHERE power=0 AND intelligence=0 AND quick=0 AND stamina=0")
print(f'属性全0: {cur.fetchone()[0]}')

c.close()
