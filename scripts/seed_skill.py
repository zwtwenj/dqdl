"""
种子数据：斗技
"""
import pymysql
import json

conn = pymysql.connect(
    host='os.environ.get("DB_HOST", "127.0.0.1")', port=3306,
    user='root', password='os.environ.get("DB_PASSWORD", "")',
    database='dqdl', charset='utf8mb4',
    autocommit=True
)
cur = conn.cursor()

cur.execute('TRUNCATE TABLE skill')

skills = [
    # (name, description, base_damage, attr, scaling_list, rank, max_level, target_effects, self_effects)
    ('八极崩',
     '玄阶中级斗技，近身攻击斗技，以攻击力强横著称，炼至大成，攻击暗含八重劲气，八重叠加，威力堪比地阶低级斗技！',
     10, 'power', [1.2, 1.4, 1.6, 1.8, 2.0], 32, 5,
     ['内伤', '虚弱'], ['刚猛']),

    ('焰分噬浪尺',
     '地阶低级斗技，萧炎自创的招牌斗技。以玄重尺为媒介，凝聚火焰之力，一尺劈下，焰浪翻涌，尺芒所过之处，寸草不生。',
     15, 'power', [1.4, 1.6, 1.9, 2.2, 2.5], 21, 5,
     ['灼烧', '破甲'], ['火焰附体']),

    ('三千雷动',
     '地阶低级身法斗技，风雷阁不传之秘。修炼至大成，身形如电，瞬息千里，可在战斗中占尽先机。',
     5, 'quick', [1.0, 1.2, 1.5, 1.8, 2.2], 21, 5,
     ['麻痹'], ['闪避', '迅捷']),

    ('吸掌',
     '玄阶低级斗技，炼至大成，可吸千斤巨石，若是遇敌，狂猛吸力，能将人血液扯出。',
     8, 'intelligence', [1.0, 1.3, 1.5, 1.8, 2.0], 33, 5,
     ['牵引', '减速'], ['强控']),

    ('吹火掌',
     '玄阶低级斗技，与吸掌配套的斗技。双掌齐出，狂风大作，火焰借风势更盛。',
     8, 'intelligence', [1.0, 1.2, 1.4, 1.7, 2.0], 33, 5,
     ['击退'], ['火势']),

    ('狮虎碎金吟',
     '玄阶高级声波斗技，狮虎齐啸，万兽臣服！声波如实质般扩散，直击灵魂深处。',
     12, 'intelligence', [1.2, 1.5, 1.7, 2.0, 2.3], 31, 5,
     ['眩晕', '震慑'], ['威慑']),

    ('玄冰龙翔',
     '玄阶高级斗技，冰属性攻击斗技。凝聚寒气化为冰龙，所过之处，万物冻结。',
     12, 'intelligence', [1.3, 1.5, 1.8, 2.1, 2.4], 31, 5,
     ['冰冻', '减速'], ['冰甲']),

    ('风卷尘生',
     '黄阶高级斗技，风属性攻击斗技。以自身斗气引动天地风势，形成狂暴的龙卷风，席卷战场。',
     6, 'quick', [0.9, 1.1, 1.4, 1.6, 1.9], 41, 5,
     ['撕裂'], ['轻盈']),

    ('铁山拳',
     '黄阶中级斗技，土属性近身斗技。汇聚大地之力于双拳，一拳击出，如山岳崩摧。',
     8, 'stamina', [1.0, 1.2, 1.5, 1.7, 2.0], 42, 5,
     ['眩晕'], ['石化皮肤', '坚韧']),

    ('水龙卷',
     '黄阶中级斗技，水属性攻击斗技。凝聚水汽化为旋转的水龙，冲击敌人。',
     7, 'intelligence', [1.0, 1.2, 1.4, 1.7, 1.9], 42, 5,
     ['潮湿'], ['水盾']),

    ('火云掌',
     '黄阶高级斗技，火属性攻击斗技。双掌凝聚火焰，一掌拍出，火云蔽日。',
     8, 'power', [1.1, 1.3, 1.5, 1.8, 2.1], 41, 5,
     ['灼烧'], ['火势']),

    ('雷霆一击',
     '黄阶高级斗技，雷属性近身斗技。将雷属性斗气压缩于掌心，瞬间爆发，雷霆万钧。',
     9, 'power', [1.1, 1.3, 1.6, 1.9, 2.2], 41, 5,
     ['麻痹', '破甲'], ['雷速']),
]

count = 0
for name, desc, dmg, attr, scaling, rank, max_lv, teff, seff in skills:
    cur.execute(
        "INSERT INTO skill (name, description, base_damage, attr, scaling, rank, level, max_level, target_effects, self_effects) VALUES (%s, %s, %s, %s, %s, %s, 1, %s, %s, %s)",
        (name, desc, dmg, attr, json.dumps(scaling, ensure_ascii=False), rank, max_lv,
         json.dumps(teff, ensure_ascii=False) if teff else None,
         json.dumps(seff, ensure_ascii=False) if seff else None)
    )
    count += 1
    print(f'  + {name} ({attr}) rank={rank} max_lv={max_lv}')

conn.close()
print(f'\nDone! 插入 {count} 条斗技')
