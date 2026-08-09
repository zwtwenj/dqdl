"""
故事 → 游戏事件 适配器。

把 dqdl_writer 生成的网状故事（narrative/choice/ending，story JSON 数组格式）
转成 story_event 表的事件数据（nodes 为 {start, nodes:{id:{...}}} 格式），
并在节点/分支上挂 action（battle/move/reward），真实 ID 由向量库检索兜底。

流程：
  1. 读 story JSON（dqdl_writer/output/story_xxx.json）
  2. 结构转换：nodes[] 数组 → {start, nodes:{id:{type,title,text,next/choices/end,action}}}
  3. LLM 逐连接决策 action（只输出语义描述，不编造 ID）
  4. 向量库检索回填真实 mob_id / 地图 / 掉落
  5. 入库 story_event（一条记录）

用法：
  python adapt_story.py --story output/story_xxx.json
  python adapt_story.py --all            # 处理 output/ 下所有未入库的故事
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime

# Windows 控制台/管道默认 GBK 编码，日志含 ✓ 等非 GBK 字符时会 UnicodeEncodeError。
# 强制 stdout/stderr 用 UTF-8，保证 print 与 subprocess 管道都能正常输出。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from dotenv import load_dotenv
load_dotenv()

from llm_client import call_deepseek  # dqdl-agent 的 LLM 封装（deepseek）
from rag_service import search
from db import _db_config

import pymysql

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WRITER_DIR = os.path.join(BASE_DIR, '..', 'dqdl_writer')

# action 决策的 LLM 温度
TEMP = 0.4


# ========== 1. 读故事 ==========

def load_story_json(path: str) -> dict:
    with open(path, encoding='utf-8') as f:
        return json.load(f)


# ========== 2. 结构转换 ==========

def convert_nodes(story: dict) -> dict:
    """nodes[] 数组 → {start, nodes:{id:{...}}}（story_event.nodes 格式）"""
    nodes = story.get('nodes', [])
    out = {'start': 'n1', 'nodes': {}}
    for n in nodes:
        nid = n.get('id', '?')
        nn = {
            'type': n.get('type', 'narrative'),
            'title': n.get('title', ''),
            'text': n.get('narrative', '') or n.get('text', ''),
        }
        if nn['type'] == 'narrative':
            nn['next'] = n.get('next')
            nn['action'] = None
        elif nn['type'] == 'choice':
            nn['choices'] = []
            for c in n.get('choices', []):
                nn['choices'].append({
                    'text': c.get('text', ''),
                    'intent': c.get('intent', ''),
                    'risk': c.get('risk', ''),
                    'goto': c.get('next'),
                    'outcome_hint': c.get('outcome_hint', ''),
                    'action': None,
                })
        elif nn['type'] == 'ending':
            nn['end'] = True
            nn['next'] = None
        out['nodes'][nid] = nn
    return out


# ========== 3. LLM 决策 action（只输出语义描述） ==========

def plan_actions(story: dict, nodes: dict) -> list[dict]:
    """LLM 审查每个连接，决定是否需要游戏动作（battle/move/reward/none）。

    返回 action 计划列表：[{node_id, choice_index?, action:{kind, hint,...}}, ...]
    只输出语义描述（hint），真实 ID 由向量库检索回填。
    """
    llm_temp = TEMP
    # 压缩节点图供 LLM 看
    lines = []
    for nid, n in nodes['nodes'].items():
        if n['type'] == 'choice':
            ch = ' / '.join([f"{i+1}.{c['text']}→{c['goto']}" for i, c in enumerate(n['choices'])])
            lines.append(f"[{nid}] 选择「{n['title']}」: {ch}")
        elif n['type'] == 'ending':
            lines.append(f"[{nid}] 结局「{n['title']}」")
        else:
            lines.append(f"[{nid}] 叙事「{n['title']}」→{n.get('next')}")
    graph_text = '\n'.join(lines)

    system_prompt = "你是游戏事件适配设计师，为网状冒险故事节点决定附加的游戏动作。只输出 JSON，不要其他文字。"

    prompt = f"""下面是一个网状冒险故事的结构，请为每个节点/分支决定是否需要附加**游戏动作**。

【故事标题】{story.get('title', '')}
【节点图】
{graph_text}

【动作类型】
- battle：该连接需要玩家战斗（如遇到凶兽/敌人）。hint 填怪物的语义描述（如"一阶火系魔兽"）
- move：该连接需要玩家移动到另一地图再继续。hint 填目标地图的语义描述（如"魔兽山脉外围的佣兵营地"）
- reward：该连接到达后发放奖励（结局或关键节点）。hint 填奖励语义（如"3000金币，一枚一阶魔核"）
- none：无需动作，直接推进

【规则】
- 大部分连接是 none（叙事推进不需要动作）
- 战斗/移动/奖励动作要自然：剧情确实在那个时刻需要战斗/移动/奖励
- 每个事件总动作数控制在 3-8 个（不要每个连接都挂）
- 只输出语义描述 hint，不要编造具体 ID

输出 JSON 数组（只输出 JSON）：
[
  {{"node_id": "n2", "choice_index": 0, "action": {{"kind": "battle", "hint": "一阶火系魔兽，擅长尾焰喷射"}}}},
  {{"node_id": "n1", "choice_index": null, "action": {{"kind": "move", "hint": "魔兽山脉外围的佣兵营地"}}}}
]
node_id + choice_index 定位一个连接（narrative 用 choice_index=null，choice 用分支序号）。"""

    try:
        content, _ = call_deepseek(
            system_prompt, prompt, temperature=llm_temp, max_tokens=2000,
            call_type='story_adapt', ref_type='story', ref_id=story.get('story_id') or story.get('title', '')[:30],
        )
        text = content.strip()
        m = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
        if m:
            text = m.group(1)
        else:
            start = text.find('[')
            end = text.rfind(']')
            if start != -1 and end != -1:
                text = text[start:end + 1]
        plan = json.loads(text)
        if not isinstance(plan, list):
            return []
        # 过滤非法项
        return [p for p in plan if isinstance(p, dict) and p.get('action', {}).get('kind') in ('battle', 'move', 'reward')]
    except Exception as e:
        print(f'  ⚠ action 决策失败（忽略）: {e}')
        return []


# ========== 4. 向量库检索回填 ==========

def resolve_action(action: dict) -> dict:
    """按 hint 语义检索向量库，回填真实 mob_id / 地图名 / 掉落。"""
    kind = action.get('kind')
    hint = action.get('hint', '')
    out = {'kind': kind}

    try:
        if kind == 'battle':
            r = search(hint, top_k=3, sources=['魔兽图鉴.docx'])
            if r:
                best = r[0]['text']
                mob_id = re.search(r'【ID】(\S+)', best)
                name = re.search(r'【名称】(\S+)', best)
                rank = re.search(r'【品阶】(\S+)', best)
                out['mob_id'] = mob_id.group(1) if mob_id else None
                out['mob_name'] = name.group(1) if name else None
                out['mob_hint'] = rank.group(1) if rank else None
        elif kind == 'move':
            r = search(hint, top_k=3, sources=['基础场景设定.docx'])
            if r:
                text = r[0]['text'].strip()
                # 取第一个含中文的行作为地图名（跳过 markdown 层级号、纯标点行）
                lines = [re.sub(r'^#{1,4}\s*', '', l).strip() for l in text.split('\n') if l.strip()]
                title = next((l for l in lines if re.search(r'[\u4e00-\u9fff]', l)), '')
                out['target_map'] = (title or text[:20])
                out['map_desc'] = text[:100]
        elif kind == 'reward':
            r = search(hint, top_k=3, sources=['材料图鉴.docx', '魔核图鉴.docx'])
            if r:
                item = r[0]['text']
                item_id = re.search(r'【ID】(\S+)', item)
                name = re.search(r'【名称】(\S+)', item)
                out['items'] = [{
                    'item_id': item_id.group(1) if item_id else None,
                    'name': name.group(1) if name else '未知物品',
                    'count': 1,
                }]
                # 尝试从 hint 提取金钱
                money = re.search(r'(\d[\d,]*)金|\b(\d+)\s*金币', hint)
                if money:
                    out['money'] = int((money.group(1) or money.group(2)).replace(',', ''))
    except Exception as e:
        print(f'  ⚠ 检索回填失败（{kind}）: {e}')

    # 保留 hint 便于调试
    out['hint'] = hint
    return out


def apply_actions(nodes: dict, plan: list[dict]) -> dict:
    """把 action 计划挂到节点/分支上"""
    for item in plan:
        nid = item.get('node_id')
        node = nodes['nodes'].get(nid)
        if not node:
            continue
        action = resolve_action(item.get('action', {}))
        ci = item.get('choice_index')
        if ci is None and node['type'] in ('narrative', 'ending'):
            node['action'] = action
        elif isinstance(ci, int) and node['type'] == 'choice' and 0 <= ci < len(node.get('choices', [])):
            node['choices'][ci]['action'] = action
    return nodes


# ========== 5. 入库 ==========

def compute_stats(nodes: dict) -> tuple[int, int]:
    """计算 endings_count 和 max_depth"""
    nm = nodes['nodes']
    endings = sum(1 for n in nm.values() if n.get('end'))
    # max_depth：从 start DFS 到最深 end
    memo = {}
    def dfs(nid, path):
        if nid in memo:
            return memo[nid]
        if nid in path:
            return -1  # 环
        n = nm.get(nid)
        if not n:
            return 0
        if n.get('end'):
            return 0
        nexts = []
        if n['type'] == 'narrative' and n.get('next'):
            nexts = [n['next']]
        elif n['type'] == 'choice':
            nexts = [c['goto'] for c in n.get('choices', []) if c.get('goto')]
        best = 0
        for t in nexts:
            sub = dfs(t, path | {nid})
            if sub >= 0:
                best = max(best, sub + 1)
        memo[nid] = best
        return best
    max_depth = dfs(nodes['start'], frozenset()) if nm else 0
    return endings, max_depth


def save_story_event(story_id: str, title: str, theme: str, nodes: dict,
                     endings: int, max_depth: int) -> int | None:
    """写入 story_event 表（幂等：story_id 唯一）"""
    try:
        conn = pymysql.connect(**_db_config(), connect_timeout=5)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO story_event
                       (story_id, title, theme, nodes, endings_count, max_depth, source, status)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                    (story_id, title[:64], (theme or '')[:32] or None,
                     json.dumps(nodes, ensure_ascii=False),
                     int(endings), int(max_depth), 'agent', 'active'),
                )
                new_id = cur.lastrowid
            conn.commit()
            return new_id
        finally:
            conn.close()
    except pymysql.err.IntegrityError as e:
        if e.args and e.args[0] == 1062:
            print(f'  ⚠ story_id 已存在，跳过: {story_id}')
            return None
        print(f'  ✗ 入库失败（IntegrityError）: {e}')
        return None
    except Exception as e:
        print(f'  ✗ 入库失败: {e}')
        return None


# ========== 主流程 ==========

def adapt_one(story_path: str) -> int | None:
    """适配一个故事并入库，返回 story_event.id"""
    story_id = os.path.splitext(os.path.basename(story_path))[0]
    print(f'\n=== 适配 {story_id} ===')

    story = load_story_json(story_path)
    print(f'  title: {story.get("title", "")}')

    # 2. 结构转换
    nodes = convert_nodes(story)
    print(f'  结构转换: {len(nodes["nodes"])} 节点')

    # 3. LLM 决策 action
    print('  决策 action（LLM）...')
    plan = plan_actions(story, nodes)
    print(f'  计划 {len(plan)} 个动作: ' + ', '.join(f"{p.get('node_id')}:{p.get('action',{}).get('kind')}" for p in plan))

    # 4. 检索回填
    nodes = apply_actions(nodes, plan)

    # 5. 入库
    endings, max_depth = compute_stats(nodes)
    row_id = save_story_event(story_id, story.get('title', ''), story.get('theme'), nodes, endings, max_depth)
    if row_id:
        print(f'  ✓ 已入库 story_event.id={row_id}（{endings}结局，深度{max_depth}）')
    return row_id


def main():
    parser = argparse.ArgumentParser(description='故事 → 游戏事件适配入库')
    parser.add_argument('--story', help='单个 story JSON 路径')
    parser.add_argument('--all', action='store_true', help='处理 output/ 下所有未入库的 story JSON')
    parser.add_argument('--list', action='store_true', help='只列出 output/ 下可用的 story')
    args = parser.parse_args()

    output_dir = os.path.join(WRITER_DIR, 'output')

    if args.list:
        for fn in sorted(os.listdir(output_dir)):
            if fn.startswith('story_') and fn.endswith('.json'):
                print(fn)
        return

    if args.story:
        adapt_one(args.story)
        return

    if args.all:
        # 处理所有 story_*.json，跳过已入库的
        conn = pymysql.connect(**_db_config(), connect_timeout=5)
        try:
            with conn.cursor() as cur:
                cur.execute('SELECT story_id FROM story_event')
                existing = {r[0] for r in cur.fetchall()}
        finally:
            conn.close()
        for fn in sorted(os.listdir(output_dir)):
            if fn.startswith('story_') and fn.endswith('.json'):
                sid = fn[:-5]
                if sid in existing:
                    print(f'  跳过（已入库）: {sid}')
                    continue
                adapt_one(os.path.join(output_dir, fn))
        return

    parser.print_help()


if __name__ == '__main__':
    main()
