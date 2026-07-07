"""
测试脚本：模拟玩家"前往坊市"场景
流程：加载RAG资料 -> 关键词匹配检索 -> 组装Prompt -> 调用DeepSeek -> 输出结果
"""

import os
import json
import random
from openai import OpenAI
from docx import Document
from dotenv import load_dotenv

# ========== 1. 加载配置 ==========
load_dotenv()
API_KEY = os.getenv("apikey")
client = OpenAI(api_key=API_KEY, base_url="https://api.deepseek.com")

# ========== 2. RAG：加载知识库 ==========
def load_rag_documents(rag_dir="rag"):
    docs = {}
    for filename in os.listdir(rag_dir):
        if filename.endswith(".docx"):
            path = os.path.join(rag_dir, filename)
            doc = Document(path)
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            docs[filename] = text
    return docs

def simple_rag_search(docs, keywords, max_chunks=3):
    scored = []
    for filename, text in docs.items():
        score = sum(1 for kw in keywords if kw in text)
        if score > 0:
            scored.append((score, filename, text))
    scored.sort(key=lambda x: x[0], reverse=True)
    results = []
    for score, filename, text in scored[:max_chunks]:
        results.append({"source": filename, "relevance": score, "content": text})
    return results

# ========== 3. 玩家状态 ==========
player_state = {
    "name": "萧炎",
    "realm": "斗者",
    "realm_rank": "三星",
    "attributes": {
        "力量": 10, "敏捷": 8, "精神": 12,
        "智力": 5, "体质": 7, "运气": 3
    },
    "hp": 100,
    "mp": 50,
    "inventory": ["玄重尺", "回气丹x5", "破旧的地图碎片"],
    "skills": ["八极崩", "紫云翼"],
    "current_location": "萧家",
    "gold": 120,
}

# ========== 4. 事件模板池 ==========
market_events = [
    {
        "id": "evt_market_001",
        "type": "encounter_npc",
        "weight": 30,
        "template": "在坊市的{corner}处，你注意到一个{trait}的{identity}",
        "variants": [
            {"corner": "角落摊位旁", "trait": "衣衫褴褛、举止怪异", "identity": "老乞丐"},
            {"corner": "药材铺门口", "trait": "锦衣华服、态度倨傲的", "identity": "加列家族子弟"},
            {"corner": "通道尽头", "trait": "面容沧桑、眼神锐利的", "identity": "中年佣兵"},
            {"corner": "一排商铺前", "trait": "神色匆匆、怀里紧抱着什么的", "identity": "年轻散修"},
        ],
        "possible_hooks": ["隐藏高人", "触发支线", "交换情报"],
    },
    {
        "id": "evt_market_002",
        "type": "discover_item",
        "weight": 20,
        "template": "一个不起眼的摊位上{display}着一件{item}",
        "variants": [
            {"display": "混在一堆杂物中被当作废品出售", "item": "残破的功法卷轴"},
            {"display": "被随意摆放", "item": "一块隐约有温热感的灰色石头"},
            {"display": "和其他魔核混在一起", "item": "一枚色泽异常的魔核"},
        ],
        "possible_hooks": ["隐藏宝物", "触发任务"],
    },
    {
        "id": "evt_market_003",
        "type": "conflict",
        "weight": 25,
        "template": "前方传来一阵骚动，{situation}",
        "variants": [
            {"situation": "两名佣兵因争夺一枚魔核起了冲突，周围人纷纷后退"},
            {"situation": "一队挂着加列家族徽章的人正在强行压价收购药材"},
            {"situation": "一个看起来像是散修的年轻人被几个人围住勒索"},
        ],
    },
    {
        "id": "evt_market_none",
        "type": "none",
        "weight": 25,
        "template": "坊市一如既往地嘈杂忙碌，没有什么特别的事发生。",
        "variants": [{}],
    },
]

def roll_event(event_pool):
    total = sum(e["weight"] for e in event_pool)
    roll = random.randint(1, total)
    cumulative = 0
    for event in event_pool:
        cumulative += event["weight"]
        if roll <= cumulative:
            variant = random.choice(event["variants"])
            return event, variant
    return event_pool[-1], {}

# ========== 5. 组装 Prompt ==========
def build_player_summary(player):
    attrs = " ".join(f"{k}{v}" for k, v in player["attributes"].items())
    inv = ", ".join(player["inventory"])
    return (
        f"姓名：{player['name']}\n"
        f"境界：{player['realm']}（{player['realm_rank']}）\n"
        f"位置：{player['current_location']} -> 目标：城南坊市\n"
        f"HP：{player['hp']} | 斗气：{player['mp']} | 金币：{player['gold']}\n"
        f"属性：{attrs}\n"
        f"装备/背包：{inv}\n"
        f"技能：{', '.join(player['skills'])}"
    )

def build_prompt(player, rag_context, event, variant):
    if variant:
        event_text = event["template"].format(**variant)
    else:
        event_text = event["template"]

    hooks = event.get("possible_hooks", [])
    hooks_text = "、".join(hooks) if hooks else "自由发展"

    prompt = (
        "你是「斗气大陆」文字冒险游戏的叙事引擎。请根据以下信息，为玩家生成一段生动的场景描写。\n\n"
        "【严格约束 - 绝对不可违反】\n"
        "1. 所有内容必须严格符合斗气大陆（斗破苍穹）的世界观，绝对不允许出现任何不属于该世界的元素\n"
        "2. 必须遵守下面提供的知识库中的设定\n"
        "3. 不要替玩家做决定或选择\n"
        "4. 输出格式：场景描述（200-300字）+ 2-3个行动选项\n"
        "5. 保持第二人称（你）叙事\n\n"
        f"【世界观知识库（RAG检索结果）】\n{rag_context}\n\n"
        f"【当前事件】\n类型：{event['type']}\n事件骨架：{event_text}\n可能的发展方向：{hooks_text}\n\n"
        f"【玩家状态】\n{build_player_summary(player)}\n\n"
        "【输出要求】\n"
        "1. 以玩家从萧家出发、前往坊市的路上为开端，自然过渡到坊市场景\n"
        "2. 将事件骨架融入叙事，扩写为生动的场景描写\n"
        "3. 描写要体现坊市的环境氛围（参考知识库中的描述）\n"
        "4. 结尾给出2-3个行动选项，用【】标记\n"
        "5. 如果事件涉及NPC，给NPC设计合理的身份背景（必须符合斗气大陆设定）"
    )
    return prompt

# ========== 6. 主流程 ==========
def main():
    print("=" * 60)
    print("  斗气大陆文字冒险 - 坊市测试")
    print("=" * 60)

    # Step 1: 加载RAG资料
    print("\n[1] 加载RAG知识库...")
    docs = load_rag_documents()
    for name in docs:
        print(f"  + 已加载: {name} ({len(docs[name])} 字)")

    # Step 2: 检索与"坊市"相关的知识
    print("\n[2] RAG检索：关键词 = [坊市, 乌坦城, 势力]...")
    rag_results = simple_rag_search(docs, ["坊市", "乌坦城", "势力", "场景"])
    rag_context = "\n---\n".join(
        f"[来源: {r['source']}]\n{r['content']}" for r in rag_results
    )
    print(f"  + 检索到 {len(rag_results)} 条相关资料")

    # Step 3: 随机事件判定
    print("\n[3] 随机事件判定...")
    event, variant = roll_event(market_events)
    if event["type"] == "none":
        event_text = event["template"]
        print("  -> 未触发特殊事件（平静的一天）")
    else:
        event_text = event["template"].format(**variant) if variant else event["template"]
        print(f"  -> 触发事件: [{event['type']}] {event_text}")

    # Step 4: 组装Prompt
    print("\n[4] 组装Prompt...")
    prompt = build_prompt(player_state, rag_context, event, variant)
    print(f"  + Prompt总长度: ~{len(prompt)} 字符")

    # Step 5: 调用DeepSeek
    print("\n[5] 调用DeepSeek API...")
    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是斗气大陆文字冒险游戏的叙事引擎。严格遵循斗破苍穹世界观。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.85,
            max_tokens=800,
        )
        ai_output = response.choices[0].message.content
        print("  + API调用成功")

        # Step 6: 输出结果
        print("\n" + "=" * 60)
        print("  AI 输出结果")
        print("=" * 60)
        print(ai_output)
        print("=" * 60)

        # 输出元信息
        print(f"\n[元信息]")
        print(f"  触发事件类型: {event['type']}")
        print(f"  事件骨架: {event_text}")
        print(f"  Token用量: {response.usage.prompt_tokens}(输入) + {response.usage.completion_tokens}(输出)")

    except Exception as e:
        print(f"  x API调用失败: {e}")

if __name__ == "__main__":
    main()
