"""解析魔兽图鉴全部303条，生成mob和材料的INSERT SQL"""
from docx import Document
import json, re

doc = Document('../rag/魔兽图鉴.docx')

# 逐段落解析每条魔兽
entries = []
current = {}
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
if current and 'mob_id' in current:
    entries.append(current)

print(f'Parsed {len(entries)} entries')

# 品阶→属性模板
TIER_ATTRS = {
    '一阶': {'power': 8, 'intelligence': 5, 'quick': 10, 'stamina': 7},
    '二阶': {'power': 20, 'intelligence': 14, 'quick': 22, 'stamina': 18},
    '三阶': {'power': 40, 'intelligence': 30, 'quick': 38, 'stamina': 35},
    '四阶': {'power': 70, 'intelligence': 55, 'quick': 62, 'stamina': 65},
    '五阶': {'power': 120, 'intelligence': 100, 'quick': 105, 'stamina': 110},
}

# 战力修正系数
POWER_MOD = {
    '一星斗师': 0.3, '二星斗师': 0.5, '三星斗师': 0.7, '四星斗师': 0.85,
    '五星斗师': 1.0, '六星斗师': 1.2, '七星斗师': 1.4,
}

# 属性→元素缩写映射
ELEM_MAP = {
    '火': 'fire', '水': 'water', '风': 'wind', '雷': 'lightning',
    '冰': 'ice', '土': 'earth', '木': 'wood', '光': 'light', '暗': 'dark',
    '毒': 'poison', '斗': 'battle',
}

# 收集所有唯一材料名
material_set = set()
for e in entries:
    raw = e.get('drops_raw', '')
    if raw:
        for item in raw.split('、'):
            item = item.strip()
            if item:
                material_set.add(item)

# 已有cl材料 → 从材料图鉴读取
existing_cl = {}
try:
    mat_doc = Document('../rag/材料图鉴.docx')
    for p in mat_doc.paragraphs:
        t = p.text.strip()
        if t.startswith('【ID】cl-'):
            cl_id = t.replace('【ID】', '').strip()
        elif t.startswith('【名称】'):
            name = t.replace('【名称】', '').strip()
            existing_cl[name] = cl_id
except:
    pass

print(f'Existing CL entries: {len(existing_cl)}')

# 为新材料分配cl编号
next_cl = max([int(v.replace('cl-','')) for v in existing_cl.values()] + [100]) + 1
new_materials = {}
for m in sorted(material_set):
    if m not in existing_cl:
        new_materials[m] = f'cl-{next_cl}'
        next_cl += 1

print(f'New materials: {len(new_materials)}')

# 生成mob SQL
def calc_attrs(entry):
    tier = entry.get('tier', '二阶')
    base = TIER_ATTRS.get(tier, TIER_ATTRS['二阶']).copy()
    power_ref = entry.get('power_ref', '三星斗师')
    mod = POWER_MOD.get(power_ref, 0.7)
    return {
        'power': round(base['power'] * mod),
        'intelligence': round(base['intelligence'] * mod),
        'quick': round(base['quick'] * mod),
        'stamina': round(base['stamina'] * mod),
    }

def build_drops(entry):
    """构建掉落JSON"""
    raw = entry.get('drops_raw', '')
    if not raw:
        return '[]'
    drops = []
    element = entry.get('element','')
    tier = entry.get('tier','')
    
    # 魔核掉落
    elem_key = ELEM_MAP.get(element, 'neutral')
    mh_order_map = {'一阶': 'h1', '二阶': 'h2', '三阶': 'h3', '四阶': 'h4', '五阶': 'h5'}
    order_key = mh_order_map.get(tier, 'h2')
    
    # 查找魔核item_id
    mh_prefix = f'mh-{order_key}-{elem_key[0].upper()}'
    # 简化：直接用已知映射
    mh_map = {
        ('火','一阶'): 'mh-h1-1', ('火','二阶'): 'mh-h2-1', ('火','三阶'): 'mh-h3-1',
        ('水','一阶'): 'mh-h1-2', ('水','二阶'): 'mh-h2-2', ('水','三阶'): 'mh-h3-2',
        ('风','一阶'): 'mh-h1-3', ('风','二阶'): 'mh-h2-3', ('风','三阶'): 'mh-h3-3',
        ('雷','一阶'): 'mh-h1-4', ('雷','二阶'): 'mh-h2-4', ('雷','三阶'): 'mh-h3-4',
        ('冰','一阶'): 'mh-h1-5', ('冰','二阶'): 'mh-h2-5', ('冰','三阶'): 'mh-h3-5',
        ('土','一阶'): 'mh-h1-6', ('土','二阶'): 'mh-h2-6', ('土','三阶'): 'mh-h3-6',
        ('木','一阶'): 'mh-h1-7', ('木','二阶'): 'mh-h2-7', ('木','三阶'): 'mh-h3-7',
        ('光','一阶'): 'mh-h1-8', ('光','二阶'): 'mh-h2-8', ('光','三阶'): 'mh-h3-8',
        ('暗','一阶'): 'mh-h1-9', ('暗','二阶'): 'mh-h2-9', ('暗','三阶'): 'mh-h3-9',
        ('毒','一阶'): 'mh-h1-10', ('毒','二阶'): 'mh-h2-10', ('毒','三阶'): 'mh-h3-10',
        ('斗','一阶'): 'mh-h1-11', ('斗','二阶'): 'mh-h2-11', ('斗','三阶'): 'mh-h3-11',
    }
    mh_id = mh_map.get((element, tier), f'mh-h2-{elem_key[0].upper()}')
    
    core_name = entry.get('core', '')
    drops.append({
        'item_id': mh_id,
        'name': f'{tier}{element}属性魔核',
        'rate': 0.5, 'min': 1, 'max': 1, 'type': '公共'
    })
    
    # 材质掉落
    for item in raw.split('、'):
        item = item.strip()
        if not item:
            continue
        cl_id = existing_cl.get(item) or new_materials.get(item, 'unknown')
        drops.append({
            'item_id': cl_id,
            'name': item,
            'rate': 0.75, 'min': 1, 'max': 3, 'type': '专属'
        })
    return json.dumps(drops, ensure_ascii=False)

def build_description(entry):
    """构建描述文本"""
    parts = []
    if entry.get('appearance'):
        parts.append(f"【外观】{entry['appearance']}")
    if entry.get('size'):
        parts.append(f"【体型】{entry['size']}")
    if entry.get('abilities'):
        parts.append(f"【核心能力】{entry['abilities']}")
    if entry.get('weakness'):
        parts.append(f"【弱点】{entry['weakness']}")
    return '\n'.join(parts)

# 输出
with open('mob_inserts.sql', 'w', encoding='utf-8') as f:
    f.write('-- Mob inserts from 魔兽图鉴\n')
    for e in entries:
        mob_id = e['mob_id']
        name = e.get('name', mob_id)
        attrs = calc_attrs(e)
        attribute = e.get('element', '')[:8]
        description = build_description(e).replace("'", "\\'")
        drops = build_drops(e).replace("'", "\\'")
        sql = (
            f"INSERT INTO mob (mob_id, name, type, power, intelligence, quick, stamina, "
            f"attribute, description, drops) VALUES ("
            f"'{mob_id}', '{name}', '魔兽', {attrs['power']}, {attrs['intelligence']}, "
            f"{attrs['quick']}, {attrs['stamina']}, '{attribute}', '{description}', '{drops}');"
        )
        f.write(sql + '\n')

print(f'Wrote {len(entries)} mob INSERTs to mob_inserts.sql')

# 生成新材料item SQL
with open('material_inserts.sql', 'w', encoding='utf-8') as f:
    f.write('-- New material items from 魔兽图鉴\n')
    for name, cl_id in sorted(new_materials.items(), key=lambda x: x[1]):
        # 估算价格：100~500金币
        price = 200 + hash(name) % 300
        sql = (
            f"INSERT INTO item (item_id, name, type, price) VALUES ("
            f"'{cl_id}', '{name}', 'material', {price});"
        )
        f.write(sql + '\n')

print(f'Wrote {len(new_materials)} material INSERTs to material_inserts.sql')

# 生成材料图鉴docx条目
from docx.shared import Pt
if new_materials:
    mat_doc_out = Document()
    style = mat_doc_out.styles['Normal']
    style.font.size = Pt(11)
    style.font.name = '宋体'
    
    # 找来源
    name_sources = {}
    for e in entries:
        raw = e.get('drops_raw', '')
        if raw:
            for item in raw.split('、'):
                item = item.strip()
                if item in new_materials:
                    if item not in name_sources:
                        name_sources[item] = []
                    name_sources[item].append(e['mob_id'])
    
    for name, cl_id in sorted(new_materials.items(), key=lambda x: x[1]):
        mat_doc_out.add_paragraph(f'【ID】{cl_id}')
        mat_doc_out.add_paragraph(f'【名称】{name}')
        sources = name_sources.get(name, [])
        source_str = '、'.join(sources) if sources else '未知魔兽'
        mat_doc_out.add_paragraph(f'【来源】{source_str}')
        mat_doc_out.add_paragraph(f'【类型】材料')
        mat_doc_out.add_paragraph(f'【稀有度】普通')
        mat_doc_out.add_paragraph(f'【用途】可用于炼制丹药或打造装备。')
        mat_doc_out.add_paragraph('---')
    
    mat_doc_out.save('../rag/材料图鉴_新增.docx')
    print(f'Generated material docx with {len(new_materials)} entries')

print('Done!')
