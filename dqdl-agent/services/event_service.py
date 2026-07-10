"""
场景事件服务：事件规格校验 + 降级方案。

校验 AI 生成的事件节点图（nodes.map）是否合法，剔除 effect 白名单外的 key，
钳制数值。AI 失败时用内置降级事件。
纯函数，无 LLM/网络依赖（便于测试）。
"""
import random

# 与后端 EffectRegistry 注册的 key 保持一致；prompt 与校验都引用此清单。
EVENT_EFFECT_KEYS = [
    'money', 'giveItem', 'forgeTask', 'createTask',
    'startBattle', 'grantCultivation', 'triggerEncounter', 'movePlayer',
]


def _normalize_event(obj):
    """校验并补全事件规格：必须有 title/nodes；nodes 必须是合法节点图；
    剔除 effect 白名单之外的 key；钳制数值。结构不合法抛 ValueError（由调用方走降级）。"""
    if not isinstance(obj, dict):
        raise ValueError('event 规格非对象')
    title = str(obj.get('title', '')).strip()
    if not title:
        raise ValueError('title 缺失')
    title = title[:64]

    event_id = str(obj.get('event_id') or '').strip()
    if not event_id:
        event_id = f'agent_{random.randint(10000, 99999)}'

    nodes = obj.get('nodes')
    if not isinstance(nodes, dict) or not isinstance(nodes.get('map'), dict):
        raise ValueError('nodes.map 缺失')
    start = nodes.get('start')
    if not start or start not in nodes['map']:
        raise ValueError('nodes.start 节点不存在')

    # 校验并清洗每个节点
    cleaned_map = {}
    for nid, node in nodes['map'].items():
        if not isinstance(node, dict):
            raise ValueError(f'节点 {nid} 非对象')
        new_node = {}
        if isinstance(node.get('npc'), str):
            new_node['npc'] = node['npc'][:600]
        if isinstance(node.get('end'), bool):
            new_node['end'] = node['end']
        if isinstance(node.get('choices'), list):
            new_node['choices'] = [_normalize_choice(c) for c in node['choices'] if isinstance(c, dict)]
        if isinstance(node.get('effects'), list):
            new_node['effects'] = [_normalize_effect(e) for e in node['effects'] if isinstance(e, dict)]
        if isinstance(node.get('roll'), list):
            new_node['roll'] = [
                {'weight': max(1, int(r.get('weight', 1))), 'goto': str(r.get('goto', ''))}
                for r in node['roll'] if isinstance(r, dict) and r.get('goto')
            ]
        # 战斗节点的胜负跳转目标（仅保留字符串 goto，长度限制）
        for k in ('win', 'lose', 'flee'):
            v = node.get(k)
            if isinstance(v, str) and v.strip():
                new_node[k] = v.strip()[:32]
        cleaned_map[nid] = new_node

    nodes_out = {'start': start, 'map': cleaned_map}

    delivery = str(obj.get('delivery') or 'immediate')
    if delivery not in ('immediate', 'enter_location', 'condition_met'):
        delivery = 'immediate'

    return {
        'event_id': event_id,
        'title': title,
        'nodes': nodes_out,
        'delivery': delivery,
        'fire_conditions': obj.get('fire_conditions') if isinstance(obj.get('fire_conditions'), dict) else {},
        'reason': str(obj.get('reason') or '')[:200],
    }


def _normalize_choice(c):
    """清洗选项：保留 text/goto/require，require 仅保留 money 字段并夹紧"""
    out = {'text': str(c.get('text', ''))[:80], 'goto': str(c.get('goto', ''))}
    if not out['goto']:
        out['goto'] = 'leave'
    req = c.get('require')
    if isinstance(req, dict):
        m = req.get('money')
        # bool 不是合法 money（isinstance(True,int) 为真，需排除）
        if isinstance(m, bool):
            m = None
        if isinstance(m, (int, float)):
            out['require'] = {'money': max(0, min(1000000, int(m)))}
    return out


def _normalize_effect(eff):
    """清洗单条 effect：只保留白名单内第一个 key，并按 key 钳制数值。
    与后端 EffectRegistry.runAll 的"取首个 key"语义保持一致。"""
    for key in EVENT_EFFECT_KEYS:
        if key in eff and eff[key] is not None:
            return {key: _clamp_effect_value(key, eff[key])}
    return {}  # 全部非法则丢弃（返回空对象，调用方会过滤）


def _clamp_effect_value(key, val):
    if key == 'money':
        if isinstance(val, bool):
            return 0
        if isinstance(val, (int, float)):
            return max(-1000000, min(1000000, int(val)))
        return 0
    if key == 'giveItem':
        if not isinstance(val, dict):
            return {'name': '一阶回春丹', 'count': 1}
        return {
            'name': str(val.get('name', '一阶回春丹'))[:32],
            'count': max(1, min(99, int(val.get('count', 1) or 1))),
        }
    if key == 'forgeTask':
        return True if val else False
    if key == 'createTask':
        if not isinstance(val, dict):
            return {'name': '神秘委托', 'desc': '', 'target': [], 'reward': []}
        return {
            'name': str(val.get('name', '神秘委托'))[:32],
            'desc': str(val.get('desc', ''))[:200],
            'target': val.get('target', []) if isinstance(val.get('target'), list) else [],
            'reward': val.get('reward', []) if isinstance(val.get('reward'), list) else [],
            'star': max(1, min(5, int(val.get('star', 1) or 1))),
        }
    if key == 'startBattle':
        # 两种合法格式：
        #  ① {mobId:"WB-001"}            引用图鉴魔兽
        #  ② {name,level,power,intelligence,quick,stamina,description?}  agent 生成的对手(NPC/魔兽)
        if not isinstance(val, dict):
            return {'mobId': str(val)[:32] if val else ''}
        if val.get('mobId'):
            return {'mobId': str(val['mobId'])[:32]}
        # agent 生成的对手：保留属性字段，数值夹紧
        return {
            'name': str(val.get('name', '神秘对手'))[:32],
            'description': str(val.get('description', ''))[:200],
            'level': max(1, min(99, int(val.get('level', 1) or 1))),
            'power': max(0, min(99999, int(val.get('power', 0) or 0))),
            'intelligence': max(0, min(99999, int(val.get('intelligence', 0) or 0))),
            'quick': max(0, min(99999, int(val.get('quick', 0) or 0))),
            'stamina': max(0, min(99999, int(val.get('stamina', 0) or 0))),
        }
    if key == 'grantCultivation':
        if isinstance(val, dict):
            amt = val.get('amount', 0)
        else:
            amt = val
        if isinstance(amt, bool):
            amt = 0
        return {'amount': max(-100000, min(100000, int(amt) if isinstance(amt, (int, float)) else 0))}
    if key == 'triggerEncounter':
        return {'force': True}
    if key == 'movePlayer':
        pos = val.get('position', []) if isinstance(val, dict) else val
        if not isinstance(pos, list):
            pos = []
        return {'position': [int(x) for x in pos if isinstance(x, (int, float)) and not isinstance(x, bool)][:20]}
    return val


def _fallback_event():
    """降级事件规格（agent 失败时）：一个安全的"路遇散修"奇遇，仅含小额金钱与对话。"""
    return {
        'event_id': f'agent_fallback_{random.randint(10000, 99999)}',
        'title': '路遇散修',
        'nodes': {
            'start': 'meet',
            'map': {
                'meet': {
                    'npc': '一位云游散修与你擦肩而过，颔首致意后便匆匆离去，地上似落着一小袋金币。',
                    'choices': [
                        {'text': '捡起来', 'goto': 'take'},
                        {'text': '不贪小便宜，离开', 'goto': 'leave'},
                    ],
                },
                'take': {
                    'effects': [{'money': 200}],
                    'npc': '你拾起钱袋，里头约有二百金币。',
                    'end': True,
                },
                'leave': {
                    'npc': '你没有理会，继续赶路。',
                    'end': True,
                },
            },
        },
        'delivery': 'immediate',
        'fire_conditions': {},
        'reason': 'agent 不可用时的降级事件',
    }
