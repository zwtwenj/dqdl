"""
种子数据：对话事件（每个职业的快捷对话选项）
"""
import os
import pymysql

conn = pymysql.connect(
    host=os.environ.get('DB_HOST', '127.0.0.1'), port=3306,
    user=os.environ.get('DB_USER', 'root'), password=os.environ.get('DB_PASSWORD', ''),
    database=os.environ.get('DB_DATABASE', 'dqdl'), charset='utf8mb4',
    autocommit=True
)
cur = conn.cursor()

# 清空
cur.execute('TRUNCATE TABLE dialog_event')

# (role_name, text, event)  event 暂时全为空字符串
events = [
    # 公会接待员 (role_id=1)
    ('公会接待员', '我想要接取一些任务', '{"type":"createAdventurerTask"}'),
    ('公会接待员', '我完成了任务，来交付', '{"type":"completeTask"}'),
    ('公会接待员', '这里有什么难度的任务？', ''),
    ('公会接待员', '最近有什么特别的悬赏吗？', ''),

    # 坊市管理员 (role_id=2)
    ('坊市管理员', '我想交易一些东西', '{"type":"trade"}'),
    ('坊市管理员', '最近有什么稀罕的货物？', ''),
    ('坊市管理员', '有人在这卖假货，我要举报', ''),
    ('坊市管理员', '有没有什么捡漏的好东西？', ''),

    # 拍卖师 (role_id=3)
    ('拍卖师', '最近有什么拍卖品？', ''),
    ('拍卖师', '我想寄售一件物品', ''),
    ('拍卖师', '下一场拍卖什么时候开始？', ''),
    ('拍卖师', '有没有高阶武器或者功法？', ''),

    # 炼药师 (role_id=4)
    ('炼药师', '我想购买丹药', ''),
    ('炼药师', '能帮我鉴定这颗丹药吗？', ''),
    ('炼药师', '我想借用丹炉炼制丹药', ''),
    ('炼药师', '有没有出售丹方？', ''),

    # 铁匠 (role_id=5)
    ('铁匠', '我想打造一把武器', ''),
    ('铁匠', '能帮我修理一下装备吗？', ''),
    ('铁匠', '可以镶嵌魔核强化吗？', ''),
    ('铁匠', '你这里有什么好的材料？', ''),

    # 药材商 (role_id=6)
    ('药材商', '我需要买一些药材', ''),
    ('药材商', '这种草药大概什么价格？', ''),
    ('药材商', '有没有稀有药材？', ''),
    ('药材商', '能告诉我这株药材的产地吗？', ''),

    # 旅馆老板 (role_id=7)
    ('旅馆老板', '我要住店', ''),
    ('旅馆老板', '有什么吃的吗？', ''),
    ('旅馆老板', '最近听到什么消息了吗？', ''),
    ('旅馆老板', '城里有什么值得去的地方？', ''),

    # 修炼场教官 (role_id=8)
    ('修炼场教官', '我想借用修炼场', ''),
    ('修炼场教官', '有没有功法残卷出售？', ''),
    ('修炼场教官', '能指点我一些修炼技巧吗？', ''),

    # 修炼室管理员 (role_id=11)
    ('修炼室管理员', '我想要进行修炼', '{"type":"cultivationRoom"}'),
    ('修炼室管理员', '修炼室怎么收费？', ''),
    ('修炼室管理员', '有没有更高阶的修炼席位？', ''),

    # 巡逻卫兵 (role_id=9)
    ('巡逻卫兵', '请问城内有什么规矩？', ''),
    ('巡逻卫兵', '附近哪里比较危险？', ''),
    ('巡逻卫兵', '有人在城内闹事', ''),

    # 路旁老者 (role_id=10)
    ('路旁老者', '老先生，您知道些什么？', ''),
    ('路旁老者', '这附近有什么传说吗？', ''),
    ('路旁老者', '您能给我指条路吗？', ''),
]

# 先查 role_name -> role_id 映射
cur.execute("SELECT id, name FROM npc_role")
role_map = {row[1]: row[0] for row in cur.fetchall()}

count = 0
for role_name, text, event in events:
    role_id = role_map.get(role_name)
    if not role_id:
        print(f'  SKIP {role_name} (not found)')
        continue
    cur.execute(
        "INSERT INTO dialog_event (role_id, text, event) VALUES (%s, %s, %s)",
        (role_id, text, event)
    )
    count += 1
    print(f'  + [{role_name}] {text}')

conn.close()
print(f'\nDone! 插入 {count} 条对话事件')
