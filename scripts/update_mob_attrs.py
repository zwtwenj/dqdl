"""更新mob表：按公式重算属性 + 设置level为战力编码"""
from docx import Document
from docx.shared import Pt
import json, re, pymysql, random, shutil

DB = {
    'host': os.environ.get('DB_HOST', '127.0.0.1'),
    'port': 3306,
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', ''),
    'database': os.environ.get('DB_DATABASE', 'dqdl'),
    'charset': 'utf8mb4',
}

# 核心公式常量
TIER_ATTRS = {
    '一阶': {'power': 16, 'intelligence': 10, 'quick': 20, 'stamina': 14},
    '二阶': {'power': 40, 'intelligence': 28, 'quick': 44, 'stamina': 36},
    '三阶': {'power': 80, 'intelligence': 60, 'quick': 76, 'stamina': 70},
}

POWER_MOD = {
    1: 0.4, 2: 0.5, 3: 0.6, 4: 0.7, 5: 0.8,
    6: 0.85, 7: 0.9, 8: 1.0, 9: 1.1,
    11: 0.3, 12: 0.5, 13: 0.7, 14: 0.85, 15: 1.0,
    16: 1.1, 17: 1.2, 18: 1.3, 19: 1.4,
    21: 0.3, 22: 0.5, 23: 0.7, 24: 0.85, 25: 1.0,
    26: 1.2, 27: 1.4, 28: 1.6, 29: 1.8,
}

ELEM_CODE = {
    '火': 'h', '水': 's', '风': 'f', '雷': 'l',
    '冰': 'b', '土': 't', '木': 'm', '光': 'g',
    '暗': 'a', '毒': 'd', '斗': 'bg',
}

ELEM_BIAS = {
    '火':   (1.3, 0.8, 1.1, 0.8),
    '水':   (0.8, 1.2, 1.0, 1.0),
    '风':   (0.7, 0.9, 0.7, 1.7),
    '雷':   (0.9, 1.1, 0.8, 1.2),
    '冰':   (0.8, 1.3, 1.0, 0.9),
    '土':   (1.1, 0.7, 1.5, 0.7),
    '木':   (0.8, 1.2, 1.2, 0.8),
    '光':   (0.9, 1.3, 0.9, 0.9),
    '暗':   (1.0, 1.4, 0.8, 0.8),
    '毒':   (0.9, 1.3, 0.9, 0.9),
    '斗':   (1.5, 0.7, 1.0, 0.8),
}

cn_nums = '一二三四五六七八九'

def parse_power_ref(power_ref, tier):
    if not power_ref or power_ref == 'NONE':
        return {'一阶': 3, '二阶': 13, '三阶': 23}.get(tier, 3)
    pr = power_ref.strip()
    m = re.match(r'^(\d+)$', pr)
    if m:
        return int(m.group(1))
    m = re.search(r'斗之气([一二三四五六七八九])段', pr)
    if m:
        return cn_nums.index(m.group(1)) + 1
    m = re.search(r'斗者([一二三四五六七八九])星', pr)
    if m:
        return 10 + cn_nums.index(m.group(1)) + 1
    m = re.search(r'斗师([一二三四五六七八九])星', pr)
    if m:
        return 20 + cn_nums.index(m.group(1)) + 1
    m = re.search(r'([一二三四五六七八九])星至([一二三四五六七八九])星', pr)
    if m:
        v1 = cn_nums.index(m.group(1)) + 1
        v2 = cn_nums.index(m.group(2)) + 1
        base = 20 if '斗师' in pr else 10
        return base + (v1 + v2) // 2
    m = re.search(r'([一二三四五六七八九])段到([一二三四五六七八九])段', pr)
    if m:
        v1 = cn_nums.index(m.group(1)) + 1
        v2 = cn_nums.index(m.group(2)) + 1
        return (v1 + v2) // 2
    if '斗者初期' in pr: return 11
    if '斗者中期' in pr: return 14
    if '斗者后期' in pr: return 17
    if '斗者巅峰' in pr: return 19
    if '半星斗师' in pr: return 21
    m = re.search(r'斗之气([一二三四五六七八九])段', pr)
    if m:
        return cn_nums.index(m.group(1)) + 1
    m = re.search(r'([一二三四五六七八九])星斗者', pr)
    if m:
        return 10 + cn_nums.index(m.group(1)) + 1
    m = re.search(r'([一二三四五六七八九])星斗师', pr)
    if m:
        return 20 + cn_nums.index(m.group(1)) + 1
    m = re.search(r'([五六七八九一二三四])到([一二三四五六七八九])星斗者', pr)
    if m:
        v1 = cn_nums.index(m.group(1)) + 1
        v2 = cn_nums.index(m.group(2)) + 1
        return 10 + (v1 + v2) // 2
    return {'一阶': 3, '二阶': 13, '三阶': 23}.get(tier, 3)

def calc_attrs(power_code, element, tier):
    base = TIER_ATTRS.get(tier, TIER_ATTRS['一阶'])
    mod = POWER_MOD.get(power_code, 0.7)
    primary_elem = element.split('/')[0] if '/' in element else element
    bias = ELEM_BIAS.get(primary_elem, (1, 1, 1, 1))
    return {
        'power': max(1, round(base['power'] * mod * bias[0])),
        'intelligence': max(1, round(base['intelligence'] * mod * bias[1])),
        'stamina': max(1, round(base['stamina'] * mod * bias[2])),
        'quick': max(1, round(base['quick'] * mod * bias[3])),
    }

# ============================================================
#  从docx读取数据（用v2版本，如果有的话）
# ============================================================
# 优先用v2，否则用原版
import os
docx_path = '../rag/魔兽图鉴_v2.docx' if os.path.exists('../rag/魔兽图鉴_v2.docx') else '../rag/魔兽图鉴.docx'
print(f"读取: {docx_path}")

doc = Document(docx_path)
entries = []
current = {}
for p in doc.paragraphs:
    t = p.text.strip()
    if not t or t == '---':
        continue
    if t.startswith('【ID】WB-'):
        if current and 'mob_id' in current:
            entries.append(current)
        current = {'mob_id': re.search(r'WB-\d+', t).group()}
    elif t.startswith('【名称】'): current['name'] = t.replace('【名称】', '').strip()
    elif t.startswith('【分类】'): current['element'] = t.replace('【分类】', '').strip()
    elif t.startswith('【品阶】'): current['tier'] = t.replace('【品阶】', '').strip()
    elif t.startswith('【战力参考】'): current['power_ref'] = t.replace('【战力参考】', '').strip()
    elif t.startswith('·') or t.startswith('  ·'):
        line = t.lstrip('·').strip()
        if '|' in line:
            item_id, name = line.split('|', 1)
            if 'structured_drops' not in current:
                current['structured_drops'] = []
            current['structured_drops'].append({
                'item_id': item_id.strip(), 'name': name.strip(),
                'type': 'core' if item_id.strip().startswith('mh-') else 'material'
            })
if current and 'mob_id' in current:
    entries.append(current)

print(f"解析: {len(entries)} 条")

# ============================================================
#  计算并更新数据库
# ============================================================
print("\n=== 更新数据库 ===")
conn = pymysql.connect(**DB)
cur = conn.cursor()

updated = 0
for e in entries:
    tier = e.get('tier', '一阶')
    element = e.get('element', '')
    power_ref_raw = e.get('power_ref', '')

    # 解析战力编码
    power_code = parse_power_ref(power_ref_raw, tier)

    # 确保编码在品阶范围内
    if tier == '一阶':
        power_code = max(1, min(9, power_code))
    elif tier == '二阶':
        if power_code < 11:
            power_code = power_code + 10
        power_code = max(11, min(19, power_code))
    else:
        if power_code < 21:
            power_code = power_code + 20
        power_code = max(21, min(29, power_code))

    # 公式计算属性
    attrs = calc_attrs(power_code, element, tier)

    # 更新mob表
    cur.execute(
        "UPDATE mob SET power=%s, intelligence=%s, quick=%s, stamina=%s, level=%s WHERE mob_id=%s",
        (attrs['power'], attrs['intelligence'], attrs['quick'], attrs['stamina'], power_code, e['mob_id'])
    )
    updated += 1

conn.commit()
print(f"更新 {updated} 条 mob")

# 验证
cur.execute("SELECT mob_id, name, power, intelligence, quick, stamina, level FROM mob ORDER BY mob_id LIMIT 10")
print("\n验证(前10):")
for row in cur.fetchall():
    total = row[2]+row[3]+row[4]+row[5]
    print(f"  {row[0]} {row[1]} | 力{row[2]} 智{row[3]} 敏{row[4]} 耐{row[5]} | level={row[6]} total={total}")

# 各品阶范围
print("\n各品阶统计:")
for lo, hi, name in [(1,9,'一阶'),(11,19,'二阶'),(21,29,'三阶')]:
    cur.execute(
        "SELECT MIN(power+intelligence+quick+stamina), MAX(power+intelligence+quick+stamina), AVG(power+intelligence+quick+stamina), COUNT(*) FROM mob WHERE level BETWEEN %s AND %s",
        (lo, hi)
    )
    r = cur.fetchone()
    if r[3] > 0:
        print(f"  {name}: total={r[0]}-{r[1]} avg={int(float(r[2]))} ({r[3]}条)")

conn.close()
print("\n完成!")