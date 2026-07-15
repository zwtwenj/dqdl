"""
地图生成服务：AI 生成子地点 + RAG 检索真实魔兽 + 降级方案。

依赖：llm_client（call_deepseek）+ config（ensure_rag）+ utils（parse_json_response）+ rag_service
"""
import re
import random
import logging
from llm_client import call_deepseek
from config import ensure_rag
from utils import parse_json_response

logger = logging.getLogger('dqdl-agent.map')


def build_prompt(parent_info, rule, count, existing_names):
    """构建生成 prompt"""
    forbidden = ''
    if existing_names:
        forbidden = f'禁止使用以下已有名称：{"、".join(existing_names)}'

    gen_prompt = rule.get('gen_prompt', '')
    if gen_prompt:
        return gen_prompt \
            .replace('{parent_name}', parent_info.get('name', '')) \
            .replace('{parent_description}', parent_info.get('description', parent_info.get('loc_type', ''))) \
            .replace('{count}', str(count)) \
            .replace('{danger_range}', rule.get('danger_range', '1-5')) \
            .replace('{forbidden}', forbidden) \
            .replace('{naming_style}', rule.get('naming_style', '')) \
            .replace('{world_constraints}', rule.get('world_constraints', ''))

    return f'请为"{parent_info.get("name", "")}"生成{count}个子地点。只输出JSON数组。'


def _fetch_real_mobs(parent_info, loc_info, max_count=4):
    """从 RAG 向量库中检索真实魔兽，返回 [{mob_id, name, rank}] 列表
    根据 loc_info.danger_level 过滤等阶：1→一阶, 2→二阶, 3→三阶"""
    try:
        ensure_rag()
        from rag_service import search

        # 危险度 → 品阶前缀
        danger_level = int(loc_info.get('danger_level', 0))
        tier_map = {1: '一阶', 2: '二阶', 3: '三阶'}
        expected_tier = tier_map.get(danger_level, None)

        # 构建query：包含品阶关键词以提高匹配率
        desc = loc_info.get('description', '')
        tags = ', '.join(loc_info.get('tags') or [])
        parent_name = parent_info.get('name', '')
        tier_hint = f'{expected_tier}魔兽' if expected_tier else '魔兽'
        query = f'{tier_hint} {parent_name} {tags} {desc} 栖息'.strip()
        # 大量多取，过滤后可能很少（一阶魔兽在top结果中占比低）
        results = search(query, top_k=max_count * 15)

        mobs = []
        for r in results:
            text = r['text']
            mob_id = None
            mob_name = None
            tier = None
            power_ref = None
            for line in text.split('\n'):
                line = line.strip()
                if line.startswith('【ID】'):
                    mob_id = line.replace('【ID】', '').strip()
                elif line.startswith('【名称】'):
                    mob_name = line.replace('【名称】', '').strip()
                elif line.startswith('【品阶】'):
                    tier = line.replace('【品阶】', '').strip()
                elif line.startswith('【战力参考】'):
                    power_ref = line.replace('【战力参考】', '').strip()
            if mob_id and mob_name:
                # 只接受魔兽ID（WB-xxx格式），过滤魔核/材料等非怪物条目
                if not mob_id.startswith('WB-'):
                    continue
                # 按危险度过滤等阶
                if expected_tier and tier:
                    if not tier.startswith(expected_tier):
                        continue  # 跳过不匹配等阶的魔兽
                entry = {'mob_id': mob_id, 'name': mob_name}
                rank = _build_rank(tier, power_ref)
                if rank:
                    entry['rank'] = rank
                mobs.append(entry)
            if len(mobs) >= max_count:
                break
        return mobs if mobs else None
    except Exception as e:
        logger.error(f'RAG 魔兽检索失败: {e}')
        return None


# 公开别名：供 routes 直接调用（为已有野外节点补填 common_mobs，不重新生成节点）
fetch_real_mobs = _fetch_real_mobs


def _build_rank(tier, power_ref):
    """组合品阶 + 战力编码 → 如 一阶三段 / 二阶三星 / 三阶五星
    战力编码规则: 1-9=斗之气1-9段, 11-19=斗者1-9星, 21-29=斗师1-9星"""
    if not tier:
        return None
    if not power_ref:
        return tier

    # 先尝试按纯数字战力编码解析
    m = re.match(r'(\d+)', str(power_ref))
    if m:
        code = int(m.group(1))
        cn_nums = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
        if 1 <= code <= 9:
            # 斗之气 X段
            return f'{tier}{cn_nums[code]}段'
        elif 11 <= code <= 19:
            # 斗者 X星
            star = code - 10
            return f'{tier}{cn_nums[star]}星'
        elif 21 <= code <= 29:
            # 斗师 X星
            star = code - 20
            return f'{tier}{cn_nums[star]}星'

    # fallback: 兼容旧格式文本
    for label, cn in [('一星', '一星'), ('二星', '二星'), ('三星', '三星'), ('四星', '四星'),
                       ('五星', '五星'), ('六星', '六星'), ('七星', '七星'), ('八星', '八星'),
                       ('九星', '九星'), ('半星', '半星')]:
        if label in power_ref:
            return f'{tier}{cn}'
    for label, cn in [('巅峰', '巅峰'), ('后期', '后期'), ('中期', '中期'), ('初期', '初期')]:
        if label in power_ref:
            return f'{tier}{cn}'
    for label, cn in [('一段', '一段'), ('二段', '二段'), ('三段', '三段'), ('四段', '四段'), ('五段', '五段')]:
        if label in power_ref:
            return f'{tier}{cn}'

    return f'{tier}·{power_ref}'


def _enrich_qi_density(loc_dict, parent_info):
    """为野外地点计算斗气浓郁度: random(1.4,1.5)^danger_level * 100"""
    wild_types = ('wild', 'wild2', 'wild3')
    is_wild = loc_dict.get('loc_type') in wild_types
    is_wild_child = loc_dict.get('loc_type') in ('district', 'scene', 'wild2', 'wild3') and parent_info.get('loc_type') in wild_types
    if (is_wild or is_wild_child) and loc_dict.get('danger_level', 0) > 0:
        base = random.uniform(1.4, 1.5)
        loc_dict['qi_density'] = int(base ** loc_dict['danger_level'] * 100)
    else:
        loc_dict['qi_density'] = 0
    return loc_dict


def generate_locations(parent_info, rule, count, existing_names):
    """生成子地点"""
    system_prompt = (
        '你是斗气大陆的世界观设计师，负责设计地理和地点。'
        '你必须严格遵循斗气大陆（斗破苍穹）的世界观。只输出JSON，不要输出其他内容。'
    )
    user_prompt = build_prompt(parent_info, rule, count, existing_names)

    try:
        content, _ = call_deepseek(system_prompt, user_prompt, call_type='map')
        items = parse_json_response(content)
        results = []
        for item in items:
            # 野外 danger_level：AI倾向生成高值(2/3)，强制均匀随机 1-3
            loc_type_val = str(item.get('loc_type', rule.get('loc_type', 'district')))
            if loc_type_val in ('wild', 'wild2', 'wild3'):
                raw_danger = random.randint(1, 3)
            else:
                raw_danger = 0
            loc = _enrich_qi_density({
                'name': str(item.get('name', '')),
                'loc_type': loc_type_val,
                'description': str(item.get('description', '')),
                'danger_level': raw_danger,
                'available_actions': item.get('available_actions'),
                'tags': item.get('tags'),
                'common_mobs': None,
            }, parent_info)
            # 野外 wild 类型：用 RAG 检索真实魔兽填充 common_mobs
            if loc.get('loc_type') == 'wild':
                loc['common_mobs'] = _fetch_real_mobs(
                    parent_info, loc, max_count=4
                )
            results.append(loc)
        return results
    except Exception as e:
        logger.error(f'AI 生成失败: {e}')
        return [_enrich_qi_density(r, parent_info) for r in fallback_generate(parent_info, count)]


def fallback_generate(parent_info, count):
    """降级方案"""
    depth = parent_info.get('depth', 0)
    pool = (
        ['云岚城', '黑岩城', '赤焰城', '碧水城', '风雷城', '天星城', '落雁城', '紫月城']
        if depth < 3
        else ['坊市', '佣兵公会', '修炼室', '药材商行', '城主府', '修炼场', '密林区', '溪谷', '山腰平台']
    )
    results = []
    for i in range(min(count, len(pool))):
        results.append({
            'name': pool[i],
            'loc_type': 'city' if depth < 3 else 'district',
            'description': f'{pool[i]}是{parent_info.get("name", "")}附近的一处地点',
            'danger_level': random.randint(1, 5),
            'available_actions': ['explore'],
            'tags': ['生成'],
        })
    return results


def ensure_city_districts(results, parent_info):
    """
    后处理：确保城市内部场景包含必选区域
    - 必有：坊市、佣兵公会、修炼室
    - 50%概率：拍卖行
    """
    MANDATORY = [
        {
            'name': '坊市',
            'loc_type': 'district',
            'description': f'{parent_info.get("name", "城")}的坊市，中低端物品交易集散地，各类商贩云集，偶有意外之宝。',
            'danger_level': 1,
            'available_actions': ['buy', 'sell', 'explore'],
            'tags': ['交易', '捡漏'],
        },
        {
            'name': '佣兵公会',
            'loc_type': 'district',
            'description': f'{parent_info.get("name", "")}佣兵公会分部，发布和接取各类任务，佣兵们的聚集之地。',
            'danger_level': 1,
            'available_actions': ['quest', 'rest'],
            'tags': ['任务', '佣兵'],
        },
        {
            'name': '修炼室',
            'loc_type': 'cultivation',
            'description': f'{parent_info.get("name", "")}的修炼室，通过阵法吸纳斗气进行修炼，价格不菲但效率极高。',
            'danger_level': 1,
            'available_actions': ['cultivate', 'rest'],
            'tags': ['修炼'],
        },
    ]
    OPTIONAL = {
        'name': '拍卖行',
        'loc_type': 'district',
        'description': f'{parent_info.get("name", "")}拍卖行，每日定时拍卖珍稀物品，高端交易场所。',
        'danger_level': 1,
        'available_actions': ['buy', 'sell'],
        'tags': ['拍卖', '高端'],
    }

    existing_names = [r['name'] for r in results]

    # 补充必选项
    for item in MANDATORY:
        if item['name'] not in existing_names:
            results.append(item)
            existing_names.append(item['name'])

    # 50% 概率补充拍卖行
    if random.random() < 0.5 and OPTIONAL['name'] not in existing_names:
        results.append(OPTIONAL)
        existing_names.append(OPTIONAL['name'])

    return results


# ========== 网状地图单节点生成（location_net 专用） ==========

# 各 loc_type 的命名风格 + 文案约束（喂给 LLM 的 user prompt 模板）
# 注意：不给具体地名示例——LLM 见到示例会直接抄，导致跨请求高度重复。
# 改为描述"命名规律"，让 LLM 自行组合地形/元素/意象。
_NODE_STYLE = {
    'wild': {
        'naming': '由【地貌】+【修饰/氛围】组合的原创野外地名，地貌可选森林/沼泽/峡谷/荒原/戈壁/草原/雪原/丘陵/湖泊/裂谷/密林/台地 等，修饰可选迷雾/血色/幽暗/落日/寒霜/毒瘴/枯骨/暗影 等，但要避免直接照搬常见组合，尽量独特',
        'desc_hint': '描写此地荒凉/危险的氛围、地形特征',
    },
    'city': {
        'naming': '原创城池名，参考斗破苍穹世界观（诸侯国/势力命名风格），2-4字，避免使用原著已有的加玛城/出云城等',
        'desc_hint': '描写城市的繁华、势力格局或商旅特色',
    },
    'sect': {
        'naming': '原创宗派/势力名，2-4字，体现宗派特色（剑/药/兽/阵/魔/佛等），避免使用原著已有的云岚宗等',
        'desc_hint': '描写宗派的性质（正道/魔道）、所在环境',
    },
    'secret': {
        'naming': '原创秘境/遗迹名，体现远古/神秘/机缘色彩，避免使用原著已有的古帝洞府等',
        'desc_hint': '描写秘境的神秘、危险与机缘',
    },
}


def generate_map_node(loc_type, parent_context=None, existing_names=None):
    """
    为 location_net 生成单个地图节点（不依赖 location_gen_rule 表）。
    入参：
      loc_type        server 已定的类型 wild/city/sect/secret
      parent_context  可选，周边已知地点 [{name, loc_type, direction}]，供 LLM 避免重复/保持连贯
      existing_names  可选，已存在的地名列表
    返回单个节点 dict：{name, loc_type, description, danger_level, qi_density, tags, available_actions, common_mobs}
    失败时返回 fallback。
    """
    loc_type = loc_type or 'wild'
    style = _NODE_STYLE.get(loc_type, _NODE_STYLE['wild'])
    existing_names = existing_names or []
    parent_context = parent_context or []

    system_prompt = (
        '你是斗气大陆的世界观设计师，负责设计地理和地点。'
        '你必须严格遵循斗气大陆（斗破苍穹）的世界观。'
        '只输出一个 JSON 对象，不要输出数组，不要输出其他内容。'
    )

    # 强约束：已存在的名字绝对不能用（放最前面，权重最高）
    forbidden = ''
    if existing_names:
        forbidden = f'【硬性约束】以下名称已被占用，绝对不可重复使用，否则视为失败：{ "、".join(existing_names) }\n'

    nearby = ''
    if parent_context:
        nearby = '周边已知地点：' + '、'.join(
            f'{c.get("name")}（{c.get("loc_type")}，在{c.get("direction","附近")}）'
            for c in parent_context
        ) + '。新地点应与它们地理连贯、风格协调但名字完全不同。\n'

    user_prompt = (
        f'{forbidden}{nearby}'
        f'请在斗气大陆生成一个「{loc_type}」类型的【全新原创】地点，名字必须独特，不得与任何已知地点或常见模板词重复。\n'
        f'命名要求：{style["naming"]}。\n'
        f'描述要求：{style["desc_hint"]}，约30-60字。\n'
        f'危险等级：{loc_type} 类型请给 1-3 之间的值（{ "野外越危险斗气越浓" if loc_type == "wild" else "非野外填0" }）。\n'
        f'输出 JSON 字段：name, description, danger_level, tags(数组,可空), available_actions(数组,可空)。'
    )

    try:
        content, _ = call_deepseek(system_prompt, user_prompt, call_type='map')
        items = parse_json_response(content)
        # LLM 可能返回数组或单对象，统一取第一个
        if isinstance(items, list):
            item = items[0] if items else {}
        else:
            item = items or {}
        loc = {
            'name': str(item.get('name', '')).strip() or _fallback_name(loc_type, existing_names),
            'loc_type': loc_type,
            'description': str(item.get('description', '')).strip() or style['desc_hint'],
            'danger_level': int(item.get('danger_level', 0)) if loc_type == 'wild' else 0,
            'tags': item.get('tags') or ([] if loc_type != 'wild' else ['野外']),
            'available_actions': item.get('available_actions'),
            'common_mobs': None,
        }
        # 野外统一危险度 1-3（防止 LLM 给 0 或 5）
        if loc_type == 'wild':
            loc['danger_level'] = max(1, min(3, loc['danger_level'] or random.randint(1, 3)))
        loc = _enrich_qi_density(loc, {'loc_type': loc_type})
        # 野外用 RAG 检索真实魔兽
        if loc_type == 'wild':
            loc['common_mobs'] = _fetch_real_mobs({'loc_type': loc_type}, loc, max_count=4)
        return loc
    except Exception as e:
        logger.error(f'AI 单节点生成失败: {e}')
        return _fallback_node(loc_type, existing_names)


def _fallback_name(loc_type, existing_names):
    """兜底名称池（避免和已有重名）"""
    pool = {
        'wild': ['迷雾森林', '荒芜戈壁', '幽暗山谷', '毒雾沼泽', '落日草原'],
        'city': ['加玛城', '出云城', '黑岩城', '白石都', '紫晶城'],
        'sect': ['云岚宗', '黑骷盟', '百花谷', '铁血门', '天蛇府'],
        'secret': ['古帝洞府', '天焚神塔', '远古遗迹', '异火秘境'],
    }.get(loc_type, ['迷雾森林'])
    for n in pool:
        if n not in existing_names:
            return n
    return pool[0]


def _fallback_node(loc_type, existing_names):
    """完整兜底节点（含字段）"""
    name = _fallback_name(loc_type, existing_names)
    danger = random.randint(1, 3) if loc_type == 'wild' else 0
    return _enrich_qi_density({
        'name': name,
        'loc_type': loc_type,
        'description': f'{name}是斗气大陆上的一处{loc_type}地点。',
        'danger_level': danger,
        'tags': ['野外'] if loc_type == 'wild' else [],
        'available_actions': None,
        'common_mobs': None,
    }, {'loc_type': loc_type})


# ========== 批量生成（一次 LLM 调用生成多个节点，location_net 主用） ==========

def generate_map_nodes(nodes_request, parent_context=None, existing_names=None):
    """
    批量生成多个地图节点（一次 LLM 调用）。
    在同一 prompt 里让 LLM 一次性产出所有节点，天然保证本批内部不重名（LLM 自洽性）。

    入参：
      nodes_request   [{loc_type, gx, gy}] server 已定的每个空位的类型
      parent_context  周边已知地点 [{name, loc_type, direction}]
      existing_names  已有地名列表
    返回：[{name, loc_type, description, danger_level, qi_density, tags, available_actions, common_mobs, gx, gy}]
    数量与 nodes_request 对齐（不足则用 fallback 补）。
    """
    nodes_request = nodes_request or []
    if not nodes_request:
        return []
    existing_names = existing_names or []
    parent_context = parent_context or []

    # 统计本批类型分布，给 LLM 一目了然的需求清单
    type_counts = {}
    for nr in nodes_request:
        t = nr.get('loc_type', 'wild')
        type_counts[t] = type_counts.get(t, 0) + 1
    demand_desc = '、'.join(f'{c}个{t}' for t, c in type_counts.items())

    system_prompt = (
        '你是斗气大陆的世界观设计师，负责设计地理和地点。'
        '你必须严格遵循斗气大陆（斗破苍穹）的世界观。'
        '只输出一个 JSON 数组，不要输出其他内容。'
    )

    forbidden = ''
    if existing_names:
        forbidden = f'【硬性约束】以下名称已被占用，绝对不可重复：{"、".join(existing_names)}\n'
    nearby = ''
    if parent_context:
        nearby = '周边已知地点：' + '、'.join(
            f'{c.get("name")}（{c.get("loc_type")}，在{c.get("direction","附近")}）'
            for c in parent_context
        ) + '。新地点应与它们地理连贯、风格协调但名字完全不同。\n'

    # 拼每种类型的命名要求
    style_lines = []
    for t in type_counts:
        style = _NODE_STYLE.get(t, _NODE_STYLE['wild'])
        style_lines.append(f'{t}（{style["naming"]}；{style["desc_hint"]}）')
    style_block = '\n'.join(style_lines)

    user_prompt = (
        f'{forbidden}{nearby}'
        f'请在斗气大陆一次性生成以下地点，共 {len(nodes_request)} 个：{demand_desc}。\n'
        f'每个地点的要求：\n{style_block}\n'
        f'所有地点的名字必须【彼此不同】，且不得与上述已占用名称重复，必须原创独特。\n'
        f'危险等级：wild 给 1-3，其它填 0。\n'
        f'输出 JSON 数组，每个元素字段：name, loc_type, description, danger_level, tags(数组,可空), available_actions(数组,可空)。'
    )

    try:
        content, _ = call_deepseek(system_prompt, user_prompt, call_type='map')
        items = parse_json_response(content)
        if not isinstance(items, list):
            items = [items] if items else []

        # 按 loc_type 把 LLM 结果与请求对齐（LLM 顺序可能乱，按类型匹配）
        result = []
        used = set(existing_names)
        # 按 nodes_request 的顺序填：每个空位找 LLM 输出里同类型的、未用过的
        for nr in nodes_request:
            want_type = nr.get('loc_type', 'wild')
            picked = None
            for it in items:
                it_type = str(it.get('loc_type', '')).lower()
                # 兼容 LLM 返回的类型大小写/中英文差异
                type_match = (it_type == want_type) or (it.get('loc_type') == want_type)
                it_name = str(it.get('name', '')).strip()
                if type_match and it_name and it_name not in used:
                    picked = it
                    used.add(it_name)
                    items.remove(it)
                    break
            if picked:
                node = _build_node_from_llm(picked, want_type, existing_names)
            else:
                # LLM 没给到合适的，用 fallback
                node = _fallback_node(want_type, list(used))
                used.add(node['name'])
            node['gx'] = nr['gx']
            node['gy'] = nr['gy']
            result.append(node)
        logger.info(f'批量生成 {len(result)} 个节点: {[r["name"] for r in result]}')
        return result
    except Exception as e:
        logger.error(f'AI 批量生成失败: {e}')
        # 整批 fallback
        used = set(existing_names)
        result = []
        for nr in nodes_request:
            node = _fallback_node(nr.get('loc_type', 'wild'), list(used))
            used.add(node['name'])
            node['gx'] = nr['gx']
            node['gy'] = nr['gy']
            result.append(node)
        return result


def _build_node_from_llm(item, loc_type, existing_names):
    """把 LLM 返回的单个 item 整理成标准 node dict"""
    style = _NODE_STYLE.get(loc_type, _NODE_STYLE['wild'])
    name = str(item.get('name', '')).strip() or _fallback_name(loc_type, existing_names)
    danger = 0
    if loc_type == 'wild':
        try:
            danger = max(1, min(3, int(item.get('danger_level', random.randint(1, 3)))))
        except (ValueError, TypeError):
            danger = random.randint(1, 3)
    loc = _enrich_qi_density({
        'name': name,
        'loc_type': loc_type,
        'description': str(item.get('description', '')).strip() or style['desc_hint'],
        'danger_level': danger,
        'tags': item.get('tags') or (['野外'] if loc_type == 'wild' else []),
        'available_actions': item.get('available_actions'),
        'common_mobs': None,
    }, {'loc_type': loc_type})
    if loc_type == 'wild':
        loc['common_mobs'] = _fetch_real_mobs({'loc_type': loc_type}, loc, max_count=4)
    return loc
