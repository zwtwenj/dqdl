"""检查战力编码分布"""
from docx import Document
import re

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
    elif t.startswith('【品阶】'):
        current['tier'] = t.replace('【品阶】', '').strip()
    elif t.startswith('【战力参考】'):
        current['power_ref'] = t.replace('【战力参考】', '').strip()
if current and 'mob_id' in current:
    entries.append(current)

# 战力编码映射
cn_nums = '一二三四五六七八九'
POWER_NAMES = {}
for i in range(1, 10):
    POWER_NAMES[i] = f'斗之气{cn_nums[i-1]}段'
for i in range(1, 10):
    POWER_NAMES[10 + i] = f'斗者{cn_nums[i-1]}星'
for i in range(1, 10):
    POWER_NAMES[20 + i] = f'斗师{cn_nums[i-1]}星'

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

# 分析分布
for tier in ['一阶', '二阶', '三阶']:
    tier_entries = [e for e in entries if e.get('tier') == tier]
    codes = []
    anomalies = []
    for e in tier_entries:
        code = parse_power_ref(e.get('power_ref', ''), tier)
        codes.append(code)
        # 检查编码是否在正确范围
        if tier == '一阶' and (code < 1 or code > 9):
            anomalies.append((e['mob_id'], e.get('name', ''), e.get('power_ref', ''), code))
        elif tier == '二阶' and (code < 11 or code > 19):
            anomalies.append((e['mob_id'], e.get('name', ''), e.get('power_ref', ''), code))
        elif tier == '三阶' and (code < 21 or code > 29):
            anomalies.append((e['mob_id'], e.get('name', ''), e.get('power_ref', ''), code))

    print(f"\n=== {tier} ({len(tier_entries)}条) ===")
    print(f"  编码范围: {min(codes)}-{max(codes)}")
    from collections import Counter
    code_dist = Counter(codes)
    for code in sorted(code_dist.keys()):
        print(f"  编码{code}({POWER_NAMES.get(code, '?')}): {code_dist[code]}条")

    if anomalies:
        print(f"  ** 异常编码 ({len(anomalies)}条) **")
        for mob_id, name, pref, code in anomalies[:10]:
            print(f"    {mob_id} {name} | 原文='{pref}' -> 编码={code}")