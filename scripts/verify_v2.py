"""验证mob表属性更新"""
import os
import pymysql, json

DB = {'host': os.environ.get('DB_HOST', '127.0.0.1'),'port': 3306,'user': os.environ.get('DB_USER', 'root'),'password': os.environ.get('DB_PASSWORD', ''),'database': os.environ.get('DB_DATABASE', 'dqdl'),'charset': 'utf8mb4'}
conn = pymysql.connect(**DB)
cur = conn.cursor()

# 抽样检查
cur.execute("SELECT mob_id, name, power, intelligence, quick, stamina, level FROM mob ORDER BY mob_id LIMIT 15")
print("=== mob属性验证 ===")
for row in cur.fetchall():
    total = row[2]+row[3]+row[4]+row[5]
    print(f"  {row[0]} {row[1]} | 力{row[2]} 智{row[3]} 敏{row[4]} 耐{row[5]} | level={row[6]} total={total}")

# 各品阶统计
print("\n=== 各品阶属性范围 ===")
for tier_code, tier_name in [(1,'一阶'),(2,'二阶'),(3,'三阶')]:
    level_min = tier_code * 10 + 1 if tier_code > 1 else 1
    level_max = tier_code * 10 + 9 if tier_code > 1 else 9
    cur.execute(
        "SELECT MIN(power+intelligence+quick+stamina), MAX(power+intelligence+quick+stamina), AVG(power+intelligence+quick+stamina) FROM mob WHERE level BETWEEN %s AND %s",
        (level_min, level_max)
    )
    row = cur.fetchone()
    print(f"  {tier_name}: total范围 {row[0]}-{row[1]} avg={int(row[2])}")

conn.close()