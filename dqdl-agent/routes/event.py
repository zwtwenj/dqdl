"""
场景事件编排路由：POST /generate/event
"""
import logging
from flask import Blueprint, request, jsonify
from llm_client import call_deepseek
from config import ensure_rag
from utils import _parse_json_object
from services.event_service import EVENT_EFFECT_KEYS, _normalize_event, _fallback_event

logger = logging.getLogger('dqdl-agent.event')
bp = Blueprint('event', __name__)


@bp.route('/generate/event', methods=['POST'])
def generate_event():
    """
    生成场景事件规格（沿用 random_event 节点图格式）。
    Body: { trigger:{type,payload}, player:{name,level,money}, allowedEffects:[...], pendingTaskCount }
    Returns: { event_id, title, nodes, delivery, fire_conditions, reason }
    """
    data = request.get_json(force=True) or {}
    trigger = data.get('trigger') or {}
    player = data.get('player') or {}
    allowed = data.get('allowedEffects') or EVENT_EFFECT_KEYS

    trig_type = trigger.get('type', 'enter_location')
    payload = trigger.get('payload') or {}
    plevel = player.get('level') if isinstance(player, dict) else None
    pname = player.get('name', '玩家') if isinstance(player, dict) else '玩家'
    ploc = player.get('location', '') if isinstance(player, dict) else ''

    # 触发情境描述（喂给 agent 做剧情编排）
    loc_suffix = f'（玩家当前所在地：{ploc}）' if ploc else ''
    trig_desc = {
        'breakthrough': f'玩家{pname}刚完成突破（结果：{"成功" if payload.get("success") else "失败"}, 新等阶 {payload.get("newLevel", "?")}）{loc_suffix}',
        'kill_mob': f'玩家{pname}在{ploc or "某处"}刚击杀了魔兽 {payload.get("mobName", "未知")}',
        'enter_location': f'玩家{pname}进入了{ploc or "新地点"}',
        'combat': f'玩家{pname}在{ploc or "某处"}陷入了一场争斗（可能源自仇家寻仇/比试挑衅/路遇劫匪）',
    }.get(trig_type, f'玩家{pname}在{ploc or "某处"}触发了事件 {trig_type}')

    # RAG 世界观片段（首次把检索结果注入生成 prompt）
    world_lore = ''
    try:
        ensure_rag()
        from rag_service import get_context
        # combat 类多塞"仇怨/决斗/比试"关键词
        if trig_type == 'combat':
            query = '仇怨 决斗 比试 寻仇 斗气大陆 修真界'
        elif trig_type == 'kill_mob':
            query = f'{payload.get("mobName", "")} 仇怨 修真界 斗气大陆'
        else:
            query = '奇遇 修真界 斗气大陆'
        world_lore = get_context(query, top_k=5, max_chars=2000)
    except Exception as e:
        logger.warning(f'RAG 不可用，事件生成不注入世界观: {e}')

    effects_hint = ', '.join(allowed)
    system_prompt = (
        '你是斗气大陆（斗破苍穹）世界观的事件设计师。'
        '根据玩家刚触发的游戏事件，编排一段有起承转合的场景事件——可以是偶遇、仇家寻仇、'
        '故人相赠、神秘委托、宝物线索等，要有戏剧性和世界观质感。'
        '严格遵循斗破苍穹世界观（斗气、魔兽、佣兵、丹药、宗门等），不要出现现实事物。'
        '只输出 JSON，不要输出任何其他内容。'
    )
    user_prompt = (
        f'【触发情境】{trig_desc}\n'
        f'【玩家所在地】{ploc or "未知"}（事件剧情应贴合此地风物）\n'
        f'【玩家等阶参考】{plevel or "未知"}\n'
        f'【玩家待办任务数】{data.get("pendingTaskCount", 0)}（多则不宜再派新任务）\n'
        '【可用的 effect 原子能力】（effects 数组里每条对象只能用以下 key 之一，不得编造）：\n'
        f'  {effects_hint}\n'
        '【effect 语义说明】\n'
        '  money: {money: ±n} 金钱增减\n'
        '  giveItem: {giveItem:{name,count}} 发放物品\n'
        '  createTask: {createTask:{name,desc,target[],reward[],star?}} 派一个任务\n'
        '  startBattle: 发起一场真实回合制战斗（玩家进入战斗界面，非掷骰）。两种格式：\n'
        '    {startBattle:{mobId:"WB-001"}} 引用图鉴魔兽；或\n'
        '    {startBattle:{name,level,power,intelligence,quick,stamina,description?}} 生成一个NPC/魔兽对手，\n'
        '      level对应玩家等阶(1=斗之气一段...), 四维属性(力/智/敏/体)按玩家实力±20%安排以保持挑战性\n'
        '  grantCultivation: {grantCultivation:{amount}} 增减修为\n'
        '  triggerEncounter: {} 触发一次奇遇\n'
        '  movePlayer: {movePlayer:{position:[地点ID]}} 移动玩家\n'
        '【结构要求】\n'
        '- nodes 为分支对话节点图：{start:入口id, map:{节点id:节点}}\n'
        '- 每个节点可含 npc(台词)、choices(选项[{text,goto,require?}])、effects(进节点即落地)、roll(加权跳转[{weight,goto}])、end(是否终止)\n'
        '- 含 startBattle 的战斗节点可额外配置 win/lose/flee 三个字段，值为战斗结束后跳转的节点id：\n'
        '    {"effects":[{"startBattle":{...}}], "win":"victory_node", "lose":"defeat_node", "flee":"flee_node"}\n'
        '    未配则战斗结束即终止事件；配了可衔接下一场战斗(连战)或结算对话\n'
        '- 台词用第二人称"你"，符合斗气大陆口吻\n'
        '- 数值要克制合理（金币通常几十~几千，物品 count 1~10），不要出现离谱大数\n'
        '- delivery: immediate(立即弹) 或 enter_location(下次进匹配地点时弹)\n'
        + (
            '【★争斗事件专项要求★】本事件为 combat 争斗类型，必须满足：\n'
            '- 必须包含至少一场 startBattle（玩家与NPC/魔兽的真实回合制战斗）\n'
            '- 鼓励多场连续战斗：仇家带帮手(打完小的来老的)/车轮战/BOSS战，用 win 节点衔接下一场战斗\n'
            '- 战斗节点务必配置 win 和 lose 两个跳转(可不含 flee)，让胜负都有后续剧情\n'
            '- 生成的对手要有名字和符合等阶的属性，不要全员一模一样\n'
            '- 剧情张力：挑衅/对峙/反转，要有修真界争斗的味道\n'
            if trig_type == 'combat' else ''
        )
        + f'{("【世界观参考】\\n" + world_lore + "\\n") if world_lore else ""}'
        '【输出格式】严格如下 JSON（不要 markdown，不要多余文字）：\n'
        '{\n'
        f'  "event_id": "agent_{trig_type}_简短英文标识",\n'
        '  "title": "事件标题(6-14字)",\n'
        '  "delivery": "immediate",\n'
        '  "fire_conditions": {},\n'
        '  "reason": "一句话说明编排动机",\n'
        '  "nodes": {\n'
        '    "start": "intro",\n'
        '    "map": {\n'
        '      "intro": {"npc":"...","choices":[{"text":"...","goto":"accept"}]},\n'
        '      "accept": {"effects":[{"money":-100}],"npc":"...","end":true}\n'
        '    }\n'
        '  }\n'
        '}'
    )

    logger.info(f'事件编排请求: type={trig_type}, player={pname}, level={plevel}')
    try:
        content, _ = call_deepseek(system_prompt, user_prompt, temperature=0.9, max_tokens=1600, call_type='event')
        spec = _normalize_event(_parse_json_object(content))
        logger.info(f'事件编排成功: {spec["event_id"]} ({spec["title"]})')
        return jsonify(spec)
    except Exception as e:
        logger.error(f'事件编排失败: {e}，使用降级事件')
        return jsonify(_fallback_event()), 200
