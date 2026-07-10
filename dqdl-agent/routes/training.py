"""
历练叙事生成路由：POST /generate/training

使用 function calling 模式：LLM 自主调用工具拉取上下文（玩家技能/魔兽详情），
再用 generate_narrative 工具结构化返回叙事。掉落仍由后端 server 决定（不在此处理）。
"""
import json
from flask import Blueprint, request, jsonify
from llm_client import call_deepseek
from utils import _parse_json_object
from agent_tools import run_with_tools, TRAINING_TOOLS

bp = Blueprint('training', __name__)


@bp.route('/generate/training', methods=['POST'])
def generate_training():
    """
    历练事件文本生成（function calling 模式）
    Body: {
        player: { name, technique_name, equipped_skills },
        mob: { mob_id, name, description, power, intelligence, quick, stamina, level },
        battle: { win_rate, rounds, style, player_total, mob_total },
        location: { name, description },
        won: bool,
    }
    Returns: { text, keywords: [{text, type}] }
    """
    data = request.get_json(force=True)
    player = data.get('player', {})
    mob = data.get('mob', {})
    location = data.get('location', {})
    won = data.get('won', True)
    player_name = player.get('name', '旅行者')
    outcome = '胜利' if won else '逃跑'

    # 优先走 function calling 流程
    result = _try_function_calling(player, mob, location, won, player_name, outcome)
    if result is not None:
        return jsonify(result)

    # fallback：function calling 不可用或失败时，走旧的 JSON 解析模式
    return jsonify(_fallback_generation(player, mob, location, won, player_name, outcome))


def _try_function_calling(player, mob, location, won, player_name, outcome):
    """function calling 模式：LLM 自主调工具拉上下文 + 结构化输出。
    成功返回 {text, keywords}；失败返回 None（由调用方走 fallback）。"""
    # 最小化初始 prompt（玩家技能/魔兽弱点不再预填，由 LLM 按需调工具拉取）
    system_prompt = (
        '你是斗气大陆的冒险叙事者。根据战斗信息生成一段简练的历练叙事文本。'
        '文字风格参考斗破苍穹小说，生动但不啰嗦。'
        f'全程严格使用第三人称，主语必须是"{player_name}"，禁止出现"你"、"我"、"玩家"等第一/第二人称。'
        f'\n\n你可以调用工具获取更多上下文信息，最后必须调用 generate_narrative 输出叙事。'
    )
    user_prompt = (
        f'【地点】{location.get("name", "")} - {location.get("description", "")}\n'
        f'【玩家姓名】{player_name}\n'
        f'【遭遇怪物】{mob.get("name", "")}（ID: {mob.get("mob_id", "")}）\n'
        f'【战斗结局】{outcome}\n'
        f'\n请按需调用工具获取玩家功法和魔兽详情，然后生成一段遭遇→交锋→{outcome}的叙事（150字内），'
        f'通过 generate_narrative 工具输出。'
    )

    # 工具执行器：数据源来自请求体（agent 不查 DB）
    tool_handlers = {
        'get_player_combat_info': lambda args: _player_info(player),
        'get_mob_detail': lambda args: _mob_info(mob),
    }

    try:
        result = run_with_tools(
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ],
            tools=TRAINING_TOOLS,
            tool_handlers=tool_handlers,
            call_type='training',
            temperature=0.9,
            max_tokens=600,
            max_rounds=3,
            final_tool_name='generate_narrative',
        )
        if result is None:
            return None
        # 确保 keywords 字段存在
        if 'keywords' not in result:
            result['keywords'] = []
        return result
    except Exception as e:
        print(f'[Training function_calling ERROR] {e}')
        return None


def _player_info(player):
    """工具 get_player_combat_info 的执行器：返回玩家战斗信息"""
    technique = player.get('technique_name', '无')
    skills = player.get('equipped_skills', [])
    if isinstance(skills, list) and skills:
        if isinstance(skills[0], str):
            skills_text = '、'.join(skills)
        else:
            skills_text = '、'.join(s.get('name', '') for s in skills if isinstance(s, dict))
    else:
        skills_text = '无'
    return f'功法：{technique}；斗技：{skills_text or "无"}'


def _mob_info(mob):
    """工具 get_mob_detail 的执行器：返回魔兽详情"""
    parts = [f'名称：{mob.get("name", "未知")}']
    if mob.get('description'):
        parts.append(f'描述：{mob["description"]}')
    if mob.get('mob_id'):
        parts.append(f'ID：{mob["mob_id"]}')
    return '\n'.join(parts)


def _fallback_generation(player, mob, location, won, player_name, outcome):
    """降级方案：function calling 不可用时，走旧的 call_deepseek + JSON 解析"""
    system_prompt = (
        '你是斗气大陆的冒险叙事者。根据战斗信息生成一段简练的历练叙事文本。'
        '文字风格参考斗破苍穹小说，生动但不啰嗦。'
        f'全程严格使用第三人称，主语必须是"{player_name}"，禁止出现"你"、"我"、"玩家"等第一/第二人称。'
        '字数控制在150字以内。'
        '必须输出JSON格式：{"text":"叙事文本","keywords":[{"text":"关键词","type":"类型"}]}'
        '其中 type 只能是：mob(魔兽名)、location(地点名)、skill(功法/斗技名)、item(物品名)、player(玩家名)。'
        '只输出JSON，不要输出其他内容。'
    )
    user_prompt = (
        f'【地点】{location.get("name", "")} - {location.get("description", "")}\n'
        f'【玩家姓名】{player_name}\n'
        f'【可用招式】功法：{player.get("technique_name", "无")}；斗技：{player.get("equipped_skills", [])}\n'
        f'【遭遇怪物】{mob.get("name", "")}\n  描述：{mob.get("description", "")}\n'
        f'【战斗结局】{outcome}\n'
        f'\n请用第三人称写一段遭遇→交锋→{outcome}的叙事，不超过150字。'
    )

    try:
        raw, _ = call_deepseek(system_prompt, user_prompt, temperature=0.9, max_tokens=300, call_type='training')
        try:
            result = _parse_json_object(raw)
            if 'text' not in result:
                result = {'text': raw, 'keywords': []}
            if 'keywords' not in result:
                result['keywords'] = []
        except (json.JSONDecodeError, ValueError):
            result = {'text': raw, 'keywords': [
                {'text': mob.get('name', ''), 'type': 'mob'},
                {'text': location.get('name', ''), 'type': 'location'},
                {'text': player_name, 'type': 'player'},
            ]}
        return result
    except Exception as e:
        import traceback
        print(f'[Training ERROR] {e}')
        traceback.print_exc()
        return {
            'text': f'{player_name}在{location.get("name", "")}遭遇了{mob.get("name", "")}。',
            'keywords': [
                {'text': mob.get('name', ''), 'type': 'mob'},
                {'text': location.get('name', ''), 'type': 'location'},
                {'text': player_name, 'type': 'player'},
            ],
        }
