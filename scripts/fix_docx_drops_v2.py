"""精准修复魔兽图鉴.docx的【掉落物】格式
只处理：1) ×N，格式 → 拆分为纯材料名+、  2) 括号描述 → 去掉
不动：WB-001~WB-011（含【ID】的掉落物段落）"""
from docx import Document
import re

doc = Document('../rag/魔兽图鉴.docx')
fixes = []

for i, p in enumerate(doc.paragraphs):
    t = p.text.strip()
    if not t.startswith('【掉落物】'):
        continue

    raw = t.replace('【掉落物】', '').strip()
    if not raw:
        continue

    # 跳过WB-001~WB-011: 含【ID】的格式不动
    if '【ID】' in raw:
        fixes.append((i, t[:50], '(SKIP - 含【ID】)'))
        continue

    # 否则：统一处理
    # 1. 先按中文逗号和顿号拆
    # 但要注意括号内的逗号不要被拆分 —— 用更智能的方式
    # 先提取所有顶级项（被、或，分隔，但要跳过括号内的）

    items = []
    # 用正则找出所有顶层材料名（跳过括号内的，分割符）
    # 策略：逐一走字符，跟踪括号深度
    depth = 0
    start = 0
    for j, ch in enumerate(raw):
        if ch in '（(':
            depth += 1
        elif ch in '）)':
            depth = max(0, depth - 1)
        elif ch in '，、' and depth == 0:
            item = raw[start:j].strip().rstrip('。')
            if item:
                items.append(item)
            start = j + 1
    # 最后一段
    item = raw[start:].strip().rstrip('。')
    if item:
        items.append(item)

    # 2. 每个item：去×N、去括号描述
    clean = []
    for item in items:
        if not item:
            continue
        # 去 ×N
        item = re.sub(r'\u00d7\d+', '', item)
        # 去括号及其内容
        item = re.sub(r'[（(][^）)]*[）)]', '', item)
        item = item.strip()
        if item and item not in clean:
            clean.append(item)

    if clean:
        new_text = '【掉落物】' + '、'.join(clean)
        if new_text != t:
            for run in p.runs:
                run.text = ''
            if p.runs:
                p.runs[0].text = new_text
            else:
                p.add_run(new_text)
            fixes.append((i, t[:60], new_text[:60]))

print(f'修复了 {len(fixes)} 条【掉落物】')
skip_count = sum(1 for f in fixes if 'SKIP' in f[2])
mod_count = sum(1 for f in fixes if 'SKIP' not in f[2])
print(f'  跳过（含【ID】）: {skip_count}')
print(f'  修改: {mod_count}')

for idx, old, new in fixes[:15]:
    print(f'  [{idx}] {old} → {new}')
if len(fixes) > 15:
    print(f'  ... 等共 {len(fixes)} 条')

doc.save('../rag/魔兽图鉴.docx')
print('\n已保存!')
