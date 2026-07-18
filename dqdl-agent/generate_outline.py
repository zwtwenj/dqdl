"""
剧本大纲提取（CLI）：从 story（多结局故事）提取「舞台 + 演员」，入库 script_outline。

这是「剧本细化」的第一步——从纯叙事故事提取演出要素（地点类型 + 演员），
尚未涉及分镜。对应「剧本三步走」：
  第1步 story    ：生成多结局故事（generate_story.py）
  第2步 outline  ：提取舞台+演员（本脚本）→ 后续分镜
  第3步 storyboard：分镜/结构化（待做）

提取内容：
  - locations：地点类型（自由描述词，如 山脉/沼泽/遗迹/坊市，忽略具体地名）
  - actors：演员（玩家 is_player=true + 配角，含 性别/职业/性格/描述，忽略名字）

用法：
  cd dqdl-agent
  python generate_outline.py --story-id story_78980     # 按 story_id 提取
  python generate_outline.py --story-id story_78980 --out ../scripts/outline1.json
  python generate_outline.py --story-id story_78980 --no-save   # 只打印不入库
"""
import os
import sys
import json
import argparse

# 离线模式（避免模型加载连 HF）
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'

from llm_client import call_deepseek
from utils import _parse_json_object
from db import get_story, save_script_outline

# 世界观摘要（与 generate_story 一致）
WORLD = '严格遵循斗气大陆（斗破苍穹）世界观：斗气修炼(斗之气→斗帝)、炼药师、魔兽、异火、佣兵、宗门。强者为尊，金币/魔核/丹药是核心资源。'


def normalize_outline(obj, story):
    """校验并清洗 LLM 返回的剧本大纲，并直接分配 id 生成 location_map/actor_map。

    规则：
      - 地点：清洗去重后，按顺序分配 id '{story_id}_loc{N}'，生成 location_map
      - 演员：玩家固定 id='player'；配角按顺序 '{story_id}_actor{N}'
        - 必须恰好 1 个玩家（is_player=true）
        - 至少 1 个配角（否则故事无冲突对象）
      - 演员不保留具体名字（normalize 时丢弃 obj 里可能的 name 字段）

    结构不合法抛 ValueError。返回规整后的 outline dict：
      { story_id, title, location_map:{id:{name}}, actor_map:{id:{gender,role,nature,description}} }
    """
    if not isinstance(obj, dict):
        raise ValueError('大纲非对象')

    story_id = story['story_id']

    # 地点：清洗 + 去重 + 分配 id
    raw_locs = obj.get('locations') or obj.get('location_types') or []
    if not isinstance(raw_locs, list):
        raise ValueError('locations 非数组')
    seen = set()
    location_map = {}
    loc_seq = 0
    for loc in raw_locs:
        # 兼容字符串或 {name:...} 两种形式
        name = loc if isinstance(loc, str) else (
            loc.get('name') or loc.get('type') or '' if isinstance(loc, dict) else ''
        )
        name = str(name).strip()
        if name and name not in seen:
            seen.add(name)
            loc_seq += 1
            location_map[f'{story_id}_loc{loc_seq}'] = {'name': name[:32]}
    if not location_map:
        raise ValueError('locations 为空（至少需要 1 个地点类型）')

    # 演员：清洗 + 分配 id（玩家='player'，配角='{story_id}_actor{N}'）
    raw_actors = obj.get('actors') or obj.get('characters') or []
    if not isinstance(raw_actors, list):
        raise ValueError('actors 非数组')
    actor_map = {}
    player_count = 0
    actor_seq = 0
    for a in raw_actors:
        if not isinstance(a, dict):
            continue
        is_player = bool(a.get('is_player') or a.get('player') or False)
        gender = str(a.get('gender') or '').strip()[:4]
        role = str(a.get('role') or a.get('profession') or '').strip()[:32]
        nature = str(a.get('nature') or a.get('personality') or '').strip()[:32]
        description = str(a.get('description') or a.get('desc') or '').strip()[:255]
        # 至少要有 role 或 description 之一（否则信息不足）
        if not role and not description:
            continue
        info = {'gender': gender, 'role': role, 'nature': nature, 'description': description}
        if is_player:
            player_count += 1
            actor_map['player'] = info
        else:
            actor_seq += 1
            actor_map[f'{story_id}_actor{actor_seq}'] = info

    # 校验玩家唯一性
    if player_count < 1:
        raise ValueError('actors 缺少玩家（is_player=true）')
    if player_count > 1:
        raise ValueError(f'actors 玩家不唯一（{player_count} 个 is_player=true）')
    # 至少 1 个配角（除 player 外至少一个）
    supporting = [k for k in actor_map if k != 'player']
    if not supporting:
        raise ValueError('actors 缺少配角（故事需要冲突对象）')

    return {
        'story_id': story_id,
        'title': story['title'],
        'location_map': location_map,
        'actor_map': actor_map,
    }


def extract_outline(story):
    """单次 LLM 调用，从 story 提取剧本大纲（舞台 + 演员）。返回 normalize 后的 outline dict。"""
    # 把故事所有节点 text 拼成剧情文本（按节点顺序）
    nodes = story.get('nodes') or {}
    node_map = nodes.get('map') or {}
    # 按 start 起的可达顺序拼（粗略：直接按 dict 顺序，文本本身够 LLM 理解）
    plot_parts = []
    for nid, node in node_map.items():
        if isinstance(node, dict):
            text = (node.get('text') or '').strip()
            if text:
                tag = '（结局）' if node.get('end') else ''
                plot_parts.append(f'[{nid}]{tag} {text}')
    plot = '\n'.join(plot_parts)

    sys_prompt = (
        '你是斗气大陆（斗破苍穹）世界观的剧本分析师。'
        '阅读一段多结局故事，提取演出所需的「舞台」与「演员」。'
        '严格遵循斗气大陆世界观。只输出 JSON，不要 markdown、不要多余文字。'
    )
    user_prompt = (
        f'【世界观】{WORLD}\n\n'
        f'【故事标题】{story["title"]}\n'
        f'【故事梗概】{story.get("summary", "")}\n'
        f'【故事主题】{story.get("theme", "")}\n\n'
        f'【故事剧情（各节点）】\n{plot}\n\n'
        '【任务】从上面的故事中提取两类内容：\n\n'
        '1. locations（地点类型）：故事涉及的所有「地图类型」\n'
        '   - 用通用的描述性词，不要具体地名（如「魔兽山脉」→「山脉」，「黑角域」→保留即可若它是地理大区）\n'
        '   - 同一类只留一个（多处「山脉」只算一个「山脉」）\n'
        '   - 例如：山脉、山谷、沼泽、遗迹、石室、坊市、荒野、洞府\n\n'
        '2. actors（演员）：故事中所有出场角色，含玩家和配角\n'
        '   - 玩家标 is_player:true（主角，固定，后续不选角）\n'
        '   - 配角标 is_player:false（后续要从动态NPC池选角）\n'
        '   - gender：性别（男/女）\n'
        '   - role：职业（如 佣兵/散修/炼药师/魔修，参考斗气大陆职业）\n'
        '   - nature：性格（如 阴险/重义/冷酷/豪爽，2-4字）\n'
        '   - description：该角色在故事中的定位（一句话，不写具体名字）\n'
        '   - 【重要】忽略所有角色的具体名字（如「柳岩」「萧炎」），只保留性别/职业/性格/描述\n'
        '   - 玩家的 description 写其身份（如「故事的傅主，一名在斗气大陆冒险的修炼者」）\n\n'
        '【输出格式】严格如下 JSON：\n'
        '{\n'
        '  "locations": [{"name":"山脉"},{"name":"沼泽"}],\n'
        '  "actors": [\n'
        '    {"is_player":true,"gender":"男","role":"斗者","nature":"果决","description":"故事的傅主，在斗气大陆冒险的修炼者"},\n'
        '    {"is_player":false,"gender":"男","role":"佣兵","nature":"阴险","description":"在佣兵大会上暗算过主角的仇人，重伤倒地"}\n'
        '  ]\n'
        '}'
    )
    content, _ = call_deepseek(sys_prompt, user_prompt, temperature=0.3, max_tokens=1200, call_type='event')
    obj = _parse_json_object(content)
    return normalize_outline(obj, story)


def print_outline(outline):
    """友好打印剧本大纲。"""
    print(f'\n{"=" * 60}')
    print(f'🎭 剧本大纲：《{outline["title"]}》（story_id={outline["story_id"]}）')
    lm = outline['location_map']
    am = outline['actor_map']
    print(f'\n📍 舞台（{len(lm)} 个地点类型，已分配 id）：')
    for lid, info in lm.items():
        print(f'   {lid}: {info["name"]}')
    print(f'\n🎬 演员（{len(am)} 人，已分配 id）：')
    for aid, info in am.items():
        tag = '🎮玩家' if aid == 'player' else '👤配角'
        print(f'   {tag} {aid}: {info["gender"] or "?"}｜{info["role"] or "?"}｜{info["nature"] or "?"}')
        print(f'         {info["description"]}')
    print('=' * 60)


def main():
    ap = argparse.ArgumentParser(description='从故事提取剧本大纲（舞台+演员）')
    ap.add_argument('--story-id', required=True, help='story.story_id（如 story_78980）')
    ap.add_argument('--out', default=None, help='输出 JSON 文件路径')
    ap.add_argument('--no-save', action='store_true', help='只打印不入库')
    args = ap.parse_args()

    print(f'=== 剧本大纲提取（story_id={args.story_id}）===')

    # 1. 读故事
    story = get_story(args.story_id)
    if not story:
        print(f'\n✗ 未找到 story_id={args.story_id}（请确认 story 表有此记录）')
        sys.exit(1)
    print(f'    故事：《{story["title"]}》 节点 {len(story["nodes"].get("map", {}))} 个')

    # 2. 提取（带重试，LLM 偶尔不按结构返回）
    outline = None
    last_err = None
    for attempt in range(1, 4):
        print(f'\n>>> 第 {attempt} 次提取...' + ('' if attempt == 1 else f'（上次失败：{last_err}）'))
        try:
            outline = extract_outline(story)
            break
        except Exception as e:
            last_err = e
            print(f'    ✗ 失败：{e}')

    if not outline:
        print(f'\n✗ 3 次提取均失败，最后错误：{last_err}')
        sys.exit(1)

    print_outline(outline)

    # 3. 入库
    if not args.no_save:
        print('\n>>> 入库 script_outline 表...')
        oid = save_script_outline(outline, source='agent')
        if oid:
            print(f'✅ 已入库 script_outline#{oid}（story_id={outline["story_id"]}）')
        else:
            print('⚠️ 入库失败或该 story_id 的剧本大纲已存在（见日志）')

    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump(outline, f, ensure_ascii=False, indent=2)
        print(f'✅ 已写入文件：{args.out}')

    if not args.out:
        print('\n--- 原始 JSON ---')
        print(json.dumps(outline, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
