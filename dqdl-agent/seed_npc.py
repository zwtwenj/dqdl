"""
种子数据：NPC 性格 + 职能
"""
import os
import pymysql
import json

conn = pymysql.connect(
    host=os.environ.get('DB_HOST', '127.0.0.1'), port=3306,
    user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''),
    database=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4',
    autocommit=True
)
cur = conn.cursor()

# ========== 清空 ==========
cur.execute('SET FOREIGN_KEY_CHECKS=0')
cur.execute('TRUNCATE TABLE nature')
cur.execute('TRUNCATE TABLE npc_role')
cur.execute('TRUNCATE TABLE static_npc')
cur.execute('SET FOREIGN_KEY_CHECKS=1')

# ========== 性格 ==========
print('插入性格...')
natures = [
    ('豪爽', '说话直来直去，热情大方，喜欢拍肩膀、大笑，常用"哈哈哈"、"兄弟"等词'),
    ('冷淡', '言简意赅，不主动搭话，回答简短冷淡，偶有深意的话语'),
    ('精明', '说话圆滑，善于察言观色，处处暗示利益，喜欢讨价还价'),
    ('温和', '说话轻声细语，耐心友善，常用敬语，关心他人'),
    ('暴躁', '说话急躁，容易发怒，动不动就骂人，但可能心不坏'),
    ('神秘', '说话模棱两可，喜欢暗示和隐语，经常意味深长地微笑'),
    ('谄媚', '对强者阿谀奉承，对弱者爱答不理，见风使舵'),
    ('古板', '说话一板一眼，守规矩，讲究秩序，不苟言笑'),
]
for name, hint in natures:
    cur.execute('INSERT INTO nature (name, prompt_hint) VALUES (%s, %s)', (name, hint))
    print(f'  + {name}')

# ========== 职能 ==========
print('\n插入职能...')
# required_in_loc_type 存的是 location_scene.scene_type 代码（非中文名）：
#   guild=佣兵公会 / market=坊市 / alchemy=炼药师公会 / auction=拍卖行 / ...
# 这样 LocationNetService 按 scene_type 匹配必生 NPC 时能直接命中。
roles = [
    # (name, prompt_hint, required_in_loc_type JSON)
    ('公会接待员',
     '你负责接待佣兵，介绍任务、解答规则、处理任务接取和交付。',
     ['guild']),

    ('坊市管理员',
     '你管理坊市的摊位秩序，处理纠纷，提供商品信息和价格参考。',
     ['market']),

    ('拍卖师',
     '你是拍卖行的主持拍卖师，负责介绍拍品、引导竞价、渲染气氛。',
     ['auction']),

    ('炼药师',
     '你是炼药师公会的驻场药师，可以鉴定丹药、出售丹方、指点炼药技巧。',
     ['alchemy']),

    ('铁匠',
     '你是铁匠铺的师傅，擅长打造和修理武器，可以镶嵌魔核强化装备。',
     ['铁匠铺']),

    ('药材商',
     '你是药材商行的掌柜，熟悉各种草药的产地、功效和价格。',
     ['药材商行']),

    ('旅馆老板',
     '你是旅馆的掌柜，提供住宿、饮食、情报，偶尔也有任务线索。',
     ['旅馆']),

    ('修炼场教官',
     '你负责修炼场的日常管理，指导修炼技巧，出售功法残卷。',
     ['修炼场']),

    ('修炼室管理员',
     '你管理城中的修炼室，负责登记修炼者、安排修炼席位、收取修炼费用，并提供修炼相关的指引。',
     ['修炼室']),

    ('巡逻卫兵',
     '你是城中的巡逻卫兵，维护治安，可以提供方向指引和简单情报。',
     ['city']),

    ('路旁老者',
     '你是一个神秘的老者，似乎知道很多事情，偶尔会提供珍贵的线索。',
     ['wild']),
]
for name, hint, loc_types in roles:
    cur.execute(
        "INSERT INTO npc_role (name, prompt_hint, required_in_loc_type) VALUES (%s, %s, %s)",
        (name, hint, json.dumps(loc_types, ensure_ascii=False))
    )
    print(f'  + {name} → {loc_types}')

conn.close()
print('\nDone!')
