"""
NPC 对话生成路由：POST /generate/dialog
"""
from flask import Blueprint, request, jsonify
from llm_client import _chat_with_logging

bp = Blueprint('dialog', __name__)


@bp.route('/generate/dialog', methods=['POST'])
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
        content, _ = _chat_with_logging(messages, temperature=0.8, max_tokens=300, call_type='dialog')
        reply = content.strip()
        return jsonify({'reply': reply})
    except Exception as e:
        bp.logger.error(f'对话生成失败: {e}')
        return jsonify({'reply': '......（对方似乎没有听懂你在说什么）'}), 200
