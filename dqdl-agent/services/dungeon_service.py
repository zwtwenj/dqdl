"""
箱庭副本服务：副本蓝图校验 + 降级方案。

校验 AI 生成的五幕结构是否完整，补全缺失字段；AI 失败时用内置降级蓝图。
纯函数，无 LLM/网络依赖（便于测试）。
"""

DUNGEON_SCENES = {
    '山洞': '幽深曲折的地下洞穴，石壁湿冷、光线昏暗，可能有石钟乳、地下河、狭窄甬道、岔路',
    '密林': '遮天蔽日的原始森林，藤蔓缠绕、兽吼鸟鸣，潮湿闷热，有古树、灌木丛、溪流',
    '山谷': '两侧峭壁夹峙的幽谷，云雾缭绕，谷底有乱石、溪流、回声震荡',
    '浅滩': '水波拍岸的河海浅滩，礁石密布、淤泥湿滑，潮汐涨落、水汽弥漫',
}


def _normalize_dungeon(bp, scene_type):
    """校验并补全副本蓝图，确保五幕结构完整"""
    VALID_TYPES = {'combat', 'sneak', 'modifier', 'explore', 'boss', 'item'}
    acts = bp.get('acts')
    if not isinstance(acts, list) or len(acts) < 5:
        raise ValueError('acts 缺失或不足 5 幕')
    norm_acts = []
    for i in range(5):
        a = acts[i] if i < len(acts) else {}
        t = str(a.get('type', 'combat'))
        if t not in VALID_TYPES:
            t = 'combat'
        if i == 4:
            t = 'boss'  # 第五幕强制 boss
        norm_acts.append({
            'index': i + 1,
            'type': t,
            'title': str(a.get('title', f'第{i + 1}幕'))[:32],
            'narrative': str(a.get('narrative', ''))[:300],
        })
    return {
        'title': str(bp.get('title', f'{scene_type}秘境'))[:32],
        'scene_type': scene_type,
        'intro': str(bp.get('intro', ''))[:300],
        'acts': norm_acts,
    }


def _fallback_dungeon(scene_type):
    """降级副本蓝图（AI 失败时）"""
    titles = {
        '山洞': '幽冥石洞', '密林': '迷雾密林',
        '山谷': '回声幽谷', '浅滩': '潮汐暗滩',
    }
    intros = {
        '山洞': '你拨开荆棘，发现一处幽深山洞，洞口隐隐传来低沉的喘息声。',
        '密林': '你踏入一片遮天蔽日的密林，四周静谧得有些诡异。',
        '山谷': '你沿着峭壁走入一道幽谷，谷底回荡着空旷的风声。',
        '浅滩': '你来到一片湿滑的浅滩，礁石间似有什么在游动。',
    }
    return {
        'title': titles.get(scene_type, f'{scene_type}秘境'),
        'scene_type': scene_type,
        'intro': intros.get(scene_type, f'你进入了一处{scene_type}。'),
        'acts': [
            {'index': 1, 'type': 'sneak', 'title': '入口守卫', 'narrative': f'你刚踏入{scene_type}，一个黑影挡住了去路。'},
            {'index': 2, 'type': 'modifier', 'title': '环境突变', 'narrative': f'前方的{scene_type}地势变得更加险恶。'},
            {'index': 3, 'type': 'combat', 'title': '深处遭遇', 'narrative': f'{scene_type}深处，一只凶兽正向你逼近。'},
            {'index': 4, 'type': 'explore', 'title': '岔路抉择', 'narrative': f'你发现{scene_type}中一处可疑的角落。'},
            {'index': 5, 'type': 'boss', 'title': '最终之敌', 'narrative': f'{scene_type}尽头，强敌现身，决一死战！'},
        ],
    }
