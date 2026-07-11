"""
NPC 对话生成路由：POST /generate/dialog

会话化结构：server 端创建会话（dialog_session）→ 每次调用本路由（一次 deepseek 请求）
落一行 agent_dialog_call，通过 server_session_id 绑定 server 会话。
agent 完全主导 deepseek 调用（messages 组装在本路由，未来抽成独立 agent 实例的锚点），
不关注业务语义（谁和谁聊），只记精细信息（token/messages 快照/模型）。

请求体：
  npc: { name, nature_name, nature_hint, role_name, role_hint }
  location: { name, loc_type, description, tags }
  player: { name, level }
  player_input: string（空串=开场白）
  history: [{player, npc}]  （由 server 从 session.messages 提取塞入，实现记忆）
  session_id: int           （server 的 dialog_session.id，绑定键）
  call_index: int           （会话内第几次调用，1=开场白）

响应：{ reply: string, call_id: int|null }
"""
import time
from flask import Blueprint, request, jsonify
from llm_client import _chat_with_logging
from db import log_dialog_call

bp = Blueprint('dialog', __name__)


@bp.route('/generate/dialog', methods=['POST'])
def generate_dialog():
    data = request.get_json(force=True)
    npc = data.get('npc', {})
    location = data.get('location', {})
    player = data.get('player', {})
    player_input = data.get('player_input', '')
    history = data.get('history', [])
    session_id = data.get('session_id')
    call_index = data.get('call_index', 1)

    system_prompt = f"""你是斗气大陆（斗破苍穹）世界观中的NPC，正在与玩家对话。

【你的身份】
- 名字: {npc.get('name', '未知')}
- 性格: {npc.get('nature_name', '普通')} — {npc.get('nature_hint', '正常说话')}
- 职能: {npc.get('role_name', '普通人')} — {npc.get('role_hint', '正常交流')}

【你的位置】
- 地点: {location.get('name', '未知地点')}
- 类型: {location.get('loc_type', '')}
- 描述: {location.get('description', '')}
- 标签: {', '.join(location.get('tags', []) or [])}

【正在与你对话的玩家】
- 名号: {player.get('name', '一位旅行者')}
- 修为: {'斗之气·' + str(player.get('level', 1)) + '段' if player.get('level') else '未知'}

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

    start = time.time()
    try:
        content, usage = _chat_with_logging(
            messages, temperature=0.8, max_tokens=300, call_type='dialog'
        )
        reply = (content or '').strip()
        duration_ms = int((time.time() - start) * 1000)

        # 落库 agent_dialog_call（精细信息；失败降级忽略，不阻断对话）
        model = _pick_dialog_model_name()
        call_id = log_dialog_call(
            server_session_id=session_id,
            call_index=call_index,
            messages=messages,
            player_input=player_input,
            reply=reply,
            model=model,
            usage=usage,
            duration_ms=duration_ms,
            success=True,
        )
        return jsonify({'reply': reply, 'call_id': call_id})
    except Exception as e:
        bp.logger.error(f'对话生成失败: {e}')
        duration_ms = int((time.time() - start) * 1000)
        reply = '......（对方似乎没有听懂你在说什么）'
        call_id = log_dialog_call(
            server_session_id=session_id,
            call_index=call_index,
            messages=messages,
            player_input=player_input,
            reply=reply,
            duration_ms=duration_ms,
            success=False,
            error_msg=str(e),
        )
        return jsonify({'reply': reply, 'call_id': call_id}), 200


def _pick_dialog_model_name():
    """取 dialog 场景当前路由到的模型名（仅用于日志记录）。"""
    try:
        from config import _pick_client
        _, model, _ = _pick_client('dialog')
        return model
    except Exception:
        return None
