"""
重写魔兽图鉴 V2：
1. 战力参考改为数字编码（1-9=斗之气段, 11-19=斗者星, 21-29=斗师星）
2. 属性参考严格按公式计算：TIER_ATTRS[tier] * POWER_MOD[战力编码] * 元素倾向
3. 重写docx + 更新mob表
"""
from docx import Document
from docx.shared import Pt
import json, re, pymysql, random

DB = {
    'host': 'os.environ.get("DB_HOST", "127.0.0.1")',
    'port': 3306,
    'user': 'root',
    'password': 'os.environ.get("DB_PASSWORD", "")',
    'database': 'dqdl',
    'charset': 'utf8mb4',
}

# ============================================================
#  核心公式常量（与代码 import_wb_full.py 对齐，扩展至全等级）
# ============================================================

# 品阶→基础属性模板
TIER_ATTRS = {
    '一阶': {'power': 16, 'intelligence': 10, 'quick': 20, 'stamina': 14},   # total=60
    '二阶': {'power': 40, 'intelligence': 28, 'quick': 44, 'stamina': 36},   # total=148
    '三阶': {'power': 80, 'intelligence': 60, 'quick': 76, 'stamina': 70},   # total=286
}

# 战力编码→修正系数
# 编码规则: 1-9=斗之气1-9段, 11-19=斗者1-9星, 21-29=斗师1-9星
# 公式来源: import_wb_full.py 的 TIER_ATTRS * POWER_MOD
# 原POWER_MOD(斗师): 一星=0.3, 二星=0.5, 三星=0.7, 四星=0.85, 五星=1.0, 六星=1.2, 七星=1.4
# 扩展至全等级：每个品阶内 modifier 从 0.4 到 1.4
POWER_MOD = {
    # 斗之气 1-9段: 0.4 ~ 1.1 (步长约0.09)
    1: 0.4, 2: 0.5, 3: 0.6, 4: 0.7, 5: 0.8,
    6: 0.85, 7: 0.9, 8: 1.0, 9: 1.1,
    # 斗者 11-19星: 0.3 ~ 1.4 (原POWER_MOD模式扩展)
    11: 0.3, 12: 0.5, 13: 0.7, 14: 0.85, 15: 1.0,
    16: 1.1, 17: 1.2, 18: 1.3, 19: 1.4,
    # 斗师 21-29星: 原POWER_MOD + 扩展
    21: 0.3, 22: 0.5, 23: 0.7, 24: 0.85, 25: 1.0,
    26: 1.2, 27: 1.4, 28: 1.6, 29: 1.8,
}

# 战力编码→可读名称
POWER_NAMES = {}
cn_nums = '一二三四五六七八九'
for i in range(1, 10):
    POWER_NAMES[i] = f'斗之气{cn_nums[i-1]}段'
for i in range(1, 10):
    POWER_NAMES[10 + i] = f'斗者{cn_nums[i-1]}星'
for i in range(1, 10):
    POWER_NAMES[20 + i] = f'斗师{cn_nums[i-1]}星'

# 元素缩写映射
ELEM_CODE = {
    '火': 'h', '水': 's', '风': 'f', '雷': 'l',
    '冰': 'b', '土': 't', '木': 'm', '光': 'g',
    '暗': 'a', '毒': 'd', '斗': 'bg',
}

# 品阶→阶数编号
TIER_NUM = {'一阶': 1, '二阶': 2, '三阶': 3, '四阶': 4, '五阶': 5}

# 元素→属性倾向权重 (power, intelligence, stamina, quick)
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


# ============================================================
#  解析战力参考文本 → 战力编码
# ============================================================

def parse_power_ref(power_ref: str, tier: str) -> int:
    """将战力参考文本解析为数字编码"""
    if not power_ref or power_ref == 'NONE':
        defaults = {'一阶': 3, '二阶': 13, '三阶': 23}
        return defaults.get(tier, 3)

    pr = power_ref.strip()

    # 纯数字（如 "3" = 斗之气三段）
    m = re.match(r'^(\d+)$', pr)
    if m:
        return int(m.group(1))

    # 斗之气X段
    m = re.search(r'斗之气([一二三四五六七八九])段', pr)
    if m:
        return '一二三四五六七八九'.index(m.group(1)) + 1

    # 斗者X星
    m = re.search(r'斗者([一二三四五六七八九])星', pr)
    if m:
        return 10 + '一二三四五六七八九'.index(m.group(1)) + 1

    # 斗师X星
    m = re.search(r'斗师([一二三四五六七八九])星', pr)
    if m:
        return 20 + '一二三四五六七八九'.index(m.group(1)) + 1

    # 范围 "X星至Y星"
    m = re.search(r'([一二三四五六七八九])星至([一二三四五六七八九])星', pr)
    if m:
        v1 = '一二三四五六七八九'.index(m.group(1)) + 1
        v2 = '一二三四五六七八九'.index(m.group(2)) + 1
        if '斗师' in pr:
            return 20 + (v1 + v2) // 2
        return 10 + (v1 + v2) // 2

    # "X段到Y段"
    m = re.search(r'([一二三四五六七八九])段到([一二三四五六七八九])段', pr)
    if m:
        v1 = '一二三四五六七八九'.index(m.group(1)) + 1
        v2 = '一二三四五六七八九'.index(m.group(2)) + 1
        return (v1 + v2) // 2

    # 斗者初期/中期/后期/巅峰
    if '斗者初期' in pr: return 11
    if '斗者中期' in pr: return 14
    if '斗者后期' in pr: return 17
    if '斗者巅峰' in pr: return 19

    # 半星斗师
    if '半星斗师' in pr: return 21

    # 斗之气X段（带括号描述）
    m = re.search(r'斗之气([一二三四五六七八九])段', pr)
    if m:
        return '一二三四五六七八九'.index(m.group(1)) + 1

    # 相当于人类X星斗者
    m = re.search(r'([一二三四五六七八九])星斗者', pr)
    if m:
        return 10 + '一二三四五六七八九'.index(m.group(1)) + 1

    # 相当于人类X星斗师
    m = re.search(r'([一二三四五六七八九])星斗师', pr)
    if m:
        return 20 + '一二三四五六七八九'.index(m.group(1)) + 1

    # X到Y星斗者
    m = re.search(r'([五六七八九一二三四])到([一二三四五六七八九])星斗者', pr)
    if m:
        v1 = '一二三四五六七八九'.index(m.group(1)) + 1
        v2 = '一二三四五六七八九'.index(m.group(2)) + 1
        return 10 + (v1 + v2) // 2

    # 兜底：按品阶给默认
    defaults = {'一阶': 3, '二阶': 13, '三阶': 23}
    fallback = defaults.get(tier, 3)
    print(f"  [WARN] 无法解析: '{pr}' -> {fallback}")
    return fallback


# ============================================================
#  属性计算公式
# ============================================================

def calc_attrs(power_code: int, element: str, tier: str) -> dict:
    """
    公式: attr = round(TIER_ATTRS[tier][attr] * POWER_MOD[power_code] * elem_bias)
    """
    base = TIER_ATTRS.get(tier, TIER_ATTRS['一阶'])
    mod = POWER_MOD.get(power_code, 0.7)

    # 取主元素（处理"冰/毒"双属性）
    primary_elem = element.split('/')[0] if '/' in element else element
    bias = ELEM_BIAS.get(primary_elem, (1, 1, 1, 1))

    attrs = {
        'power': max(1, round(base['power'] * mod * bias[0])),
        'intelligence': max(1, round(base['intelligence'] * mod * bias[1])),
        'stamina': max(1, round(base['stamina'] * mod * bias[2])),
        'quick': max(1, round(base['quick'] * mod * bias[3])),
    }
    return attrs


# ============================================================
#  解析原始docx
# ============================================================
print("=== 解析魔兽图鉴 ===")
doc = Document('../rag/魔兽图鉴.docx')

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
    elif t.startswith('【名称】'):
        current['name'] = t.replace('【名称】', '').strip()
    elif t.startswith('【分类】'):
        current['element'] = t.replace('【分类】', '').strip()
    elif t.startswith('【品阶】'):
        current['tier'] = t.replace('【品阶】', '').strip()
    elif t.startswith('【危险度】'):
        current['danger'] = t.replace('【危险度】', '').strip()
    elif t.startswith('【栖息地】'):
        current['habitat'] = t.replace('【栖息地】', '').strip()
    elif t.startswith('【外观】'):
        current['appearance'] = t.replace('【外观】', '').strip()
    elif t.startswith('【体型】'):
        current['size'] = t.replace('【体型】', '').strip()
    elif t.startswith('【核心能力】'):
        current['abilities'] = t.replace('【核心能力】', '').strip()
    elif t.startswith('【弱点】'):
        current['weakness'] = t.replace('【弱点】', '').strip()
    elif t.startswith('【性情】'):
        current['temper'] = t.replace('【性情】', '').strip()
    elif t.startswith('【稀有度】'):
        current['rarity'] = t.replace('【稀有度】', '').strip()
    elif t.startswith('【战力参考】'):
        current['power_ref'] = t.replace('【战力参考】', '').strip()
    elif t.startswith('【属性参考】'):
        current['attrs'] = t.replace('【属性参考】', '').strip()
    elif t.startswith('【掉落物】'):
        current['drops_header'] = True
    elif t.startswith('·') or t.startswith('  ·'):
        # 结构化掉落行: "· item_id | name"
        line = t.lstrip('·').strip()
        if '|' in line:
            item_id, name = line.split('|', 1)
            if 'structured_drops' not in current:
                current['structured_drops'] = []
            current['structured_drops'].append({
                'item_id': item_id.strip(),
                'name': name.strip(),
                'type': 'core' if item_id.strip().startswith('mh-') else 'material'
            })
if current and 'mob_id' in current:
    entries.append(current)

print(f"解析完成: {len(entries)} 条")

# ============================================================
#  战力编码 + 属性重算
# ============================================================
print("\n=== 重算战力编码和属性 ===")

for e in entries:
    tier = e.get('tier', '一阶')
    element = e.get('element', '')
    power_ref_raw = e.get('power_ref', '')

    # 1. 解析战力编码
    power_code = parse_power_ref(power_ref_raw, tier)

    # 确保编码在合法范围内
    if power_code <= 9:
        pass  # 斗之气
    elif 11 <= power_code <= 19:
        pass  # 斗者
    elif 21 <= power_code <= 29:
        pass  # 斗师
    else:
        # 修正异常值
        if tier == '一阶':
            power_code = max(1, min(9, power_code))
        elif tier == '二阶':
            power_code = max(11, min(19, power_code if power_code >= 10 else power_code + 10))
        else:
            power_code = max(21, min(29, power_code if power_code >= 20 else power_code + 20))

    e['power_code'] = power_code
    e['power_name'] = POWER_NAMES.get(power_code, str(power_code))

    # 2. 按公式计算属性
    attrs = calc_attrs(power_code, element, tier)
    e['calc_attrs'] = attrs
    e['attrs'] = f"力{attrs['power']} 智{attrs['intelligence']} 耐{attrs['stamina']} 敏{attrs['quick']}"

# 验证
print("\n属性验证(前10条):")
for e in entries[:10]:
    total = e['calc_attrs']['power'] + e['calc_attrs']['intelligence'] + e['calc_attrs']['stamina'] + e['calc_attrs']['quick']
    print(f"  {e['mob_id']} {e.get('name','')} | 编码={e['power_code']}({e['power_name']}) | {e['attrs']} | total={total}")

print("\n各品阶属性总量范围:")
for tier in ['一阶', '二阶', '三阶']:
    tier_entries = [e for e in entries if e.get('tier') == tier]
    totals = [e['calc_attrs']['power'] + e['calc_attrs']['intelligence'] + e['calc_attrs']['stamina'] + e['calc_attrs']['quick'] for e in tier_entries]
    print(f"  {tier}: {min(totals)}-{max(totals)} (avg={sum(totals)//len(totals)})")

# ============================================================
#  重写魔兽图鉴 docx
# ============================================================
print("\n=== 重写魔兽图鉴 ===")
out_doc = Document()
style = out_doc.styles['Normal']
style.font.size = Pt(11)
style.font.name = '宋体'

for e in entries:
    out_doc.add_paragraph(f"【ID】{e['mob_id']}")
    if e.get('name'): out_doc.add_paragraph(f"【名称】{e['name']}")
    if e.get('element'): out_doc.add_paragraph(f"【分类】{e['element']}")
    if e.get('tier'): out_doc.add_paragraph(f"【品阶】{e['tier']}")
    if e.get('danger'): out_doc.add_paragraph(f"【危险度】{e['danger']}")
    if e.get('habitat'): out_doc.add_paragraph(f"【栖息地】{e['habitat']}")
    if e.get('appearance'): out_doc.add_paragraph(f"【外观】{e['appearance']}")
    if e.get('size'): out_doc.add_paragraph(f"【体型】{e['size']}")
    if e.get('abilities'): out_doc.add_paragraph(f"【核心能力】{e['abilities']}")
    if e.get('weakness'): out_doc.add_paragraph(f"【弱点】{e['weakness']}")
    if e.get('temper'): out_doc.add_paragraph(f"【性情】{e['temper']}")
    if e.get('rarity'): out_doc.add_paragraph(f"【稀有度】{e['rarity']}")
    # 战力参考 → 数字编码
    out_doc.add_paragraph(f"【战力参考】{e['power_code']}")
    # 属性参考 → 公式计算值
    if e.get('attrs'): out_doc.add_paragraph(f"【属性参考】{e['attrs']}")

    # 掉落物
    drops = e.get('structured_drops', [])
    if drops:
        out_doc.add_paragraph("【掉落物】")
        for d in drops:
            out_doc.add_paragraph(f"  · {d['item_id']} | {d['name']}")

    out_doc.add_paragraph('---')

out_doc.save('../rag/魔兽图鉴_v2.docx')
print(f"已重写魔兽图鉴: {len(entries)} 条 -> 魔兽图鉴_v2.docx")

# 替换原文件
import shutil
shutil.move('../rag/魔兽图鉴_v2.docx', '../rag/魔兽图鉴.docx')
print("已替换为魔兽图鉴.docx")

# ============================================================
#  更新 mob 表
# ============================================================
print("\n=== 更新数据库 ===")
conn = pymysql.connect(**DB)
cur = conn.cursor()

updated = 0
for e in entries:
    attrs = e['calc_attrs']
    power_code = e['power_code']

    # level = 战力编码对应的等级（用于匹配player level）
    level = power_code

    cur.execute(
        "UPDATE mob SET power=%s, intelligence=%s, quick=%s, stamina=%s, level=%s WHERE mob_id=%s",
        (attrs['power'], attrs['intelligence'], attrs['quick'], attrs['stamina'], level, e['mob_id'])
    )
    updated += 1

conn.commit()
print(f"更新 {updated} 条 mob")

# 验证
cur.execute("SELECT mob_id, name, power, intelligence, quick, stamina, level FROM mob WHERE mob_id IN ('WB-001','WB-002','WB-103','WB-205') ORDER BY mob_id")
print("\n验证:")
for row in cur.fetchall():
    total = row[2] + row[3] + row[4] + row[5]
    print(f"  {row[0]} {row[1]} | 力{row[2]} 智{row[3]} 敏{row[4]} 耐{row[5]} | level={row[6]} | total={total}")

conn.close()
print("\n完成!")