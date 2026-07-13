"""
历练叙事生成路由：POST /generate/training

设计原则：agent 是无状态 LLM 网关，不查询任何业务数据。
玩家功法/斗技/魔兽等上下文全部由 server 预填进请求体，agent 直接据此生成叙事。
（早期版本曾用 function calling 让 LLM "自主调工具"拉上下文，但工具数据源仍是请求体，
属于伪自主——徒增多轮调用与 token，且让架构误以为 agent 在查数据。已移除。）
"""
import json
from flask import Blueprint, request, jsonify
from llm_client import call_deepseek
from utils import _parse_json_object

bp = Blueprint('training', __name__)


@bp.route('/generate/training', methods=['POST'])
def generate_training():
    """
    历练叙事生成。所有上下文由 server 预填，agent 仅负责生成文本。
    Body: {
        player: { name, technique_name, equipped_skills },
        mob: { mob_id, name, description },
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

    # 玩家功法/斗技名（server 已按 id 反查填好，支持字符串数组或对象数组）
    technique = player.get('technique_name') or '无'
    skills = player.get('equipped_skills', [])
    if isinstance(skills, list) and skills:
        if isinstance(skills[0], str):
            skills_text = '、'.join(skills)
        else:
            skills_text = '、'.join(s.get('name', '') for s in skills if isinstance(s, dict))
    else:
        skills_text = '无'

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
        f'【可用招式】功法：{technique}；斗技：{skills_text}\n'
        f'【遭遇怪物】{mob.get("name", "")}\n  描述：{mob.get("description", "")}\n'
        f'【战斗结局】{outcome}\n'
        f'\n请用第三人称写一段遭遇→交锋→{outcome}的叙事，'
        f'适当体现玩家所用功法/斗技，不超过150字。'
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
        return jsonify(result)
    except Exception as e:
        import traceback
        print(f'[Training ERROR] {e}')
        traceback.print_exc()
        return jsonify({
            'text': f'{player_name}在{location.get("name", "")}遭遇了{mob.get("name", "")}。',
            'keywords': [
                {'text': mob.get('name', ''), 'type': 'mob'},
                {'text': location.get('name', ''), 'type': 'location'},
                {'text': player_name, 'type': 'player'},
            ],
        })
