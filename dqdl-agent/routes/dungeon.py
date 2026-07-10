"""
箱庭副本生成路由：POST /generate/dungeon
"""
import random
from flask import Blueprint, request, jsonify
from llm_client import call_deepseek
from utils import _parse_json_object
from services.dungeon_service import DUNGEON_SCENES, _normalize_dungeon, _fallback_dungeon

bp = Blueprint('dungeon', __name__)


@bp.route('/generate/dungeon', methods=['POST'])
def generate_dungeon():
    """
    生成五幕箱庭副本蓝图
    Body: { scene_type?: string (山洞/密林/山谷/浅滩), player_level?: number }
    Returns: { title, scene_type, intro, acts: [{ index, type, title, narrative }] }
    """
    data = request.get_json(force=True)
    scene_type = data.get('scene_type') or random.choice(list(DUNGEON_SCENES.keys()))
    if scene_type not in DUNGEON_SCENES:
        scene_type = random.choice(list(DUNGEON_SCENES.keys()))
    scene_desc = DUNGEON_SCENES[scene_type]
    player_level = data.get('player_level')
    difficulty = data.get('difficulty') or 1
    tier_word = {1: '一阶', 2: '二阶', 3: '三阶'}.get(int(difficulty), '一阶')

    system_prompt = (
        '你是斗气大陆（斗破苍穹）世界观的箱庭副本设计师。'
        '负责设计一个由五幕组成的线性箱庭副本（类似地下城堡/杀戮尖塔的单人秘境）。'
        '严格遵循斗破苍穹世界观（斗气、魔兽、佣兵、丹药等），不要出现现实事物。'
        '只输出 JSON，不要输出任何其他内容。'
    )
    level_line = f'【玩家等阶参考】{player_level}（用于安排遭遇强度）\n' if player_level else ''
    difficulty_line = f'【副本难度】{int(difficulty)}星 —— 副本内只会出现{tier_word}魔兽、{tier_word}魔核等，不得出现更高或更低等阶的事物\n'
    user_prompt = (
        '请设计一个五幕箱庭副本。\n'
        f'【场景类型】{scene_type} —— {scene_desc}\n'
        f'{level_line}'
        f'{difficulty_line}'
        '【结构要求】\n'
        '- 共 5 幕，严格线性推进（第一幕 → 第二幕 → … → 第五幕）\n'
        '- 第五幕固定为 BOSS 战\n'
        '- 前四幕类型从以下选取并尽量多样：combat(战斗遭遇)、sneak(可战斗或绕过)、modifier(环境改变，如狭窄/黑暗/毒雾)、explore(探索风险/奖励)、item(发现散落的魔核等物品)\n'
        '- item 幕：描写发现宝物(如发光的魔核)的氛围与感官细节(光影/气息/声响)，营造发现的惊喜感，但不要写出具体物品名与数量（由系统按难度填入）\n'
        '- 每幕需有独立的标题和叙事文本（第二人称"你"，30-80字），描述玩家在此幕的遭遇\n'
        '【输出格式】严格如下 JSON（不要 markdown，不要多余文字）：\n'
        '{\n'
        f'  "title": "副本名称（6-12字，契合{scene_type}场景）",\n'
        f'  "scene_type": "{scene_type}",\n'
        '  "intro": "入口处引导叙事（第二人称，40-80字）",\n'
        '  "acts": [\n'
        '    {"index": 1, "type": "sneak", "title": "本幕标题", "narrative": "本幕叙事"},\n'
        '    {"index": 2, "type": "item", "title": "本幕标题", "narrative": "本幕叙事"},\n'
        '    {"index": 3, "type": "combat", "title": "本幕标题", "narrative": "本幕叙事"},\n'
        '    {"index": 4, "type": "explore", "title": "本幕标题", "narrative": "本幕叙事"},\n'
        '    {"index": 5, "type": "boss", "title": "本幕标题", "narrative": "本幕叙事"}\n'
        '  ]\n'
        '}'
    )

    bp.logger.info(f'副本生成请求: scene={scene_type}, level={player_level}, difficulty={difficulty}')
    try:
        content, _ = call_deepseek(system_prompt, user_prompt, temperature=0.95, max_tokens=1200, call_type='dungeon')
        blueprint = _normalize_dungeon(_parse_json_object(content), scene_type)
        bp.logger.info(f'副本生成成功: {blueprint["title"]} ({scene_type})')
        return jsonify(blueprint)
    except Exception as e:
        bp.logger.error(f'副本生成失败: {e}，使用降级方案')
        return jsonify(_fallback_dungeon(scene_type)), 200
