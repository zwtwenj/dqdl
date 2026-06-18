"""分析魔兽图鉴：不同品阶的掉落物和属性参考分布"""
from docx import Document
import re

doc = Document('../rag/魔兽图鉴.docx')

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
    elif t.startswith('【掉落物】'):
        current['drops'] = t.replace('【掉落物】', '').strip()
    elif t.startswith('【属性参考】'):
        current['attrs'] = t.replace('【属性参考】', '').strip()
    elif t.startswith('【战力参考】'):
        current['power_ref'] = t.replace('【战力参考】', '').strip()
if current and 'mob_id' in current:
    entries.append(current)

# 不同品阶样例
for tier in ['一阶', '二阶', '三阶']:
    tier_entries = [e for e in entries if e.get('tier') == tier]
    print(f'\n=== {tier} ({len(tier_entries)}条) ===')
    for e in tier_entries[:3]:
        print(f"  {e['mob_id']} {e.get('name', '')} | {e.get('element', '')} | drops={e.get('drops', 'NONE')}")
        print(f"    attrs={e.get('attrs', 'NONE')} | power_ref={e.get('power_ref', 'NONE')}")

# 统计唯一cl/mh id
all_cl = set()
all_mh = set()
for e in entries:
    d = e.get('drops', '')
    if d:
        for m in re.finditer(r'cl-\d+', d):
            all_cl.add(m.group())
        for m in re.finditer(r'mh-[\w]+', d):
            all_mh.add(m.group())

print(f'\n=== ID统计 ===')
print(f'Unique cl-xxx: {len(all_cl)}')
print(f'  {sorted(all_cl)}')
print(f'Unique mh-xxx: {len(all_mh)}')
print(f'  {sorted(all_mh)}')

# 解析掉落物名称
print('\n=== 掉落物名称提取(前20条) ===')
for e in entries[:20]:
    d = e.get('drops', '')
    if not d:
        continue
    # 用正则提取: 【ID】xxx 名称部分
    items = re.findall(r'【ID】([\w-]+)\s*(.*?)(?=，【ID】|$)', d)
    print(f"  {e['mob_id']} {e.get('name', '')}: {items}")

# 属性参考中的具体数值分布
print('\n=== 有属性参考的条目 ===')
for e in entries:
    if e.get('attrs'):
        print(f"  {e['mob_id']} {e.get('name', '')}: {e['attrs']}")

# 战力参考分布
print('\n=== 战力参考分布 ===')
from collections import Counter
power_refs = Counter(e.get('power_ref', 'NONE') for e in entries)
for k, v in power_refs.most_common():
    print(f'  {k}: {v}')
