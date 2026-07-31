"""
佣兵任务文案生成路由：POST /generate/task-adventurer

设计原则：与 training/encounter 一致——agent 是无状态 LLM 网关，不查任何业务数据。
任务上下文（玩家/地点/怪/数量）全部由 server 预填进请求体，agent 仅生成文案。

生成三段文案：任务标题(name)、整条任务描述(description)、单目标描述(target_desc)。
server 拿到后写入 task 表；本路由失败时返回 200 + 空字段，server 端见空即走模板兜底。
"""
import json
from flask import Blueprint, request, jsonify
from llm_client import call_deepseek
from utils import _parse_json_object

bp = Blueprint('task_adventurer', __name__)

# 危险度 → 文本标签
_DANGER_LABEL = {1: '一阶', 2: '二阶', 3: '三阶'}


@bp.route('/generate/task-adventurer', methods=['POST'])
def generate_task_adventurer():
    """
    佣兵任务文案生成。上下文由 server 预填。
    Body: {
        player: { name, level },
        wild: { name, description, danger_level },
        mob: { mob_id, name, rank },
        killCount: number,
        star: number,
    }
    Returns: { name, description, target_desc }
    """
    data = request.get_json(force=True)
    player = data.get('player', {})
    wild = data.get('wild', {})
    mob = data.get('mob', {})
    kill_count = data.get('killCount', 0)
    star = data.get('star', 1)

    player_name = player.get('name', '旅行者')
    wild_name = wild.get('name', '未知之地')
    mob_name = mob.get('name', '魔兽')
    danger_label = _DANGER_LABEL.get(star, '')
    rank = mob.get('rank') or danger_label or '未知'

    system_prompt = (
        '你是斗气大陆佣兵公会的任务发布官，负责撰写悬赏委托文案。'
        '文字风格参考斗破苍穹小说，古朴简练、带江湖气，但不啰嗦。'
        '必须输出JSON格式，包含三个字段：'
        '{"name":"任务标题","description":"整条任务描述","target_desc":"单目标描述"}。'
        '要求：'
        'name 是 4-8 字的任务标题（如"猎杀·焰尾蜥"），不要带书名号；'
        'description 和 target_desc 中，地点名用 <span style="color: green">地点名</span> 包裹，'
        '魔兽名用 <span style="color: #e77800">魔兽名</span> 包裹，其余文字不加 span；'
        'description 不超过80字（含span标签），说明去哪、做什么、完成后去哪交付；'
        'target_desc 必须包含地点名和魔兽名，格式固定为"前往<地点名>击杀<魔兽名>"，'
        '不要加任何修饰性形容词（如"暗影中滑翔的""凶猛的"等），只保留地名+动作+怪物名。'
        '只输出JSON，不要输出任何其他内容。'
    )
    user_prompt = (
        f'【发布对象】佣兵公会委托（接取人：{player_name}）\n'
        f'【任务地点】{wild_name} - {wild.get("description", "")}\n'
        f'【目标魔兽】{mob_name}（{rank}）\n'
        f'【击杀数量】{kill_count} 只\n'
        f'【危险度】{danger_label}魔兽\n'
        f'\n请按JSON格式生成该悬赏委托的文案。'
        f'target_desc 必须是"前往{wild_name}击杀{mob_name}"这种格式（地名绿、怪物名橙），不要加修饰词。'
    )

    # 兜底文案（LLM 失败或返回无效时用，同样带 HTML 高亮）
    fallback = {
        'name': f'猎杀·{mob_name}',
        'description': f'前往<span style="color: green">{wild_name}</span>，击杀<span style="color: #e77800">{mob_name}</span>{kill_count}只（完成后回佣兵公会与接待员交谈交付）',
        'target_desc': f'前往<span style="color: green">{wild_name}</span>击杀<span style="color: #e77800">{mob_name}</span>',
    }

    try:
        raw, _ = call_deepseek(
            system_prompt, user_prompt,
            temperature=0.9, max_tokens=300, call_type='task',
        )
        try:
            result = _parse_json_object(raw)
        except (json.JSONDecodeError, ValueError):
            return jsonify(fallback)

        # 字段补全：缺失或空串用兜底值
        return jsonify({
            'name': (result.get('name') or '').strip() or fallback['name'],
            'description': (result.get('description') or '').strip() or fallback['description'],
            'target_desc': (result.get('target_desc') or '').strip() or fallback['target_desc'],
        })
    except Exception as e:
        import traceback
        print(f'[TaskAdventurer ERROR] {e}')
        traceback.print_exc()
        return jsonify(fallback)
