"""
用DeepSeek API批量生成材料描述，分批调用
"""
import json, os, time, requests

DEEPSEEK_API_KEY = os.environ.get('DEEPSEEK_API_KEY', 'os.environ.get("DEEPSEEK_API_KEY", "")')
DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

# 加载材料数据
with open('material_data.json', 'r', encoding='utf-8') as f:
    materials = json.load(f)

print(f"共 {len(materials)} 条材料需要生成描述")

SYSTEM_PROMPT = """你是一个玄幻RPG游戏的世界观设定师。你需要为魔兽掉落材料生成简洁的描述。
规则：
1. 描述必须是一句话，说明材料的用途或特性
2. 参考材料名称和来源魔兽来推断用途
3. 风格：玄幻武侠风，简洁有力
4. 不要加引号或标点结尾，纯文本
5. 示例：焰鳞片 → 制作低阶火抗护甲的材料
6. 示例：冰蛙皮 → 可制成低阶冰系防具的皮料
7. 示例：雷纹豹皮 → 铭刻雷电符文的优质皮料"""

def generate_descriptions_batch(batch):
    items_text = '\n'.join([
        f"- {m['name']}（来源：{', '.join(s['name'] for s in m['source_mobs'][:3])}）"
        for m in batch
    ])
    user_msg = f"请为以下材料各生成一句描述：\n{items_text}\n\n请严格按以下格式输出，每行一条：\n材料名|描述"
    try:
        resp = requests.post(
            f'{DEEPSEEK_BASE_URL}/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {DEEPSEEK_API_KEY}',
                'Content-Type': 'application/json',
            },
            json={
                'model': 'deepseek-chat',
                'messages': [
                    {'role': 'system', 'content': SYSTEM_PROMPT},
                    {'role': 'user', 'content': user_msg},
                ],
                'temperature': 0.7,
                'max_tokens': 2000,
            },
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        text = data['choices'][0]['message']['content']
        result = {}
        for line in text.strip().split('\n'):
            line = line.strip()
            if '|' in line:
                parts = line.split('|', 1)
                name = parts[0].strip()
                desc = parts[1].strip()
                result[name] = desc
        return result
    except Exception as ex:
        print(f"  API调用失败: {ex}")
        return {}


BATCH_SIZE = 20
all_descriptions = {}
total_batches = (len(materials) + BATCH_SIZE - 1) // BATCH_SIZE

cache_file = 'material_descriptions.json'
if os.path.exists(cache_file):
    with open(cache_file, 'r', encoding='utf-8') as f:
        all_descriptions = json.load(f)
    print(f"已加载缓存: {len(all_descriptions)} 条描述")

for i in range(0, len(materials), BATCH_SIZE):
    batch = materials[i:i+BATCH_SIZE]
    need_gen = [m for m in batch if m['name'] not in all_descriptions]
    if not need_gen:
        continue

    batch_num = i // BATCH_SIZE + 1
    print(f"批次 {batch_num}/{total_batches} ({len(need_gen)} 条)...", end=' ')

    descs = generate_descriptions_batch(need_gen)
    all_descriptions.update(descs)

    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump(all_descriptions, f, ensure_ascii=False, indent=2)

    got = len(descs)
    print(f"获得 {got} 条")

    if got < len(need_gen):
        for m in need_gen:
            if m['name'] not in all_descriptions:
                mob_names = ', '.join(s['name'] for s in m['source_mobs'][:2])
                all_descriptions[m['name']] = f'由{mob_names}等魔兽产出的炼制材料'
        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump(all_descriptions, f, ensure_ascii=False, indent=2)

    time.sleep(1)

print(f"\n共生成 {len(all_descriptions)} 条描述")

missing = [m['name'] for m in materials if m['name'] not in all_descriptions]
if missing:
    print(f"缺失 {len(missing)} 条，补充默认描述")
    for m in materials:
        if m['name'] not in all_descriptions:
            mob_names = ', '.join(s['name'] for s in m['source_mobs'][:2])
            all_descriptions[m['name']] = f'由{mob_names}等魔兽产出的炼制材料'
    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump(all_descriptions, f, ensure_ascii=False, indent=2)

print("描述生成完成!")
