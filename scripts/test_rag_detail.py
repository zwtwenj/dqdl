"""模拟_fetch_real_mobs对danger=1的检索"""
import os, json, re
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'dqdl-agent'))
from rag_service import search, load_index

load_index()

# 模拟 id=12 毒瘴林 danger=1 的场景
parent_info = {'name': '玄冰帝国'}
loc_info = {'description': '毒气弥漫的危险森林', 'tags': ['毒', '森林'], 'danger_level': 1}
desc = loc_info.get('description', '')
tags = ', '.join(loc_info.get('tags') or [])
parent_name = parent_info.get('name', '')
query = f'{parent_name} {tags} {desc} 魔兽栖息'.strip()
print(f'query: {query}')

results = search(query, top_k=24)
danger_level = 1
tier_map = {1: '一阶', 2: '二阶', 3: '三阶'}
expected_tier = tier_map.get(danger_level)

mobs = []
for r in results:
    text = r['text']
    mob_id = mob_name = tier = power_ref = None
    for line in text.split('\n'):
        line = line.strip()
        if line.startswith('【ID】'): mob_id = line.replace('【ID】','').strip()
        elif line.startswith('【名称】'): mob_name = line.replace('【名称】','').strip()
        elif line.startswith('【品阶】'): tier = line.replace('【品阶】','').strip()
        elif line.startswith('【战力参考】'): power_ref = line.replace('【战力参考】','').strip()
    if mob_id and mob_name:
        if expected_tier and tier:
            if not tier.startswith(expected_tier):
                print(f'  跳过: {mob_id} {mob_name} ({tier}) - 不匹配{expected_tier}')
                continue
        mobs.append(f'{mob_id} {mob_name} ({tier})')
    if len(mobs) >= 4:
        break

print(f'\n结果: {len(mobs)} 个一阶魔兽')
for m in mobs:
    print(f'  {m}')