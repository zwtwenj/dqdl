"""
重写魔兽图鉴 + 材料图鉴
1. 解析原始docx，统一掉落物格式（item_id + name 结构化）
2. 为293条缺失属性参考的魔兽计算属性（基于品阶+战力参考+元素倾向）
3. 重写魔兽图鉴docx（新格式：掉落物每行一个，含item_id）
4. 生成材料图鉴docx（含怪物名、怪物ID、AI生成描述）
5. 数据入库（mob + item表）
"""
import os
from docx import Document
from docx.shared import Pt
import json, re, pymysql, os, sys, random

DB = {
    'host': os.environ.get('DB_HOST', '127.0.0.1'),
    'port': 3306,
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', ''),
    'database': os.environ.get('DB_DATABASE', 'dqdl'),
    'charset': 'utf8mb4',
}

# ============================================================
#  常量定义
# ============================================================

# 元素缩写映射
ELEM_CODE = {
    '火': 'h', '水': 's', '风': 'f', '雷': 'l',
    '冰': 'b', '土': 't', '木': 'm', '光': 'g',
    '暗': 'a', '毒': 'd', '斗': 'bg',
}

# 品阶→阶数编号
TIER_NUM = {'一阶': 1, '二阶': 2, '三阶': 3, '四阶': 4, '五阶': 5}

# 品阶→属性基础总量
TIER_TOTAL = {
    '一阶': 65,   # 斗之气级别
    '二阶': 160,  # 斗者级别
    '三阶': 350,  # 斗师级别
}

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

# 战力参考→标准化等级 (1-27)
# 斗之气1段=1, ..., 斗之气9段=9
# 斗者1星=10, ..., 斗者9星=18
# 斗师1星=19, ..., 斗师9星=27

def parse_power_ref_to_level(power_ref: str, tier: str) -> int:
    """将战力参考文本解析为1-27的标准等级"""
    if not power_ref or power_ref == 'NONE':
        # 按品阶给默认值
        defaults = {'一阶': 3, '二阶': 12, '三阶': 21}
        return defaults.get(tier, 3)
    
    pr = power_ref.strip()
    
    # 纯数字（如 "3" = 斗之气三段）
    m = re.match(r'^(\d)$', pr)
    if m:
        return int(m.group(1))
    
    # 斗之气X段
    m = re.search(r'斗之气([一二三四五六七八九])段', pr)
    if m:
        cn = m.group(1)
        return '一二三四五六七八九'.index(cn) + 1
    
    # 斗者X星
    m = re.search(r'斗者([一二三四五六七八九])星', pr)
    if m:
        cn = m.group(1)
        return 10 + '一二三四五六七八九'.index(cn)
    
    # 斗师X星
    m = re.search(r'斗师([一二三四五六七八九])星', pr)
    if m:
        cn = m.group(1)
        return 19 + '一二三四五六七八九'.index(cn)
    
    # "X星至Y星" 或 "X段到Y段" → 取中间值
    m = re.search(r'([一二三四五六七八九])星至([一二三四五六七八九])星', pr)
    if m:
        cn1 = m.group(1)
        cn2 = m.group(2)
        v1 = '一二三四五六七八九'.index(cn1)
        v2 = '一二三四五六七八九'.index(cn2)
        avg = (v1 + v2) // 2
        # 根据上下文判断是斗者还是斗师
        if '斗师' in pr:
            return 19 + avg
        return 10 + avg
    
    m = re.search(r'([一二三四五六七八九])段至([一二三四五六七八九])段', pr)
    if m:
        cn1 = m.group(1)
        cn2 = m.group(2)
        v1 = '一二三四五六七八九'.index(cn1) + 1
        v2 = '一二三四五六七八九'.index(cn2) + 1
        return (v1 + v2) // 2
    
    # "相当于人类斗者中期" 等
    m = re.search(r'斗者初期', pr)
    if m:
        return 10
    m = re.search(r'斗者中期', pr)
    if m:
        return 13
    m = re.search(r'斗者后期', pr)
    if m:
        return 16
    m = re.search(r'斗者巅峰', pr)
    if m:
        return 18
    
    # "半星斗师"
    if '半星斗师' in pr:
        return 19
    
    # 范围含"斗之气一段到二段"
    m = re.search(r'斗之气([一二三四五六七八九])段到([一二三四五六七八九])段', pr)
    if m:
        v1 = '一二三四五六七八九'.index(m.group(1)) + 1
        v2 = '一二三四五六七八九'.index(m.group(2)) + 1
        return (v1 + v2) // 2
    
    # "相当于人类斗之气X段"
    m = re.search(r'斗之气([一二三四五六七八九])段', pr)
    if m:
        return '一二三四五六七八九'.index(m.group(1)) + 1
    
    # "相当于人类X星斗者"
    m = re.search(r'([一二三四五六七八九])星斗者', pr)
    if m:
        return 10 + '一二三四五六七八九'.index(m.group(1))
    
    # "相当于斗者X星"
    m = re.search(r'相当于斗者([一二三四五六七八九])星', pr)
    if m:
        return 10 + '一二三四五六七八九'.index(m.group(1))
    
    # "相当于人类X星斗师"
    m = re.search(r'([一二三四五六七八九])星斗师', pr)
    if m:
        return 19 + '一二三四五六七八九'.index(m.group(1))
    
    # "相当于斗师X星"
    m = re.search(r'相当于斗师([一二三四五六七八九])星', pr)
    if m:
        return 19 + '一二三四五六七八九'.index(m.group(1))
    
    # "八星斗师" / "六星斗师" 等直接出现
    m = re.search(r'([一二三四五六七八九])星斗师', pr)
    if m:
        return 19 + '一二三四五六七八九'.index(m.group(1))
    
    # 带括号的复杂描述 → 取基础值
    m = re.search(r'斗之气([一二三四五六七八九])段', pr)
    if m:
        return '一二三四五六七八九'.index(m.group(1)) + 1
    
    # "相当于人类五到六星斗者"
    m = re.search(r'([五六七八九])到([一二三四五六七八九])星斗者', pr)
    if m:
        v1 = '一二三四五六七八九'.index(m.group(1))
        v2 = '一二三四五六七八九'.index(m.group(2))
        return 10 + (v1 + v2) // 2
    
    # "相当于人类八到九星斗者"
    m = re.search(r'([一二三四五六七八九])到([一二三四五六七八九])星斗者', pr)
    if m:
        v1 = '一二三四五六七八九'.index(m.group(1))
        v2 = '一二三四五六七八九'.index(m.group(2))
        return 10 + (v1 + v2) // 2
    
    # 按品阶给默认值
    defaults = {'一阶': 3, '二阶': 12, '三阶': 21}
    print(f"  [WARN] 无法解析战力参考: '{pr}' -> 使用默认值 {defaults.get(tier, 3)}")
    return defaults.get(tier, 3)


def calc_attrs(level: int, element: str, tier: str) -> dict:
    """
    根据等级、元素、品阶计算属性
    level: 1-27 (斗之气1段=1 ~ 斗师9星=27)
    """
    base_total = TIER_TOTAL.get(tier, 65)
    
    # 等级在品阶范围内的比例 → 缩放总量
    if tier == '一阶':
        # 一阶对应level 1-9
        ratio = max(0.4, (level - 0) / 10)  # 0.4 ~ 0.9
    elif tier == '二阶':
        # 二阶对应level 10-18
        ratio = max(0.5, (level - 8) / 12)  # 0.5 ~ 0.83
    else:
        # 三阶对应level 19-27
        ratio = max(0.5, (level - 17) / 12)
    
    total = round(base_total * ratio)
    
    # 应用元素倾向
    bias = ELEM_BIAS.get(element, (1, 1, 1, 1))
    bias_sum = sum(bias)
    
    # 按倾向分配总量
    power = max(1, round(total * bias[0] / bias_sum))
    intelligence = max(1, round(total * bias[1] / bias_sum))
    stamina = max(1, round(total * bias[2] / bias_sum))
    quick = max(1, round(total * bias[3] / bias_sum))
    
    # 加一点随机扰动 (±10%)
    attrs = [power, intelligence, stamina, quick]
    for i in range(4):
        jitter = random.randint(-max(1, attrs[i] // 10), max(1, attrs[i] // 10))
        attrs[i] = max(1, attrs[i] + jitter)
    
    return {'power': attrs[0], 'intelligence': attrs[1], 'stamina': attrs[2], 'quick': attrs[3]}


# ============================================================
#  解析原始docx
# ============================================================
print("=== 解析魔兽图鉴 ===")
doc = Document('../rag/魔兽图鉴.docx')

entries = []
current = {}
ALL_FIELDS = ['mob_id', 'name', 'element', 'tier', 'danger', 'habitat',
              'appearance', 'size', 'abilities', 'weakness', 'core',
              'drops_raw', 'power_ref', 'rarity', 'temper', 'attrs']

for p in doc.paragraphs:
    t = p.text.strip()
    if not t:
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
    elif t.startswith('【魔核】'):
        current['core'] = t.replace('【魔核】', '').strip()
    elif t.startswith('【掉落物】'):
        current['drops_raw'] = t.replace('【掉落物】', '').strip()
    elif t.startswith('【战力参考】'):
        current['power_ref'] = t.replace('【战力参考】', '').strip()
    elif t.startswith('【稀有度】'):
        current['rarity'] = t.replace('【稀有度】', '').strip()
    elif t.startswith('【性情】'):
        current['temper'] = t.replace('【性情】', '').strip()
    elif t.startswith('【属性参考】'):
        current['attrs'] = t.replace('【属性参考】', '').strip()

if current and 'mob_id' in current:
    entries.append(current)

print(f"解析完成: {len(entries)} 条")

# ============================================================
#  解析掉落物，分配item_id
# ============================================================
print("\n=== 解析掉落物 ===")

def parse_drops_raw(drops_raw: str, entry: dict) -> list:
    """
    解析掉落物原始文本，返回 [{item_id, name, type}]
    type: 'core' (魔核/公共) 或 'material' (专属材料)
    """
    if not drops_raw:
        return []
    
    drops = []
    
    # 尝试匹配 【ID】xxx 格式（前10条）
    id_pattern = re.findall(r'【ID】([\w-]+)\s*(.*?)(?=，【ID】|，$|$)', drops_raw)
    if id_pattern:
        for item_id, name in id_pattern:
            name = name.strip().rstrip('，').strip()
            if item_id.startswith('mh-'):
                # 魔核：补全为三位格式 mh-Xn-Q
                # 旧格式如 mh-h1 → 需要转为 mh-h1-1
                if not re.match(r'mh-\w+\d+-\d+$', item_id):
                    item_id = item_id + '-1'  # 默认劣质
                if not name:
                    # 补充魔核名称
                    element = entry.get('element', '')
                    tier = entry.get('tier', '')
                    name = f'劣质{tier}{element}属性魔核'
                drops.append({'item_id': item_id, 'name': name, 'type': 'core'})
            elif item_id.startswith('cl-'):
                # 清理名称：去掉括号中的描述
                clean_name = re.sub(r'[（(].*?[）)]', '', name).strip()
                drops.append({'item_id': item_id, 'name': clean_name, 'type': 'material'})
    else:
        # 纯文本格式（如 "熔岩鳞片、火尾骨"）
        for item in drops_raw.split('、'):
            item = item.strip()
            if not item:
                continue
            # 清理括号描述
            clean_name = re.sub(r'[（(].*?[）)]', '', item).strip()
            drops.append({'item_id': None, 'name': clean_name, 'type': 'material'})
    
    return drops


# 先收集所有材料名称，统一分配cl编号
material_names = set()  # 所有材料名称
material_sources = {}   # name -> [(mob_id, mob_name)]

for e in entries:
    d = parse_drops_raw(e.get('drops_raw', ''), e)
    for item in d:
        if item['type'] == 'material':
            material_names.add(item['name'])
            if item['name'] not in material_sources:
                material_sources[item['name']] = []
            material_sources[item['name']].append((e['mob_id'], e.get('name', '')))

print(f"唯一材料名称: {len(material_names)}")

# 为材料分配cl编号 (已有cl-100~cl-109的保留)
# 先从现有docx中提取已有映射
existing_cl_map = {}  # name -> cl_id
for e in entries[:10]:
    d = parse_drops_raw(e.get('drops_raw', ''), e)
    for item in d:
        if item['type'] == 'material' and item['item_id'] and item['item_id'].startswith('cl-'):
            existing_cl_map[item['name']] = item['item_id']

print(f"已有cl映射: {existing_cl_map}")

# 分配新cl编号
next_cl_num = 110
material_id_map = dict(existing_cl_map)
for name in sorted(material_names):
    if name not in material_id_map:
        material_id_map[name] = f'cl-{next_cl_num}'
        next_cl_num += 1

print(f"总材料ID映射: {len(material_id_map)} 条")

# 为每个魔兽生成魔核ID和完整的掉落物列表
for e in entries:
    element = e.get('element', '')
    tier = e.get('tier', '')
    tier_num = TIER_NUM.get(tier, 1)
    elem_code = ELEM_CODE.get(element, 'h')
    
    # 解析原有掉落物
    old_drops = parse_drops_raw(e.get('drops_raw', ''), e)
    
    # 构建完整掉落物列表
    structured_drops = []
    
    # 1. 添加魔核（如果原有掉落物中没有mh开头的）
    has_core = any(d['type'] == 'core' for d in old_drops)
    if not has_core:
        # 根据战力参考确定魔核品质
        level = parse_power_ref_to_level(e.get('power_ref', ''), tier)
        if tier == '一阶':
            quality = 1 if level <= 3 else (2 if level <= 6 else 3)
        elif tier == '二阶':
            quality = 1 if level <= 12 else (2 if level <= 15 else 3)
        else:
            quality = 1 if level <= 21 else (2 if level <= 24 else 3)
        quality_names = {1: '劣质', 2: '普通', 3: '优质'}
        mh_id = f'mh-{elem_code}{tier_num}-{quality}'
        mh_name = f'{quality_names[quality]}{tier}{element}属性魔核'
        structured_drops.append({'item_id': mh_id, 'name': mh_name, 'type': 'core'})
    else:
        # 保留原有魔核
        for d in old_drops:
            if d['type'] == 'core':
                structured_drops.append(d)
    
    # 2. 添加材料
    for d in old_drops:
        if d['type'] == 'material':
            cl_id = material_id_map.get(d['name'], 'cl-unknown')
            structured_drops.append({'item_id': cl_id, 'name': d['name'], 'type': 'material'})
    
    e['structured_drops'] = structured_drops

# ============================================================
#  计算属性参考（为缺失的293条补齐）
# ============================================================
print("\n=== 计算属性参考 ===")
random.seed(42)  # 固定种子确保可复现

no_attr_count = 0
for e in entries:
    if not e.get('attrs'):
        tier = e.get('tier', '一阶')
        element = e.get('element', '')
        # 取第一个元素（冰/毒 双属性取第一个）
        primary_elem = element.split('/')[0] if '/' in element else element
        level = parse_power_ref_to_level(e.get('power_ref', ''), tier)
        attrs = calc_attrs(level, primary_elem, tier)
        e['attrs'] = f"力{attrs['power']} 智{attrs['intelligence']} 耐{attrs['stamina']} 敏{attrs['quick']}"
        e['calc_attrs'] = attrs
        no_attr_count += 1

print(f"为 {no_attr_count} 条魔兽补齐了属性参考")

# 验证前10条的属性
print("\n属性参考验证(前15条):")
for e in entries[:15]:
    print(f"  {e['mob_id']} {e.get('name', '')} | {e.get('attrs', '')} | power_ref={e.get('power_ref', '')}")

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
    if e.get('power_ref'): out_doc.add_paragraph(f"【战力参考】{e['power_ref']}")
    if e.get('attrs'): out_doc.add_paragraph(f"【属性参考】{e['attrs']}")
    
    # 掉落物：每行一个，结构化
    drops = e.get('structured_drops', [])
    if drops:
        out_doc.add_paragraph("【掉落物】")
        for d in drops:
            out_doc.add_paragraph(f"  · {d['item_id']} | {d['name']}")
    
    out_doc.add_paragraph('---')

out_doc.save('../rag/魔兽图鉴.docx')
print(f"已重写魔兽图鉴: {len(entries)} 条")

# ============================================================
#  数据入库
# ============================================================
print("\n=== 数据入库 ===")
conn = pymysql.connect(**DB)
cur = conn.cursor()

# 清空表
cur.execute("SET FOREIGN_KEY_CHECKS=0")
cur.execute("TRUNCATE TABLE mob")
cur.execute("TRUNCATE TABLE item")
cur.execute("SET FOREIGN_KEY_CHECKS=1")
print("mob/item 表已清空")

# 插入魔核 item（从魔核图鉴收集）
# 先从魔核图鉴读取已有的mh items
mh_items = {}  # item_id -> {name, type, price, description}
try:
    mh_doc = Document('../rag/魔核图鉴.docx')
    cur_mh = {}
    for p in mh_doc.paragraphs:
        t = p.text.strip()
        if not t or t == '---':
            if cur_mh and 'id' in cur_mh:
                mh_items[cur_mh['id']] = cur_mh
            cur_mh = {}
            continue
        if t.startswith('【ID】'):
            cur_mh['id'] = t.replace('【ID】', '').strip()
        elif t.startswith('【名称】'):
            cur_mh['name'] = t.replace('【名称】', '').strip()
        elif t.startswith('【参考价格】'):
            price_str = t.replace('【参考价格】', '').strip()
            # 解析价格范围
            m = re.search(r'(\d+)', price_str)
            cur_mh['price'] = int(m.group(1)) if m else 100
        elif t.startswith('【用途】'):
            cur_mh['description'] = t.replace('【用途】', '').strip()
        elif t.startswith('【属性】'):
            cur_mh['element'] = t.replace('【属性】', '').strip()
    if cur_mh and 'id' in cur_mh:
        mh_items[cur_mh['id']] = cur_mh
    print(f"从魔核图鉴读取 {len(mh_items)} 条魔核")
except Exception as ex:
    print(f"魔核图鉴读取失败: {ex}")

# 插入魔核到item表
mh_inserted = 0
for item_id, info in mh_items.items():
    cur.execute(
        "INSERT INTO item (item_id, name, type, price, description) VALUES (%s, %s, %s, %s, %s)",
        (item_id, info.get('name', item_id), '魔核', info.get('price', 100), info.get('description', ''))
    )
    mh_inserted += 1
print(f"插入 {mh_inserted} 条魔核 item")

# 插入材料到item表
mat_inserted = 0
for name, cl_id in sorted(material_id_map.items(), key=lambda x: x[1]):
    sources = material_sources.get(name, [])
    # 估算价格
    source_count = len(sources)
    if source_count >= 5:
        price = 80 + abs(hash(name)) % 120
    elif source_count >= 2:
        price = 200 + abs(hash(name)) % 200
    else:
        price = 400 + abs(hash(name)) % 400
    
    cur.execute(
        "INSERT INTO item (item_id, name, type, price, description) VALUES (%s, %s, %s, %s, %s)",
        (cl_id, name, '材料', price, '')  # description稍后由AI生成更新
    )
    mat_inserted += 1
print(f"插入 {mat_inserted} 条材料 item")

# 插入mob数据
mob_inserted = 0
for e in entries:
    mob_id = e['mob_id']
    name = e.get('name', mob_id)
    
    # 解析属性参考
    attrs_str = e.get('attrs', '')
    attr_m = {
        'power': 0, 'intelligence': 0, 'quick': 0, 'stamina': 0
    }
    if attrs_str:
        m = re.search(r'力(\d+)', attrs_str)
        if m: attr_m['power'] = int(m.group(1))
        m = re.search(r'智(\d+)', attrs_str)
        if m: attr_m['intelligence'] = int(m.group(1))
        m = re.search(r'耐(\d+)', attrs_str)
        if m: attr_m['stamina'] = int(m.group(1))
        m = re.search(r'敏(\d+)', attrs_str)
        if m: attr_m['quick'] = int(m.group(1))
    
    # 如果是计算出来的属性，直接使用
    if e.get('calc_attrs'):
        attr_m = e['calc_attrs']
    
    # 元素属性
    element = e.get('element', '')[:8]
    
    # 描述
    desc_parts = []
    if e.get('appearance'): desc_parts.append(f"外观：{e['appearance']}")
    if e.get('size'): desc_parts.append(f"体型：{e['size']}")
    if e.get('abilities'): desc_parts.append(f"核心能力：{e['abilities']}")
    if e.get('weakness'): desc_parts.append(f"弱点：{e['weakness']}")
    description = '\n'.join(desc_parts)
    
    # 掉落物JSON
    drops = e.get('structured_drops', [])
    drops_json_list = []
    for d in drops:
        drop_type = '公共' if d['type'] == 'core' else '专属'
        rate = 0.5 if d['type'] == 'core' else 0.75
        min_max = (1, 1) if d['type'] == 'core' else (1, 3)
        drops_json_list.append({
            'item_id': d['item_id'],
            'name': d['name'],
            'rate': rate,
            'min': min_max[0],
            'max': min_max[1],
            'type': drop_type,
        })
    drops_json = json.dumps(drops_json_list, ensure_ascii=False)
    
    cur.execute(
        "INSERT INTO mob (mob_id, name, power, intelligence, quick, stamina, attribute, description, drops) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (mob_id, name, attr_m['power'], attr_m['intelligence'], attr_m['quick'], attr_m['stamina'],
         element, description, drops_json)
    )
    mob_inserted += 1

conn.commit()
print(f"插入 {mob_inserted} 条 mob")

# 验证
cur.execute("SELECT COUNT(*) FROM mob")
print(f"mob表记录数: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM item")
print(f"item表记录数: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM item WHERE type='材料'")
print(f"  其中材料: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM item WHERE type='魔核'")
print(f"  其中魔核: {cur.fetchone()[0]}")

conn.close()
print("\n数据库操作完成!")

# ============================================================
#  保存材料数据到JSON（供后续AI生成描述用）
# ============================================================
material_data = []
for name, cl_id in sorted(material_id_map.items(), key=lambda x: x[1]):
    sources = material_sources.get(name, [])
    material_data.append({
        'item_id': cl_id,
        'name': name,
        'source_mobs': [{'mob_id': s[0], 'name': s[1]} for s in sources],
    })

with open('material_data.json', 'w', encoding='utf-8') as f:
    json.dump(material_data, f, ensure_ascii=False, indent=2)
print(f"\n材料数据已保存到 material_data.json ({len(material_data)} 条)")
