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
import logging
from flask import Blueprint, request, jsonify
from llm_client import _chat_with_logging
from db import log_dialog_call
from config import ensure_rag
from role_knowledge import get_role_sources

logger = logging.getLogger('dqdl-agent.dialog')
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
    role_id = data.get('role_id')  # npc_role.id（可选）；用于按职能限定知识库来源

    # ── 按职能注入知识库（RAG）──
    # 通过 role_id 取该角色允许参考的文档来源白名单；未配置则不限制。
    knowledge_block = _build_knowledge_block(player_input, role_id)

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
{knowledge_block}
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
        logger.error(f'对话生成失败: {e}')
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


def _build_knowledge_block(player_input, role_id):
    """
    按角色职能注入知识库上下文，并返回拼进 system_prompt 的文本块（含前导换行）。

    规则：
    - 取 role_id 对应的文档来源白名单（role_knowledge.get_role_sources）。
      未配置 → 返回空串（不限制，也不注入知识，行为与改造前一致）。
    - 配置了白名单（如炼药师 → 草药/丹药图鉴）：
        · 用 player_input 做语义检索，只在这些图鉴内召回相关条目；
        · 注入"参考资料"，并附加约束：只依据资料作答，超出范围要承认不懂；
        · RAG 不可用/无召回时不阻断对话，仅退化为"仅约束无资料"。
    """
    sources = get_role_sources(role_id)
    if not sources:
        return ''

    context = ''
    try:
        ensure_rag()
        from rag_service import get_context
        query = player_input or '草药 丹药'
        context = get_context(query, top_k=5, max_chars=2000, sources=sources)
    except Exception as e:
        logger.warning(f'角色 {role_id} 知识库检索失败，降级为仅约束：{e}')
        context = ''

    parts = [
        '',
        '【你的知识范围（严格限制）】',
        f'你只能依据以下资料回答问题：{", ".join(sources)}。',
        '- 只能用上述资料里的信息作答；资料没涉及的，你要坦白说"这我可不熟/不在行"，不得编造。',
        '- 不要谈论其他领域（如魔兽、魔核、物价、佣兵规则）的专业内容。',
    ]
    if context:
        parts += [
            '',
            '【参考资料】（从你的图鉴中检索到的相关内容，作答必须以此为据）',
            context,
        ]
    return '\n'.join(parts) + '\n'

