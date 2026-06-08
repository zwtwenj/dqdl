"""
清空旧数据 + 重新 seed（seed 范围 0-10000）
"""
import pymysql
import random

conn = pymysql.connect(
    host='os.environ.get("DB_HOST", "127.0.0.1")', port=3306,
    user='root', password='os.environ.get("DB_PASSWORD", "")',
    database='dqdl', charset='utf8mb4',
    autocommit=True
)
cur = conn.cursor()

print('清空旧数据...')
cur.execute('SET FOREIGN_KEY_CHECKS=0')
cur.execute('TRUNCATE TABLE location')
cur.execute('TRUNCATE TABLE location_gen_rule')
cur.execute('SET FOREIGN_KEY_CHECKS=1')
print('  done')

# 固定节点
print('插入固定节点...')
fixed = [
    ('斗气大陆', 'continent', 0, 0, '斗气大陆，强者为尊的世界', None, str(random.randint(0, 10000))),
    ('西北区域', 'region', 1, 0, '斗气大陆西北方，位置偏僻但势力盘根错节', None, str(random.randint(0, 10000))),
    ('中州', 'region', 1, 0, '斗气大陆最繁华的核心区域，强者云集', None, str(random.randint(0, 10000))),
    ('黑角域', 'region', 1, 0, '斗气大陆最混乱的三不管地带', None, str(random.randint(0, 10000))),
    ('隐秘空间界', 'region', 1, 0, '远古八族等顶级势力隐居的独立空间', None, str(random.randint(0, 10000))),
]

# 插入根节点
cur.execute(
    'INSERT INTO location (name, loc_type, depth, danger_level, description, parent_id, seed, is_fixed, is_expanded) VALUES (%s,%s,%s,%s,%s,%s,%s,1,1)',
    fixed[0]
)
continent_id = cur.lastrowid
print(f'  斗气大陆 id={continent_id}')

# 插入区域
for f in fixed[1:]:
    cur.execute(
        'INSERT INTO location (name, loc_type, depth, danger_level, description, parent_id, seed, is_fixed, is_expanded) VALUES (%s,%s,%s,%s,%s,%s,%s,1,0)',
        (f[0], f[1], f[2], f[3], f[4], continent_id, f[6])
    )
    print(f'  {f[0]} id={cur.lastrowid}')

# 生成规则（和 seed.ts 一致，但通过 SQL）
print('插入生成规则...')
rules = [
    (2, 'empire', 2, 5, '帝国/王国名，参考中国古代诸侯国名', '1-3',
     '每个帝国应该有独特特色（军事/商业/中立/神秘）。',
     '你是斗气大陆的世界观设计师。请为"{parent_name}"区域生成{count}个帝国或大型势力范围。\n\n【严格约束】\n- 名称必须是中文，风格：{naming_style}\n- 每个帝国必须包含：名称、类型、一句话描述、势力特征\n- 必须符合斗气大陆的世界观（修炼体系、强者为尊）\n- {forbidden}\n- {world_constraints}\n\n【输出格式】只输出JSON数组\n[\n  {\n    "name": "帝国名",\n    "loc_type": "empire",\n    "description": "一句话描述这个帝国的特色",\n    "danger_level": 1,\n    "tags": ["军事型/商业型/中立型/神秘型"]\n  }\n]'),
    (3, 'mixed', 3, 7, '城市、山脉、宗派、秘境名', '1-6',
     '必须包含至少1个城市、1个野外、1个宗派或秘境。类型分布：city/wild/sect/secret。',
     '你是斗气大陆的世界观设计师。请为"{parent_name}"（{parent_description}）生成{count}个地点。\n\n【地点类型】每个地点必须是以下之一：\n- city: 城市（有人聚居、有交易）\n- wild: 野外（魔兽栖息、危险但有资源）\n- sect: 宗派驻地（势力总部）\n- secret: 秘境/遗迹（特殊地点，稀有）\n\n【严格约束】\n- 名称必须符合斗气大陆仙侠风格\n- 至少包含1个city类型和1个wild类型\n- 危险等级范围：{danger_range}\n- {forbidden}\n\n【输出格式】只输出JSON数组\n[\n  {\n    "name": "地点名",\n    "loc_type": "city/wild/sect/secret",\n    "description": "一句话描述",\n    "danger_level": 1,\n    "available_actions": ["buy","sell","quest","train","fight","explore"],\n    "tags": ["特色标签"]\n  }\n]'),
    (4, 'district', 2, 5, '区域内景点名，如坊市、佣兵公会、药材商行、修炼场', '1-8',
     '区域类型要与父节点匹配：城市内是功能区域，野外内是地貌区域，宗派内是功能区域。',
     '你是斗气大陆的世界观设计师。请为"{parent_name}"（{parent_description}）生成{count}个内部区域。\n\n【区域类型】根据父节点类型选择：\n城市(city)内部：坊市、佣兵公会、拍卖场、药材商行、家族宅邸、地下黑市、城主府、修炼场\n野外(wild)内部：入口区、深处、核心区、隐藏洞穴、稀有资源点、瀑布、古树群\n宗派(sect)内部：外门、内门、藏经阁、练功场、长老殿、丹房、禁地\n秘境(secret)内部：前厅、核心区域、守护者区域、宝物室、迷宫通道\n\n【严格约束】\n- 至少包含1个功能性区域（可交易/接任务/修炼）\n- 区域类型必须与父节点匹配\n- {forbidden}\n\n【输出格式】只输出JSON数组\n[\n  {\n    "name": "区域名",\n    "loc_type": "district",\n    "description": "一句话描述",\n    "danger_level": 1,\n    "available_actions": ["buy","sell","quest","train","fight","explore","rest"],\n    "tags": ["标签"]\n  }\n]'),
    (5, 'scene', 2, 4, '具体场景名，如某个摊位、某个房间、某棵树旁', '3-10',
     '场景是最细粒度的地点，应该有具体的交互对象。',
     '你是斗气大陆的世界观设计师。请为"{parent_name}"（{parent_description}）生成{count}个具体场景。\n\n【场景是最细粒度的地点】\n每个场景应该有具体的交互对象或事件触发点。\n\n【严格约束】\n- 场景名称要具体，如"悬赏牌前"、"炼药炉旁"、"密林深处"\n- 每个场景应该暗示可能的交互\n- {forbidden}\n\n【输出格式】只输出JSON数组\n[\n  {\n    "name": "场景名",\n    "loc_type": "scene",\n    "description": "一句话描述",\n    "danger_level": 1,\n    "available_actions": ["buy","sell","quest","train","fight","explore","rest","gather"],\n    "tags": ["标签"]\n  }\n]'),
]

for r in rules:
    cur.execute(
        'INSERT INTO location_gen_rule (depth, loc_type, min_children, max_children, naming_style, danger_range, world_constraints, gen_prompt) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',
        r
    )
    print(f'  depth={r[0]} ({r[1]})')

conn.close()
print('\nDone! 数据已重置，seed 范围 0-10000')
