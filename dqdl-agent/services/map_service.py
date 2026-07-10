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
