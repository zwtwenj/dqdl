"""解析魔兽图鉴，提取每个WB-xxx的品阶 → 如 一阶三段"""
import json, re
from docx import Document

doc = Document('../rag/魔兽图鉴.docx')

NUM_MAP = {'1':'一','2':'二','3':'三','4':'四','5':'五','6':'六','7':'七','8':'八','9':'九'}

def clean_rank(tier, power_ref):
    """清洗品阶：一阶 + 战力参考 → 一阶三段"""
    if not tier:
        return None
    # 没有战力参考，只有品阶
    if not power_ref:
        return tier
    
    # power_ref 已经是完整格式如 "一阶三段"
    if power_ref.startswith(tier) and '段' in power_ref:
        # 取 "一阶三段" 核心部分，去掉括号注解
        match = re.match(r'(一阶[一二三四五六七八九]?段)', power_ref)
        if match:
            return match.group(1)
    
    # power_ref 是完整格式如 "一阶三段" 但没有段字
    # 检查是否以 tier 开头
    if power_ref.startswith(tier):
        # 提取紧随 tier 后的数字/段
        rest = power_ref[len(tier):].strip()
        # 尝试提取一个中文数字+段
        m = re.match(r'([一二三四五六七八九])段', rest)
        if m:
            return f'{tier}{m.group(0)}'
        # 尝试提取一个阿拉伯数字
        m = re.match(r'(\d+)', rest)
        if m:
            return f'{tier}{NUM_MAP.get(m.group(1), m.group(1))}段'
        # 清理括号
        m = re.match(r'([^（(]+)', rest)
        if m:
            extra = m.group(1).strip()
            if extra:
                return f'{tier}{extra}'
    
    # power_ref 是纯数字，如 "3", "4"
    m = re.match(r'(\d+)', power_ref)
    if m:
        return f'{tier}{NUM_MAP.get(m.group(1), m.group(1))}段'
    
    # power_ref 是 "一星斗师" 格式（二阶/三阶）
    for num_cn in NUM_MAP.values():
        if f'{num_cn}星' in power_ref:
            return f'{tier}{num_cn}星'
    if '半星' in power_ref:
        return f'{tier}半星'

    # 一阶：提取 "斗之气X段" 或 "X段"
    dm = re.search(r'([一二三四五六七八九])段', power_ref)
    if dm:
        return f'{tier}{dm.group(0)}'

    # 一阶：提取 "斗者X期"
    for label, num in [('巅峰','巅峰'),('后期','后期'),('中期','中期'),('初期','初期')]:
        if label in power_ref:
            return f'{tier}{num}'

    # fallback: 保留原值
    return f'{tier}·{power_ref}'

rank_map = {}
mob_id = None
tier = None
power_ref = None

for p in doc.paragraphs:
    t = p.text.strip()
    if not t:
        continue
    if t.startswith('【ID】WB-'):
        if mob_id and tier:
            rank_map[mob_id] = clean_rank(tier, power_ref)
        mob_id = re.search(r'WB-\d+', t).group()
        tier = None
        power_ref = None
    elif t.startswith('【品阶】'):
        tier = t.replace('【品阶】', '').strip()
    elif t.startswith('【战力参考】'):
        power_ref = t.replace('【战力参考】', '').strip()

if mob_id and tier:
    rank_map[mob_id] = clean_rank(tier, power_ref)

print(f'共解析 {len(rank_map)} 条')
vals = sorted(set(rank_map.values()))
print(f'唯一品阶 ({len(vals)}种):')
for v in vals:
    print(f'  {v}')
print()

with open('mob_rank_map.json', 'w', encoding='utf-8') as f:
    json.dump(rank_map, f, ensure_ascii=False, indent=2)
print('已保存 mob_rank_map.json')
