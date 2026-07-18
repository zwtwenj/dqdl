"""
剧本细化（CLI）：把 story 的纯叙事节点细化为「带角色对白 + 地点」的分镜剧本，
回写到 script_outline 表（status: pending → done）。

这是「剧本三步走」第2步的核心：
  第1步 story    ：生成多结局故事（generate_story.py）
  第2a步 outline ：提取舞台+演员（generate_outline.py）
  第2b步 storyboard：节点细化（本脚本）→ 给每个节点分配地点、拆 lines、加角色对白
  第3步          ：结构化处理（待做）

细化前后对比：
  story 节点：{text:"一段叙事...", choices:[...], end?}        ← 纯旁白一段
  分镜节点  ：{location:"loc_id", lines:[{role,text}...], choices?, end?}  ← 多行对白

id 分配规则：
  - 地点：{story_id}_loc{N}，按 outline.locations 顺序（loc1/loc2...）
  - 演员：玩家='player'；配角='{story_id}_actor{N}'（actor1/actor2...）
  - lines.role 取自：'narration'（旁白）/ 'player' / '{story_id}_actor{N}'
  - node.location 取自：'{story_id}_loc{N}'

用法：
  cd dqdl-agent
  python generate_storyboard.py --story-id story_78980
  python generate_storyboard.py --story-id story_78980 --out ../scripts/sb1.json
  python generate_storyboard.py --story-id story_78980 --no-save
"""
import os
import sys
import json
import argparse

os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'

from llm_client import call_deepseek
from utils import _parse_json_object
from db import get_story, get_outline, save_storyboard

WORLD = '严格遵循斗气大陆（斗破苍穹）世界观：斗气修炼(斗之气→斗帝)、炼药师、魔兽、异火、佣兵、宗门。强者为尊，金币/魔核/丹药是核心资源。'


def normalize_storyboard(obj, story, location_map, actor_map):
    """校验并清洗 LLM 返回的分镜节点图。

    规则：
      - 必须是 {start, map:{}}，start 在 map 内
      - 每个节点必须有 location（必须是 location_map 的合法 key）
      - lines：数组，每行 {role, text}，role 必须是 'narration'/'player' 或 actor_map 的 key
      - choices/end：沿用 story 原结构（goto 必须指向存在的节点）
      - 节点集合必须和 story 的节点集合一致（不增不减，保证分支结构不变）

    结构不合法抛 ValueError。返回规整后的 {start, map}。
    """
    if not isinstance(obj, dict):
        raise ValueError('分镜非对象')
    nodes = obj.get('nodes') or obj
    if not isinstance(nodes, dict) or not isinstance(nodes.get('map'), dict):
        raise ValueError('nodes.map 缺失')
    start = nodes.get('start') or obj.get('start') or story['nodes'].get('start')
    raw_map = nodes['map']

    story_map = story['nodes']['map']
    valid_loc_ids = set(location_map.keys())
    valid_roles = {'narration', 'player'} | set(actor_map.keys())

    # 节点集合应与 story 一致（允许 LLM 漏写时按 story 原结构兜底）
    cleaned = {}
    for nid, snode in story_map.items():
        sb_node = raw_map.get(nid)
        if not isinstance(sb_node, dict):
            raise ValueError(f'节点 {nid} 在分镜结果中缺失')

        new_node = {}
        # location：必须是合法 loc id
        loc = str(sb_node.get('location') or '').strip()
        if loc not in valid_loc_ids:
            raise ValueError(f'节点 {nid} 的 location 非法: {loc!r}（不在 location_map）')
        new_node['location'] = loc

        # lines：清洗 + role 合法性
        raw_lines = sb_node.get('lines') or []
        if not isinstance(raw_lines, list) or not raw_lines:
            raise ValueError(f'节点 {nid} 的 lines 为空')
        lines = []
        for ln in raw_lines:
            if not isinstance(ln, dict):
                continue
            role = str(ln.get('role') or '').strip()
            text = str(ln.get('text') or '').strip()
            if role not in valid_roles:
                raise ValueError(f'节点 {nid} 的 line role 非法: {role!r}（合法: {sorted(valid_roles)}）')
            if not text:
                continue
            lines.append({'role': role, 'text': text[:600]})
        if not lines:
            raise ValueError(f'节点 {nid} 清洗后 lines 为空')
        new_node['lines'] = lines

        # actors：从 lines.role 推导该节点出场的演员（排除 narration）
        # 自动生成而非让 LLM 再写，避免与 lines 不一致。
        # 例：['player', 'story_78980_actor1']
        actors_seen = []
        for ln in lines:
            r = ln['role']
            if r != 'narration' and r not in actors_seen:
                actors_seen.append(r)
        new_node['actors'] = actors_seen

        # choices：沿用 story 原结构（goto 校验指向 story_map 内的节点）
        if snode.get('end'):
            new_node['end'] = True
        else:
            choices = snode.get('choices') or []
            valid_choices = []
            for c in choices:
                goto = str(c.get('goto', '')).strip()
                if goto and goto in story_map:
                    valid_choices.append({'text': str(c.get('text', ''))[:80], 'goto': goto})
            if not valid_choices:
                raise ValueError(f'节点 {nid} 的 choices 清洗后为空（goto 不指向存在节点）')
            new_node['choices'] = valid_choices

        cleaned[nid] = new_node

    if start not in cleaned:
        raise ValueError(f'start 节点 {start} 不在分镜结果中')

    return {'start': start, 'map': cleaned}


def refine_storyboard(story, location_map, actor_map):
    """单次 LLM 调用：把 story 节点细化为分镜剧本。返回 normalize 后的 {start, map}。"""
    story_id = story['story_id']
    story_map = story['nodes']['map']

    # 拼接原故事节点（供 LLM 参考，按 id 顺序）
    plot_parts = []
    for nid, node in story_map.items():
        text = (node.get('text') or '').strip()
        tag = '（结局）' if node.get('end') else ''
        choices_str = ''
        if not node.get('end'):
            cs = [f"{c['text']}→{c['goto']}" for c in (node.get('choices') or [])]
            choices_str = ' 选项: ' + ' | '.join(cs) if cs else ''
        plot_parts.append(f'[{nid}]{tag} {text}{choices_str}')
    plot = '\n'.join(plot_parts)

    # actor_map / location_map 友好展示
    loc_desc = '\n'.join(f'  {lid}: {info["name"]}' for lid, info in location_map.items())
    actor_desc = '\n'.join(
        f'  {aid}: {info.get("gender","")}/{info.get("role","")}/{info.get("nature","")} - {info.get("description","")}'
        for aid, info in actor_map.items()
    )

    sys_prompt = (
        '你是斗气大陆（斗破苍穹）世界观的剧本导演。'
        '把一段纯叙事的多结局故事，细化为「带角色对白 + 地点标注」的分镜剧本。'
        '严格遵循斗气大陆世界观。只输出 JSON，不要 markdown、不要多余文字。'
    )
    user_prompt = (
        f'【世界观】{WORLD}\n\n'
        f'【故事标题】{story["title"]}\n'
        f'【故事梗概】{story.get("summary", "")}\n\n'
        f'【原故事节点（纯叙事，待细化）】\n{plot}\n\n'
        f'【可用地点 id → 名称】\n{loc_desc}\n\n'
        f'【可用演员 id → 信息】\n{actor_desc}\n\n'
        '【细化要求】\n'
        '1. 每个节点细化成 lines 数组（角色对白），把原 text 的叙事拆解并丰富：\n'
        '   - narration（旁白）：环境描写、动作、心理（第三人称叙事，承接原 text 内容）\n'
        '   - player：玩家主角说的话（第一人称，根据剧情合理添加）\n'
        '   - 配角 id（如 ' + story_id + '_actor1）：该配角的对白（根据其性格 nature 组织语言）\n'
        '   - 一个节点可以有多行 narration / 多轮对话，自然展开\n'
        '2. 【重要·匿名化】所有对白和旁白中不得出现任何角色的具体名字（如"柳岩""萧炎"），\n'
        '   一律用身份代称："你"(玩家)、"仇人/前辈/那人"(配角)等。剧本是匿名模板，名字后续由选角填充。\n'
        '3. 每个节点必须标注 location（从上面的地点 id 里选一个最贴合该场景的）\n'
        '4. 节点的 choices 和 end 结构原样保留（goto 不要改）\n'
        '5. 节点 id 集合不变（a1/b1/c1... 全部保留，不增不减）\n'
        '6. 台词用第二人称"你"或符合斗气大陆口吻的对白\n'
        '7. 【actors 自动推导】无需手写——后端会从 lines.role 自动提取该节点出场演员列表。\n\n'
        '【输出格式】严格如下 JSON：\n'
        '{\n'
        f'  "start": "{story["nodes"]["start"]}",\n'
        '  "nodes": {\n'
        '    "start": "...",\n'
        '    "map": {\n'
        f'      "a1": {{"location":"{story_id}_loc1","lines":[{{"role":"narration","text":"..."}},{{"role":"player","text":"..."}},{{"role":"' + story_id + '_actor1","text":"..."}}],"choices":[{{"text":"救助","goto":"b1"}}]}},\n'
        '      "b1": {"location":"...","lines":[...],"choices":[...]},\n'
        '      "b2": {"location":"...","lines":[...],"end":true}\n'
        '    }\n'
        '  }\n'
        '}'
    )
    content, _ = call_deepseek(sys_prompt, user_prompt, temperature=0.6, max_tokens=4000, call_type='event')
    obj = _parse_json_object(content)
    return normalize_storyboard(obj, story, location_map, actor_map)


def print_storyboard(title, location_map, actor_map, nodes):
    """友好打印分镜剧本。"""
    print(f'\n{"=" * 70}')
    print(f'🎬 分镜剧本：《{title}》')
    print(f'\n📍 地点（{len(location_map)}）：')
    for lid, info in location_map.items():
        print(f'   {lid}: {info["name"]}')
    print(f'\n🎭 演员（{len(actor_map)}）：')
    for aid, info in actor_map.items():
        print(f'   {aid}: {info.get("gender","")}/{info.get("role","")}/{info.get("nature","")}')
    print(f'\n🎬 节点（{len(nodes["map"])} 个，入口 {nodes["start"]}）：')
    for nid, node in nodes['map'].items():
        loc_name = location_map.get(node['location'], {}).get('name', '?')
        tag = ' 🏁结局' if node.get('end') else ''
        actors_str = ','.join(node.get('actors', []))
        print(f'\n[{nid}] @ {loc_name}({node["location"]}){tag} 👥{actors_str}')
        for ln in node['lines']:
            prefix = {'narration': '   📜', 'player': '   🗡️玩家'}.get(ln['role'], f'   💬{ln["role"]}')
            print(f'{prefix}: {ln["text"][:70]}')
        for c in node.get('choices') or []:
            print(f'   ▸ {c["text"]} → {c["goto"]}')
    print('=' * 70)


def main():
    ap = argparse.ArgumentParser(description='细化故事为分镜剧本（节点→lines+地点）')
    ap.add_argument('--story-id', required=True, help='story.story_id（须已生成 outline）')
    ap.add_argument('--out', default=None, help='输出 JSON 文件路径')
    ap.add_argument('--no-save', action='store_true', help='只打印不入库')
    args = ap.parse_args()

    story_id = args.story_id
    print(f'=== 分镜细化（story_id={story_id}）===')

    # 1. 读 story + outline
    story = get_story(story_id)
    if not story:
        print(f'\n✗ 未找到 story_id={story_id}'); sys.exit(1)
    outline = get_outline(story_id)
    if not outline:
        print(f'\n✗ 未找到该故事的 outline（请先运行 generate_outline.py）'); sys.exit(1)
    # outline 阶段已分配 id（location_map/actor_map），这里直接取用
    location_map = outline.get('location_map') or {}
    actor_map = outline.get('actor_map') or {}
    if not location_map or not actor_map:
        print(f'\n✗ outline 缺少 location_map/actor_map（请重跑 generate_outline.py）'); sys.exit(1)
    print(f'    故事：《{story["title"]}》 节点 {len(story["nodes"]["map"])} 个')
    print(f'    outline：地点 {len(location_map)} 个，演员 {len(actor_map)} 人（已分配 id）')
    print(f'\n>>> 从 outline 读取已分配的 id：')
    for lid, info in location_map.items():
        print(f'    {lid} → {info.get("name","")}')
    for aid, info in actor_map.items():
        print(f'    {aid} → {info.get("role","")}/{info.get("nature","")}')

    # 2. LLM 细化（带重试）
    nodes = None
    last_err = None
    for attempt in range(1, 4):
        print(f'\n>>> 第 {attempt} 次细化...' + ('' if attempt == 1 else f'（上次失败：{last_err}）'))
        try:
            nodes = refine_storyboard(story, location_map, actor_map)
            break
        except Exception as e:
            last_err = e
            print(f'    ✗ 失败：{e}')

    if not nodes:
        print(f'\n✗ 3 次细化均失败，最后错误：{last_err}'); sys.exit(1)

    print_storyboard(story['title'], location_map, actor_map, nodes)

    # 4. 入库
    if not args.no_save:
        print('\n>>> 回写 script_outline（status → done）...')
        ok = save_storyboard(story_id, location_map, actor_map, nodes)
        if ok:
            print(f'✅ 已回写 script_outline（story_id={story_id}）')
        else:
            print('⚠️ 回写失败（见日志）')

    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump({'location_map': location_map, 'actor_map': actor_map, 'nodes': nodes},
                      f, ensure_ascii=False, indent=2)
        print(f'✅ 已写入文件：{args.out}')

    if not args.out:
        print('\n--- 原始 JSON ---')
        print(json.dumps({'location_map': location_map, 'actor_map': actor_map, 'nodes': nodes},
                         ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
