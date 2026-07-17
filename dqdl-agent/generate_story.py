"""
多结局故事生成（CLI）：调 DeepSeek 生成一个纯叙事分支故事，打印 + 入库 story 表。

与 generate_script.py 的区别：
  - generate_script 生成「场景事件」（带 effects/触发条件/战斗节点等游戏机制）
  - 本脚本生成「纯故事」（只有剧情文本 + 玩家选择 + 结局，无任何机制）
  - 这是「剧本三步走」的第1步：生成多结局故事 → (第2步)剧本细化/分镜/演员 → (第3步)结构化

故事结构（节点图）：
  { title, summary, theme, start, nodes:{ start, map:{id:{text,choices:[{text,goto}],end?}} } }
  - 节点 text：剧情叙述（第二人称"你"）
  - choices：玩家可选动作，goto 跳到下一节点
  - end：true 表示结局节点（无 choices）
  - 不同分支链路长度可不同（A链路4步、B链路2步都行），Agent 自行决定结束节点

用法：
  cd dqdl-agent
  python generate_story.py                       # 随机主题生成
  python generate_story.py --theme 复仇          # 指定主题
  python generate_story.py --out ../scripts/story1.json
  python generate_story.py --no-save             # 只打印不入库
"""
import os
import sys
import json
import random
import argparse

# 离线模式（避免模型加载连 HF）
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'

from llm_client import call_deepseek
from utils import _parse_json_object
from db import save_story

# 世界观摘要（与 generate_lore 一致）
WORLD = '严格遵循斗气大陆（斗破苍穹）世界观：斗气修炼(斗之气→斗帝)、炼药师、魔兽、异火、佣兵、宗门。强者为尊，金币/魔核/丹药是核心资源。台词用第二人称"你"。'

# 随机主题池（不传 --theme 时从中随机选一个，给 Agent 一个锚点）
THEME_POOL = ['奇遇', '冲突', '抉择', '探索', '复仇', '恩怨', '寻宝', '邂逅', '背叛', '救赎']


def normalize_story(obj):
    """校验并清洗 LLM 返回的故事结构。

    对 LLM 返回结构做容错适配（LLM 经常不严格按 {start,map} 返回）：
      - 优先识别 nodes.map 嵌套结构
      - 若 nodes 直接平铺节点（无 map 键），把 nodes 视为 map，按 start 字段或第一个节点为入口
      - 若连 start 都没给，尝试找一个「无其他节点 goto 指向它」的节点作为入口（根节点）

    规则：
      - 必须有 title / 至少 2 个节点
      - 每个节点保留 text / choices / end，清洗非法字段
      - choices 的 goto 必须指向存在的节点（否则丢弃该选项）
      - 至少要有 1 个 end 节点
      - end 节点不应有 choices（有也丢弃）

    结构不合法抛 ValueError。返回规整后的 story dict（含 story_id/title/summary/theme/nodes）。
    """
    if not isinstance(obj, dict):
        raise ValueError('故事非对象')
    title = str(obj.get('title', '')).strip()
    if not title:
        raise ValueError('title 缺失')
    title = title[:64]

    summary = str(obj.get('summary', '')).strip()[:255]
    theme = str(obj.get('theme', '')).strip()[:32] or None

    nodes_raw = obj.get('nodes')
    if not isinstance(nodes_raw, dict):
        raise ValueError('nodes 缺失或非对象')

    # 容错1：识别 {start, map:{...}} 标准结构
    if isinstance(nodes_raw.get('map'), dict):
        node_map = nodes_raw['map']
        start = nodes_raw.get('start')
    else:
        # 容错2：nodes 直接平铺节点（LLM 没套 map 层）——把整个 nodes 当 map
        # 过滤掉非节点字段（start 等元字段），剩下的视为节点
        node_map = {k: v for k, v in nodes_raw.items()
                    if isinstance(v, dict) and k not in ('start', 'map')}
        start = nodes_raw.get('start') or obj.get('start')

    if not node_map:
        raise ValueError('nodes 内无有效节点')

    # 容错3：start 未指定或不在 map 内 → 找根节点（无其他节点 goto 指向它）
    if not start or start not in node_map:
        targets = set()
        for n in node_map.values():
            if isinstance(n, dict):
                for c in n.get('choices') or []:
                    if isinstance(c, dict) and c.get('goto'):
                        targets.add(str(c['goto']))
        roots = [nid for nid in node_map if nid not in targets]
        if not roots:
            raise ValueError('无法识别入口节点（可能存在环或全部被指向）')
        start = roots[0]

    # 清洗每个节点：统一字段名为 text/choices/end
    cleaned = {}
    for nid, node in node_map.items():
        if not isinstance(node, dict):
            continue
        new_node = {}
        # text：剧情文本（兼容 LLM 可能用 'npc'/'content' 字段）
        text = node.get('text') or node.get('npc') or node.get('content') or ''
        if isinstance(text, str):
            new_node['text'] = text[:600]
        # end：结局标记（兼容 'is_end'/'ending'）
        is_end = node.get('end') or node.get('is_end') or node.get('ending') or False
        if is_end:
            new_node['end'] = True
        # choices：清洗 + goto 合法性校验（end 节点不要 choices）
        choices_raw = node.get('choices') or node.get('options') or []
        if isinstance(choices_raw, list) and not new_node.get('end'):
            valid = []
            for c in choices_raw:
                if not isinstance(c, dict):
                    continue
                goto = str(c.get('goto') or c.get('next') or c.get('target') or '').strip()
                if goto and goto in node_map:
                    valid.append({
                        'text': str(c.get('text') or c.get('label') or '')[:80],
                        'goto': goto,
                    })
            if valid:
                new_node['choices'] = valid
        cleaned[nid] = new_node

    # 至少要有 1 个 end 节点
    end_count = sum(1 for n in cleaned.values() if n.get('end'))
    if end_count < 1:
        raise ValueError(f'无 end 节点（结局数 {end_count}）')

    return {
        'story_id': f'story_{random.randint(10000, 99999)}',
        'title': title,
        'summary': summary,
        'theme': theme,
        'nodes': {'start': start, 'map': cleaned},
    }


def gen_story(theme=None):
    """单次 LLM 调用生成多结局分支故事。返回 normalize 后的 story dict。"""
    sys_prompt = (
        '你是斗气大陆（斗破苍穹）世界观的故事作者。生成一个多结局的分支叙事故事。'
        '严格遵循斗气大陆世界观（斗气、魔兽、佣兵、丹药、宗门），不要出现现实事物。'
        '只输出 JSON，不要输出任何其他内容、不要 markdown 代码块。'
    )
    theme_line = f'【主题】{theme}\n（围绕此主题展开故事）\n\n' if theme else '【主题】自由发挥，从奇遇/冲突/抉择/探索/复仇/寻宝等中自选一个贴合的主题。\n\n'
    user_prompt = (
        f'【世界观】{WORLD}\n\n'
        f'{theme_line}'
        '【故事要求】\n'
        '- 玩家是主角，用第二人称"你"叙述（如"你在魔兽山脉遭遇..."）\n'
        '- 故事是一个有分支的节点图：玩家在每一步面临 2-3 个选择，不同选择走向不同剧情\n'
        '- 最长链路 3-4 步（从开始走到某个结局），但不同分支可以不同长度'
        '（例如 A 分支 a1→b1→c1→d1 结束，B 分支 a1→b2 就结束，都允许）\n'
        '- 你自己决定每个分支在哪结束（标记 end:true），不强制所有链路等长\n'
        '- 至少 2 个不同的结局（即至少 2 个 end 节点）\n'
        '- 节点 text 是剧情叙述（50-150字），有画面感和世界观质感\n'
        '- choices 的 text 是玩家可选动作（简短，如"救助""离开""深入"）\n'
        '- 结局节点(end:true)不要再有 choices\n\n'
        '【输出格式】严格如下 JSON（节点 id 用简短英文如 a1/b1/c1）:\n'
        '{\n'
        '  "title": "故事标题(6-14字)",\n'
        '  "summary": "一句话梗概",\n'
        '  "theme": "主题词",\n'
        '  "start": "a1",\n'
        '  "nodes": {\n'
        '    "start": "a1",\n'
        '    "map": {\n'
        '      "a1": {"text":"剧情叙述...","choices":[{"text":"救助","goto":"b1"},{"text":"离开","goto":"b2"}]},\n'
        '      "b1": {"text":"...","choices":[{"text":"跟上去","goto":"c1"}]},\n'
        '      "b2": {"text":"...","end":true},\n'
        '      "c1": {"text":"...","choices":[{"text":"探索","goto":"d1"}]},\n'
        '      "d1": {"text":"...","end":true}\n'
        '    }\n'
        '  }\n'
        '}'
    )
    content, _ = call_deepseek(sys_prompt, user_prompt, temperature=0.95, max_tokens=3000, call_type='event')
    obj = _parse_json_object(content)
    return normalize_story(obj)


def print_story(story):
    """友好打印故事结构。"""
    nodes = story['nodes']
    node_map = nodes['map']
    endings = sum(1 for n in node_map.values() if n.get('end'))
    print(f'\n{"=" * 60}')
    print(f'📖 《{story["title"]}》')
    print(f'   主题：{story.get("theme", "?")} ｜ 梗概：{story.get("summary", "")}')
    print(f'   节点：{len(node_map)} 个 ｜ 入口：{nodes["start"]} ｜ 结局：{endings} 个')
    print('-' * 60)
    for nid, node in node_map.items():
        tag = '🏁结局' if node.get('end') else ''
        print(f'[{nid}] {tag}')
        text = (node.get('text') or '').replace('\n', ' ')
        if text:
            print(f'    {text[:90]}')
        for c in node.get('choices') or []:
            print(f'    ▸ {c["text"]}  →  {c["goto"]}')
    print('=' * 60)


def main():
    ap = argparse.ArgumentParser(description='生成多结局分支故事')
    ap.add_argument('--theme', default=None, help='故事主题（不传则随机）')
    ap.add_argument('--out', default=None, help='输出 JSON 文件路径')
    ap.add_argument('--no-save', action='store_true', help='只打印不入库')
    args = ap.parse_args()

    theme = args.theme or random.choice(THEME_POOL)
    print(f'=== 故事生成（主题：{theme}）===')

    # 生成（带重试：LLM 偶尔不按结构返回或截断，最多重试 3 次）
    story = None
    last_err = None
    for attempt in range(1, 4):
        print(f'\n>>> 第 {attempt} 次生成...' + ('' if attempt == 1 else f'（上次失败：{last_err}）'))
        try:
            story = gen_story(theme)
            break
        except Exception as e:
            last_err = e
            print(f'    ✗ 失败：{e}')

    if not story:
        print(f'\n✗ 3 次生成均失败，最后错误：{last_err}')
        sys.exit(1)

    print_story(story)

    if not args.no_save:
        print('\n>>> 入库 story 表...')
        sid = save_story(story, source='agent')
        if sid:
            print(f'✅ 已入库 story#{sid}（story_id={story["story_id"]}）')
        else:
            print('⚠️ 入库失败或 story_id 已存在（见日志）')

    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump(story, f, ensure_ascii=False, indent=2)
        print(f'✅ 已写入文件：{args.out}')

    if not args.out:
        print('\n--- 原始 JSON ---')
        print(json.dumps(story, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
