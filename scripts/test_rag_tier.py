"""测试RAG对不同danger_level的魔兽检索"""
import os
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'dqdl-agent'))
from rag_service import search, load_index

load_index()

tier_map = {1: '一阶', 2: '二阶', 3: '三阶'}
for danger, tier in tier_map.items():
    query = f'魔兽山脉 野外 魔兽栖息'
    results = search(query, top_k=30)
    matched = []
    for r in results:
        text = r['text']
        mob_id = mob_name = t = pr = None
        for line in text.split('\n'):
            line = line.strip()
            if line.startswith('【ID】'): mob_id = line.replace('【ID】','').strip()
            elif line.startswith('【名称】'): mob_name = line.replace('【名称】','').strip()
            elif line.startswith('【品阶】'): t = line.replace('【品阶】','').strip()
            elif line.startswith('【战力参考】'): pr = line.replace('【战力参考】','').strip()
        if mob_id and mob_name and t and t.startswith(tier):
            matched.append(f'{mob_id} {mob_name} ({t} 战力{pr})')
    print(f'\ndanger={danger} ({tier}): 找到 {len(matched)} 个')
    for m in matched[:5]:
        print(f'  {m}')