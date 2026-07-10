"""
奇遇发现叙事生成路由：POST /generate/encounter
"""
from flask import Blueprint, request, jsonify
from llm_client import call_deepseek

bp = Blueprint('encounter', __name__)


@bp.route('/generate/encounter', methods=['POST'])
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
        content, _ = call_deepseek(system_prompt, user_prompt, temperature=0.9, max_tokens=200, call_type='encounter')
        text = content.strip()
        return jsonify({'text': text})
    except Exception as e:
        import traceback
        print(f'[Encounter ERROR] {e}')
        traceback.print_exc()
        return jsonify({'text': enc.get('description', '你发现了一处异样。')})
