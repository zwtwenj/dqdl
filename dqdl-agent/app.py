"""
dqdl-agent: AI 生成服务
- POST /generate/map      地图子节点生成
- POST /rag/search        RAG 语义检索
- POST /generate/dialog   NPC 对话生成
- POST /generate/training 历练叙事生成
- POST /generate/dungeon  箱庭副本五幕蓝图生成
- GET  /health            健康检查
"""
import os
import re
import json
import random
from flask import Flask, request, jsonify
from openai import OpenAI
from dotenv import load_dotenv

# ── 加载配置 ──
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# 强制 HuggingFace 离线模式，避免模型加载时连接超时
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'

AGENT_PORT = int(os.getenv('AGENT_PORT', '5000'))
AGENT_HOST = os.getenv('AGENT_HOST', '0.0.0.0')

DEEPSEEK_API_KEY = os.getenv('apikey') or os.getenv('DEEPSEEK_API_KEY', '')
DEEPSEEK_BASE_URL = os.getenv('base_url') or os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')

app = Flask(__name__)
ai_client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)

# ── 懒加载 RAG ──
_rag_loaded = False

def ensure_rag():
    global _rag_loaded
    if not _rag_loaded:
        from rag_service import load_index
        load_index()
        _rag_loaded = True


# ============================================================
#  地图生成
# ============================================================

def call_deepseek(system_prompt, user_prompt, temperature=0.85, max_tokens=4000):
    """调用 DeepSeek API"""
    r = ai_client.chat.completions.create(
        model='deepseek-chat',
        messages=[
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return r.choices[0].message.content


def parse_json_response(content):
    """从 AI 回复中提取 JSON 数组"""
    json_str = content
    # markdown code block
    m = re.search(r'```(?:json)?\s*([\s\S]*?)```', content)
    if m:
        json_str = m.group(1).strip()
    # 找 JSON 数组
    m = re.search(r'\[[\s\S]*\]', json_str)
    if m:
        json_str = m.group(0)
    parsed = json.loads(json_str)
    if not isinstance(parsed, list):
        raise ValueError('Expected JSON array')
    return parsed


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
        app.logger.error(f'RAG 魔兽检索失败: {e}')
        return None


def _build_rank(tier, power_ref):
    """组合品阶 + 战力编码 → 如 一阶三段 / 二阶三星 / 三阶五星
    战力编码规则: 1-9=斗之气1-9段, 11-19=斗者1-9星, 21-29=斗师1-9星"""
    if not tier:
        return None
    if not power_ref:
        return tier

    # 先尝试按纯数字战力编码解析
    import re
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
        content = call_deepseek(system_prompt, user_prompt)
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
        app.logger.error(f'AI 生成失败: {e}')
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

# ============================================================
#  API 路由
# ============================================================

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'dqdl-agent'})


@app.route('/generate/map', methods=['POST'])
def generate_map():
    """
    生成地图子节点
    Body: {
        parent: { id, name, loc_type, description, depth, ... },
        rule: { depth, loc_type, gen_prompt, naming_style, danger_range, ... },
        count: number,
        existingNames: string[],
        seed: string|null
    }
    """
    data = request.get_json(force=True)
    parent_info = data.get('parent', {})
    rule = data.get('rule', {})
    count = data.get('count', 3)
    existing_names = data.get('existingNames', [])
    seed = data.get('seed')

    app.logger.info(f'生成请求: parent={parent_info.get("name")}, count={count}, seed={seed}')

    # 生成
    results = generate_locations(parent_info, rule, count, existing_names)

    # 后处理：城市内部的子节点必须有坊市、佣兵公会，50%概率有拍卖行
    if parent_info.get('loc_type') == 'city' and rule.get('depth') == 4:
        results = ensure_city_districts(results, parent_info)

    # 为每个结果分配 seed
    for i, r in enumerate(results):
        if seed:
            r['seed'] = f'{seed}-{i}'
        else:
            r['seed'] = str(random.randint(0, 10000))

    return jsonify(results)


@app.route('/rag/search', methods=['POST'])
def rag_search():
    """
    RAG 语义检索
    Body: { query: string, top_k?: number, max_chars?: number }
    """
    ensure_rag()
    from rag_service import search, get_context

    data = request.get_json(force=True)
    query = data.get('query', '')
    top_k = data.get('top_k', 5)
    max_chars = data.get('max_chars', 3000)

    results = search(query, top_k=top_k)
    context = get_context(query, top_k=top_k, max_chars=max_chars)

    return jsonify({
        'results': results,
        'context': context,
    })


# ============================================================
#  NPC 对话生成
# ============================================================

@app.route('/generate/dialog', methods=['POST'])
def generate_dialog():
    """
    生成 NPC 对话
    Body: {
        npc: { name, nature_name, nature_hint, role_name, role_hint },
        location: { name, loc_type, description, tags },
        player_input: string (玩家说的话),
        history: string[] (之前的对话历史)
    }
    """
    data = request.get_json(force=True)
    npc = data.get('npc', {})
    location = data.get('location', {})
    player_input = data.get('player_input', '')
    history = data.get('history', [])

    system_prompt = f"""你是斗气大陆（斗破苍穹）世界观中的NPC，正在与玩家对话。

【你的身份】
- 名字: {npc.get('name', '未知')}
- 性格: {npc.get('nature_name', '普通')} — {npc.get('nature_hint', '正常说话')}
- 职能: {npc.get('role_name', '普通人')} — {npc.get('role_hint', '正常交流')}

【你的位置】
- 地点: {location.get('name', '未知地点')}
- 类型: {location.get('loc_type', '')}
- 描述: {location.get('description', '')}
- 标签: {', '.join(location.get('tags', []))}

【严格约束】
- 必须严格体现你的性格特征
- 必须符合你的职能身份
- 必须符合斗气大陆的世界观
- 不要提及任何现实世界的事物
- 回复简洁（1-3句话），像真实对话一样自然"""

    messages = [{'role': 'system', 'content': system_prompt}]
    for h in history[-6:]:
        messages.append({'role': 'user', 'content': h.get('player', '')})
        messages.append({'role': 'assistant', 'content': h.get('npc', '')})

    # 开场白 vs 正常对话
    if not player_input:
        messages.append({'role': 'user', 'content': '（一个旅行者向你走来，打量着你）请对这位旅行者说一句话作为开场白。'})
    else:
        messages.append({'role': 'user', 'content': player_input})

    try:
        r = ai_client.chat.completions.create(
            model='deepseek-chat',
            messages=messages,
            temperature=0.8,
            max_tokens=300,
        )
        reply = r.choices[0].message.content.strip()
        return jsonify({'reply': reply})
    except Exception as e:
        app.logger.error(f'对话生成失败: {e}')
        return jsonify({'reply': '......（对方似乎没有听懂你在说什么）'}), 200


# ============================================================
#  历练文本生成
# ============================================================

@app.route('/generate/training', methods=['POST'])
def generate_training():
    """
    历练事件文本生成
    Body: {
        player: { name, technique_name, ... },
        mob: { mob_id, name, description, power, intelligence, quick, stamina, level },
        battle: { win_rate, rounds, style, player_total, mob_total },
        location: { name, description },
        won: bool,
        drops: [{ name, count }]
    }
    """
    data = request.get_json(force=True)
    player = data.get('player', {})
    mob = data.get('mob', {})
    battle = data.get('battle', {})
    location = data.get('location', {})
    won = data.get('won', True)

    def format_skills(skills):
        if not skills:
            return '无'
        lines = []
        for s in skills:
            desc = s.get('description', '')
            lines.append(f"- {s.get('name', '未知斗技')}（Lv.{s.get('level', 1)}）{f'：{desc}' if desc else ''}")
        return '\n'.join(lines)

    equipped_skills_text = format_skills(player.get('equipped_skills', []))

    player_name = player.get('name', '旅行者')

    system_prompt = (
        '你是斗气大陆的冒险叙事者。根据战斗信息生成一段简练的历练叙事文本。'
        '文字风格参考斗破苍穹小说，生动但不啰嗦。'
        f'全程严格使用第三人称，主语必须是"{player_name}"，禁止出现"你"、"我"、"玩家"等第一/第二人称。'
        '可将功法与斗技统称为招式/手段，自然融入叙事即可，不必刻意区分。'
        '字数控制在150字以内。'
        '只输出叙事文本，不要输出JSON或其他格式。'
    )

    outcome = '胜利' if won else '逃跑'
    user_prompt = (
        f'要求：严格第三人称叙事，主语只能是"{player_name}"，全文禁止出现"你"、"我"、"玩家"、"主角"等字样，违者重写。\n'
        f'【地点】{location.get("name", "")} - {location.get("description", "")}\n'
        f'【玩家姓名】{player_name}\n'
        f'【可用招式】功法：{player.get("technique_name", "无")}；斗技：{equipped_skills_text}\n'
        f'【遭遇怪物】{mob.get("name", "")}\n'
        f'  描述：{mob.get("description", "")}\n'
        f'【战斗信息】结局：{outcome}，战斗风格：{battle.get("style", "普通")}\n'
        f'\n请用第三人称写一段遭遇→交锋→{outcome}的叙事，主语用"{player_name}"，不要出现"你"、"我"、"玩家"，自然提及使用的招式，不超过150字。'
    )

    try:
        r = ai_client.chat.completions.create(
            model='deepseek-chat',
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ],
            temperature=0.9,
            max_tokens=200,
        )
        text = r.choices[0].message.content.strip()
        return jsonify({'text': text})
    except Exception as e:
        import traceback
        print(f'[Training ERROR] {e}')
        traceback.print_exc()
        return jsonify({'text': f'你在{location.get("name", "")}遭遇了一只{mob.get("name", "")}。'})


# ============================================================
#  奇遇发现叙事生成
# ============================================================

@app.route('/generate/encounter', methods=['POST'])
def generate_encounter():
    """
    奇遇发现叙事生成（历练途中偶遇副本入口/洞天福地，非进入、非战斗）
    Body: {
        player: { name, technique_name },
        location: { name, description },
        encounter: { kind, title, scene_type, star, description }
    }
    """
    data = request.get_json(force=True)
    player = data.get('player', {})
    location = data.get('location', {})
    enc = data.get('encounter', {})
    player_name = player.get('name', '旅行者')

    system_prompt = (
        '你是斗气大陆的冒险叙事者。玩家在历练途中偶然发现了一处奇遇（秘境入口或洞天福地），'
        '请生成一段简练的叙事文本，描述玩家"发现"这处奇遇的情景（只写发现，不写进入或战斗）。'
        '文字风格参考斗破苍穹小说，渲染机缘与神秘感，生动但不啰嗦。'
        f'全程严格使用第三人称，主语必须是"{player_name}"，禁止出现"你"、"我"、"玩家"等第一/第二人称。'
        '字数控制在120字以内。只输出叙事文本，不要输出JSON或其他格式。'
    )

    kind_word = '洞天福地' if enc.get('kind') == 'cultivate' else '秘境入口'
    star_hint = f'（{enc.get("star")}星）' if enc.get('star') else ''
    user_prompt = (
        f'要求：严格第三人称叙事，主语只能是"{player_name}"，全文禁止出现"你"、"我"、"玩家"。\n'
        f'【地点】{location.get("name", "")} - {location.get("description", "")}\n'
        f'【玩家姓名】{player_name}\n'
        f'【发现奇遇】{enc.get("title", "")}{star_hint}（{kind_word}）\n'
        f'【情景提示】{enc.get("description", "")}\n'
        f'\n请用第三人称写一段"{player_name}"在历练途中偶然发现这处奇遇的叙事，'
        f'渲染神秘与机缘感，主语用"{player_name}"，不出现"你"、"我"，不超过120字。'
    )

    try:
        r = ai_client.chat.completions.create(
            model='deepseek-chat',
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ],
            temperature=0.9,
            max_tokens=200,
        )
        text = r.choices[0].message.content.strip()
        return jsonify({'text': text})
    except Exception as e:
        import traceback
        print(f'[Encounter ERROR] {e}')
        traceback.print_exc()
        return jsonify({'text': enc.get('description', '你发现了一处异样。')})


# ============================================================
#  突破叙事生成
# ============================================================

@app.route('/generate/breakthrough', methods=['POST'])
def generate_breakthrough():
    data = request.get_json(force=True)
    player = data.get('player', {})
    success = data.get('success', False)
    location = data.get('location', {})

    if success:
        system_prompt = (
            '你是斗气大陆的叙事者。玩家突破了修炼瓶颈，'
            '请用斗破苍穹小说风格写一段激动人心的突破叙事，1-3句话。'
            '描写体内的斗气涌动、经脉拓宽、实力飞跃。'
            '只返回叙事文本，不要JSON格式。'
        )
        user_prompt = (
            f'【玩家】{player.get("name", "")}\n'
            f'【当前等阶】{player.get("level_name", "")}\n'
            f'【修炼功法】{player.get("technique_name", "无")}\n'
            f'【地点】{location.get("name", "未知")}\n'
            f'\n玩家成功突破！请生成一段令人振奋的突破叙事。'
        )
    else:
        system_prompt = (
            '你是斗气大陆的叙事者。玩家突破失败，'
            '请用斗破苍穹小说风格写一段突破失败的叙事，1-3句话。'
            '描写体内的斗气失控、经脉刺痛、修为倒退。语气凝重但不绝望，留有再战的希望。'
            '只返回叙事文本，不要JSON格式。'
        )
        user_prompt = (
            f'【玩家】{player.get("name", "")}\n'
            f'【当前等阶】{player.get("level_name", "")}\n'
            f'【修炼功法】{player.get("technique_name", "无")}\n'
            f'【地点】{location.get("name", "未知")}\n'
            f'\n玩家突破失败，修为倒退。请生成一段令人惋惜但不失希望的失败叙事。'
        )

    try:
        r = ai_client.chat.completions.create(
            model='deepseek-chat',
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ],
            temperature=0.9,
            max_tokens=200,
        )
        text = r.choices[0].message.content.strip()
        return jsonify({'text': text})
    except Exception as e:
        import traceback
        print(f'[Breakthrough ERROR] {e}')
        traceback.print_exc()
        fallback = '你感到体内斗气翻涌，成功突破了修炼瓶颈！' if success else '你冲击瓶颈失败，体内斗气紊乱，修为受损。'
        return jsonify({'text': fallback})


# ============================================================
#  箱庭副本生成
# ============================================================

DUNGEON_SCENES = {
    '山洞': '幽深曲折的地下洞穴，石壁湿冷、光线昏暗，可能有石钟乳、地下河、狭窄甬道、岔路',
    '密林': '遮天蔽日的原始森林，藤蔓缠绕、兽吼鸟鸣，潮湿闷热，有古树、灌木丛、溪流',
    '山谷': '两侧峭壁夹峙的幽谷，云雾缭绕，谷底有乱石、溪流、回声震荡',
    '浅滩': '水波拍岸的河海浅滩，礁石密布、淤泥湿滑，潮汐涨落、水汽弥漫',
}


def _parse_json_object(content):
    """从 AI 回复中提取 JSON 对象（dict）"""
    json_str = content
    m = re.search(r'```(?:json)?\s*([\s\S]*?)```', content)
    if m:
        json_str = m.group(1).strip()
    m = re.search(r'\{[\s\S]*\}', json_str)
    if m:
        json_str = m.group(0)
    obj = json.loads(json_str)
    if not isinstance(obj, dict):
        raise ValueError('Expected JSON object')
    return obj


def _normalize_dungeon(bp, scene_type):
    """校验并补全副本蓝图，确保五幕结构完整"""
    VALID_TYPES = {'combat', 'sneak', 'modifier', 'explore', 'boss', 'item'}
    acts = bp.get('acts')
    if not isinstance(acts, list) or len(acts) < 5:
        raise ValueError('acts 缺失或不足 5 幕')
    norm_acts = []
    for i in range(5):
        a = acts[i] if i < len(acts) else {}
        t = str(a.get('type', 'combat'))
        if t not in VALID_TYPES:
            t = 'combat'
        if i == 4:
            t = 'boss'  # 第五幕强制 boss
        norm_acts.append({
            'index': i + 1,
            'type': t,
            'title': str(a.get('title', f'第{i + 1}幕'))[:32],
            'narrative': str(a.get('narrative', ''))[:300],
        })
    return {
        'title': str(bp.get('title', f'{scene_type}秘境'))[:32],
        'scene_type': scene_type,
        'intro': str(bp.get('intro', ''))[:300],
        'acts': norm_acts,
    }


def _fallback_dungeon(scene_type):
    """降级副本蓝图（AI 失败时）"""
    titles = {
        '山洞': '幽冥石洞', '密林': '迷雾密林',
        '山谷': '回声幽谷', '浅滩': '潮汐暗滩',
    }
    intros = {
        '山洞': '你拨开荆棘，发现一处幽深山洞，洞口隐隐传来低沉的喘息声。',
        '密林': '你踏入一片遮天蔽日的密林，四周静谧得有些诡异。',
        '山谷': '你沿着峭壁走入一道幽谷，谷底回荡着空旷的风声。',
        '浅滩': '你来到一片湿滑的浅滩，礁石间似有什么在游动。',
    }
    return {
        'title': titles.get(scene_type, f'{scene_type}秘境'),
        'scene_type': scene_type,
        'intro': intros.get(scene_type, f'你进入了一处{scene_type}。'),
        'acts': [
            {'index': 1, 'type': 'sneak', 'title': '入口守卫', 'narrative': f'你刚踏入{scene_type}，一个黑影挡住了去路。'},
            {'index': 2, 'type': 'modifier', 'title': '环境突变', 'narrative': f'前方的{scene_type}地势变得更加险恶。'},
            {'index': 3, 'type': 'combat', 'title': '深处遭遇', 'narrative': f'{scene_type}深处，一只凶兽正向你逼近。'},
            {'index': 4, 'type': 'explore', 'title': '岔路抉择', 'narrative': f'你发现{scene_type}中一处可疑的角落。'},
            {'index': 5, 'type': 'boss', 'title': '最终之敌', 'narrative': f'{scene_type}尽头，强敌现身，决一死战！'},
        ],
    }


@app.route('/generate/dungeon', methods=['POST'])
def generate_dungeon():
    """
    生成五幕箱庭副本蓝图
    Body: { scene_type?: string (山洞/密林/山谷/浅滩), player_level?: number }
    Returns: { title, scene_type, intro, acts: [{ index, type, title, narrative }] }
    """
    data = request.get_json(force=True)
    scene_type = data.get('scene_type') or random.choice(list(DUNGEON_SCENES.keys()))
    if scene_type not in DUNGEON_SCENES:
        scene_type = random.choice(list(DUNGEON_SCENES.keys()))
    scene_desc = DUNGEON_SCENES[scene_type]
    player_level = data.get('player_level')
    difficulty = data.get('difficulty') or 1
    tier_word = {1: '一阶', 2: '二阶', 3: '三阶'}.get(int(difficulty), '一阶')

    system_prompt = (
        '你是斗气大陆（斗破苍穹）世界观的箱庭副本设计师。'
        '负责设计一个由五幕组成的线性箱庭副本（类似地下城堡/杀戮尖塔的单人秘境）。'
        '严格遵循斗破苍穹世界观（斗气、魔兽、佣兵、丹药等），不要出现现实事物。'
        '只输出 JSON，不要输出任何其他内容。'
    )
    level_line = f'【玩家等阶参考】{player_level}（用于安排遭遇强度）\n' if player_level else ''
    difficulty_line = f'【副本难度】{int(difficulty)}星 —— 副本内只会出现{tier_word}魔兽、{tier_word}魔核等，不得出现更高或更低等阶的事物\n'
    user_prompt = (
        '请设计一个五幕箱庭副本。\n'
        f'【场景类型】{scene_type} —— {scene_desc}\n'
        f'{level_line}'
        f'{difficulty_line}'
        '【结构要求】\n'
        '- 共 5 幕，严格线性推进（第一幕 → 第二幕 → … → 第五幕）\n'
        '- 第五幕固定为 BOSS 战\n'
        '- 前四幕类型从以下选取并尽量多样：combat(战斗遭遇)、sneak(可战斗或绕过)、modifier(环境改变，如狭窄/黑暗/毒雾)、explore(探索风险/奖励)、item(发现散落的魔核等物品)\n'
        '- item 幕：描写发现宝物(如发光的魔核)的氛围与感官细节(光影/气息/声响)，营造发现的惊喜感，但不要写出具体物品名与数量（由系统按难度填入）\n'
        '- 每幕需有独立的标题和叙事文本（第二人称"你"，30-80字），描述玩家在此幕的遭遇\n'
        '【输出格式】严格如下 JSON（不要 markdown，不要多余文字）：\n'
        '{\n'
        f'  "title": "副本名称（6-12字，契合{scene_type}场景）",\n'
        f'  "scene_type": "{scene_type}",\n'
        '  "intro": "入口处引导叙事（第二人称，40-80字）",\n'
        '  "acts": [\n'
        '    {"index": 1, "type": "sneak", "title": "本幕标题", "narrative": "本幕叙事"},\n'
        '    {"index": 2, "type": "item", "title": "本幕标题", "narrative": "本幕叙事"},\n'
        '    {"index": 3, "type": "combat", "title": "本幕标题", "narrative": "本幕叙事"},\n'
        '    {"index": 4, "type": "explore", "title": "本幕标题", "narrative": "本幕叙事"},\n'
        '    {"index": 5, "type": "boss", "title": "本幕标题", "narrative": "本幕叙事"}\n'
        '  ]\n'
        '}'
    )

    app.logger.info(f'副本生成请求: scene={scene_type}, level={player_level}, difficulty={difficulty}')
    try:
        content = call_deepseek(system_prompt, user_prompt, temperature=0.95, max_tokens=1200)
        blueprint = _normalize_dungeon(_parse_json_object(content), scene_type)
        app.logger.info(f'副本生成成功: {blueprint["title"]} ({scene_type})')
        return jsonify(blueprint)
    except Exception as e:
        app.logger.error(f'副本生成失败: {e}，使用降级方案')
        return jsonify(_fallback_dungeon(scene_type)), 200


# ============================================================
#  启动
# ============================================================

if __name__ == '__main__':
    print(f'dqdl-agent 启动: http://{AGENT_HOST}:{AGENT_PORT}')
    app.run(host=AGENT_HOST, port=AGENT_PORT, debug=False)
