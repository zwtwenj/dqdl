"""验证数据库数据完整性"""
import pymysql, json

DB = {
    'host': 'os.environ.get("DB_HOST", "127.0.0.1")',
    'port': 3306,
    'user': 'root',
    'password': 'os.environ.get("DB_PASSWORD", "")',
    'database': 'dqdl',
    'charset': 'utf8mb4',
}

conn = pymysql.connect(**DB)
cur = conn.cursor()

# mob表
cur.execute("SELECT COUNT(*) FROM mob")
print(f"mob总数: {cur.fetchone()[0]}")

cur.execute("SELECT mob_id, name, attribute, power, intelligence, quick, stamina FROM mob WHERE mob_id IN ('WB-001','WB-002','WB-103','WB-205') ORDER BY mob_id")
print("\n=== mob样例 ===")
for row in cur.fetchall():
    print(f"  {row[0]} {row[1]} | {row[2]} | 力{row[3]} 智{row[4]} 敏{row[5]} 耐{row[6]}")

# drops验证
cur.execute("SELECT mob_id, name, drops FROM mob WHERE mob_id = 'WB-001'")
row = cur.fetchone()
print(f"\nWB-001 drops: {row[2]}")

cur.execute("SELECT mob_id, name, drops FROM mob WHERE mob_id = 'WB-103'")
row = cur.fetchone()
print(f"WB-103 drops: {row[2]}")

# item表
cur.execute("SELECT COUNT(*) FROM item")
print(f"\nitem总数: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM item WHERE type='材料'")
print(f"  材料: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM item WHERE type='魔核'")
print(f"  魔核: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM item WHERE type='材料' AND description IS NOT NULL AND description != ''")
print(f"  材料有描述: {cur.fetchone()[0]}")

# item样例
cur.execute("SELECT item_id, name, type, price, description FROM item WHERE item_id IN ('cl-100','cl-101','mh-h1-1','mh-h2-1') ORDER BY item_id")
print("\n=== item样例 ===")
for row in cur.fetchall():
    print(f"  {row[0]} | {row[1]} | {row[2]} | {row[3]}G | {row[4]}")

# drops中item_id都能在item表找到吗
cur.execute("SELECT mob_id, drops FROM mob WHERE drops IS NOT NULL AND drops != '[]'")
mismatch = 0
total_drops = 0
for mob_id, drops_json in cur.fetchall():
    try:
        drops = json.loads(drops_json)
        for d in drops:
            total_drops += 1
            cur2 = conn.cursor()
            cur2.execute("SELECT COUNT(*) FROM item WHERE item_id = %s", (d['item_id'],))
            if cur2.fetchone()[0] == 0:
                print(f"  [MISSING] {mob_id} -> {d['item_id']} ({d['name']})")
                mismatch += 1
    except:
        pass

print(f"\n=== 掉落物引用检查 ===")
print(f"总掉落物引用: {total_drops}")
print(f"item表缺失: {mismatch}")

conn.close()
