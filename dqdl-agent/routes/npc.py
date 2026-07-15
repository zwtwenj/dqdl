"""
NPC 生成路由：POST /generate/npc

按"场景 + 职能"生成一个符合斗破苍穹世界观的 NPC（姓名/性别/年龄/性格名）。
用于：城市新场景创建时，给该场景补一个职能对口的 NPC（如佣兵公会补公会接待员）。
姓名/性格由 LLM 生成，保证不同城市 NPC 不雷同；失败时 server 侧有随机兜底。
"""
import logging
from flask import Blueprint, request, jsonify
from llm_client import call_deepseek
from utils import _parse_json_object

logger = logging.getLogger('dqdl-agent.npc')
bp = Blueprint('npc', __name__)

# 性格白名单（须与 DB nature 表的 name 一致；超出范围由 server 校验/降级）
NATURE_POOL = ['豪爽', '阴沉', '热情', '冷淡', '精明', '憨厚', '高傲', '随和']


@bp.route('/generate/npc', methods=['POST'])
def generate_npc():
    """
    生成一个 NPC 的姓名/性别/年龄/性格。
    Body: {
        scene_name: str,        # 场景名，如「加玛城的佣兵公会」
        scene_type: str,        # 场景类型：market/guild/alchemy/...
        role_name: str,         # 职能名，如「公会接待员」「炼药师」
        role_hint: str,         # 职能身份描述（喂给 LLM 增加贴合度）
        city_name?: str         # 所属城市名（可选，增加姓名地域感）
    }
    Returns: { name, gender, age, nature }
    """
    data = request.get_json(force=True)
    scene_name = data.get('scene_name', '')
    scene_type = data.get('scene_type', '')
    role_name = data.get('role_name', '普通人')
    role_hint = data.get('role_hint', '')
    city_name = data.get('city_name', '')

    system_prompt = (
        '你是斗气大陆（斗破苍穹）世界观中的 NPC 起名/设定师。'
        '根据给定的场景与职能，生成一个贴合世界观的 NPC 基础设定。'
        '姓名要用古风/玄幻风格（不要现代名），符合斗气大陆文化。'
        '严格只输出 JSON，不要输出任何其他内容。'
    )
    city_line = f'所属城市：{city_name}。\n' if city_name else ''
    user_prompt = (
        f'请为以下场景生成一名 NPC 的基础设定：\n'
        f'【场景】{scene_name}（类型：{scene_type}）\n'
        f'{city_line}'
        f'【职能】{role_name} —— {role_hint}\n'
        '【要求】\n'
        f'- 姓名：2-3 字古风/玄幻中文姓名，符合该职能气质\n'
        '- 性别：男 或 女\n'
        '- 年龄段：少年/青年/中年/老年 之一\n'
        f'- 性格：从以下选一个最贴合该职能的：{"、".join(NATURE_POOL)}\n'
        '【输出格式】严格如下 JSON（不要 markdown，不要多余文字）：\n'
        '{\n'
        '  "name": "姓名",\n'
        '  "gender": "男",\n'
        '  "age": "中年",\n'
        '  "nature": "精明"\n'
        '}'
    )

    logger.info(f'NPC 生成请求: scene={scene_name}({scene_type}), role={role_name}')
    try:
        content, _ = call_deepseek(
            system_prompt, user_prompt,
            temperature=0.9, max_tokens=300, call_type='npc',
        )
        obj = _parse_json_object(content)
        result = _normalize_npc(obj)
        logger.info(f'NPC 生成成功: {result["name"]}（{result["gender"]}/{result["age"]}/{result["nature"]}）')
        return jsonify(result)
    except Exception as e:
        logger.error(f'NPC 生成失败：{e}')
        # 失败也返回 200 + 空对象，让 server 走随机兜底
        return jsonify(None), 200


def _normalize_npc(obj):
    """把 LLM 返回的 JSON 规范化到合法取值范围。"""
    if not isinstance(obj, dict):
        return None
    name = str(obj.get('name', '')).strip()
    gender = str(obj.get('gender', '')).strip()
    age = str(obj.get('age', '')).strip()
    nature = str(obj.get('nature', '')).strip()
    # 校验取值范围，非法则置空让 server 兜底
    if not name or len(name) > 8:
        name = ''
    if gender not in ('男', '女'):
        gender = ''
    if age not in ('少年', '青年', '中年', '老年'):
        age = ''
    if nature not in NATURE_POOL:
        nature = ''
    return {'name': name, 'gender': gender, 'age': age, 'nature': nature}
