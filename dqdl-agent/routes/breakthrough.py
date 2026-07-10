"""
突破叙事生成路由：POST /generate/breakthrough
"""
from flask import Blueprint, request, jsonify
from llm_client import call_deepseek

bp = Blueprint('breakthrough', __name__)


@bp.route('/generate/breakthrough', methods=['POST'])
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
        content, _ = call_deepseek(system_prompt, user_prompt, temperature=0.9, max_tokens=200, call_type='breakthrough')
        text = content.strip()
        return jsonify({'text': text})
    except Exception as e:
        import traceback
        print(f'[Breakthrough ERROR] {e}')
        traceback.print_exc()
        fallback = '你感到体内斗气翻涌，成功突破了修炼瓶颈！' if success else '你冲击瓶颈失败，体内斗气紊乱，修为受损。'
        return jsonify({'text': fallback})
