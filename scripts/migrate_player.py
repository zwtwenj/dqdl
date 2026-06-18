import pymysql
c = pymysql.connect(host='os.environ.get("DB_HOST", "127.0.0.1")', user='root', password='os.environ.get("DB_PASSWORD", "")', database='dqdl', charset='utf8mb4')
cur = c.cursor()

# 检查字段是否已存在
cur.execute("DESCRIBE player")
cols = [r[0] for r in cur.fetchall()]
print(f'player表现有字段: {cols}')

if 'position' not in cols:
    cur.execute("ALTER TABLE player ADD COLUMN position VARCHAR(512) DEFAULT '' COMMENT '玩家当前位置路径'")
    print('✓ position字段已添加')
else:
    print('- position字段已存在')

if 'status' not in cols:
    cur.execute("ALTER TABLE player ADD COLUMN status TINYINT DEFAULT 1 COMMENT '用户状态: 1=正常'")
    print('✓ status字段已添加')
else:
    print('- status字段已存在')

c.commit()

# 现有玩家设默认值
cur.execute("UPDATE player SET position='', status=1 WHERE position='' OR position IS NULL OR status IS NULL")
print(f'  更新默认值: {cur.rowcount} 行')

c.close()
print('Done!')
