import pymysql

conn = pymysql.connect(
    host='os.environ.get("DB_HOST", "127.0.0.1")',
    port=3306,
    user='root',
    password='os.environ.get("DB_PASSWORD", "")',
    database='dqdl',
    charset='utf8mb4'
)
try:
    cur = conn.cursor()
    cur.execute('SELECT id, name, skill FROM player WHERE id=12')
    row = cur.fetchone()
    print('player id=14:', row)
    cur.execute('SHOW COLUMNS FROM player LIKE %s', ('skill',))
    col = cur.fetchone()
    print('skill column:', col)
finally:
    conn.close()
