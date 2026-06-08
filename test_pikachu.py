"""
对比测试：自定义魔兽"皮卡丘"
测试三种策略下AI是否能正确理解自定义设定：
A. 无RAG（纯靠模型知识）
B. 简短RAG（只给名称和品阶）
C. 完整RAG + 知识覆盖声明 + Few-shot（三层防线）
"""

import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("apikey")
client = OpenAI(api_key=API_KEY, base_url="https://api.deepseek.com")

# ========== 自定义魔兽设定 ==========
CUSTOM_BEAST = {
    "name": "皮卡丘",
    "full_definition": """
【名称】皮卡丘
【分类】魔兽·火属性
【品阶】三阶（对应人类斗灵级别的战力）
【外观】体型如成年雄狮，通体覆盖赤红鳞甲，面部有两道雷纹状的金色纹路。尾部末端有一簇永不熄灭的赤焰，如同一面战旗。
【栖息地】魔兽山脉中层火山岩地带，喜高温环境。
【战斗方式】远距离喷射高温火焰（炎息吐息，温度可达1200度），近战以利爪和覆满鳞甲的尾巴横扫为主。
【弱点】下腹部鳞甲稀疏，水属性功法对其有克制效果。
【魔核】三阶火系魔核，市价约300金币，可用于炼制三品丹药「炎灵丹」。
【掉落物】皮卡丘赤鳞（上等防具锻造材料）、炎息囊（炼药辅料，可提升火属性丹药品质）。
【性情】领地意识极强，主动攻击进入其势力范围的任何人。独居，不群聚。
【体型】成年体长约2米，肩高1.2米，体重约180公斤。
【寿命】约50年。
【进阶】五阶时可进化为「雷焰皮卡丘」，体型翻倍，获得雷火双属性，极其罕见。
"""
}

PLAYER_INFO = "姓名：萧炎 | 境界：斗者（三星） | 位置：魔兽山脉外围"

SCENARIO = "你在魔兽山脉外围探索时，前方的灌木丛突然剧烈晃动，一只魔兽跳了出来——是一只皮卡丘。"

# ========== 三种测试策略 ==========

def test_a_no_rag():
    """策略A：无RAG，纯靠模型自身知识"""
    return {
        "label": "A. 无RAG（纯模型知识）",
        "system": "你是斗气大陆文字冒险游戏的叙事引擎。",
        "user": (
            f"{SCENARIO}\n\n"
            "请描写这个场景，包括皮卡丘的外貌、属性和能力。"
            "然后给出2-3个行动选项，用【】标记。"
        )
    }

def test_b_short_rag():
    """策略B：简短RAG，只给基础信息"""
    return {
        "label": "B. 简短RAG（只有名称和品阶）",
        "system": "你是斗气大陆文字冒险游戏的叙事引擎。严格遵循知识库设定。",
        "user": (
            "【知识库】\n"
            "皮卡丘：三阶火属性魔兽。\n\n"
            f"【玩家】{PLAYER_INFO}\n\n"
            f"【场景】{SCENARIO}\n\n"
            "请描写这个场景，包括皮卡丘的外貌、属性和能力。"
            "然后给出2-3个行动选项，用【】标记。"
        )
    }

def test_c_full_defense():
    """策略C：三层防线（完整定义+覆盖声明+Few-shot）"""
    return {
        "label": "C. 三层防线（完整定义+覆盖声明+Few-shot）",
        "system": (
            "你是斗气大陆文字冒险游戏的叙事引擎。\n\n"
            "【最高优先级规则 - 知识覆盖声明】\n"
            "本游戏中所有设定以【知识库】中的定义为准，而非你训练集中的任何先验知识。\n"
            "当你发现知识库中的定义与你已有的知识冲突时：\n"
            "- 必须绝对以知识库的定义为准\n"
            "- 必须完全无视你训练集中关于该实体的任何预设印象\n"
            "- 即使实体名称与你已知的事物完全相同，也必须仅按知识库的定义理解\n"
            "- 禁止引入知识库中未提及的任何属性、能力或特征\n\n"
            "【正确示例】\n"
            "用户：我在魔兽山脉遇到了一只皮卡丘\n"
            "正确：你小心翼翼地拨开灌木，一只赤红鳞甲覆盖的狮形魔兽映入眼帘——"
            "那是皮卡丘，一种三阶火属性魔兽。它正面朝你的方向，口中隐隐有火焰在翻涌...\n\n"
            "【错误示例 - 绝对禁止】\n"
            "错误：皮卡丘发出电击 / 皮卡丘是黄色的 / 皮卡丘说pika / 任何电相关描述\n"
            "这些都不符合知识库定义，绝对不允许出现。"
        ),
        "user": (
            f"【知识库 - 魔兽图鉴】\n{CUSTOM_BEAST['full_definition']}\n\n"
            f"【玩家】{PLAYER_INFO}\n\n"
            f"【场景】{SCENARIO}\n\n"
            "请严格按照知识库中的设定描写这个场景，包括皮卡丘的外貌、战斗方式。"
            "然后给出2-3个行动选项，用【】标记。\n"
            "再次强调：只使用知识库中定义的属性，不要添加任何知识库未提及的内容。"
        )
    }


def call_deepseek(test_case):
    """调用DeepSeek API"""
    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": test_case["system"]},
            {"role": "user", "content": test_case["user"]},
        ],
        temperature=0.7,
        max_tokens=600,
    )
    return response.choices[0].message.content, response.usage


def check_violations(text):
    """检查输出是否违反自定义设定（出现了训练集污染）"""
    violations = []
    
    # 电相关（皮卡丘不应该有电属性）
    electric_keywords = ["电", "放电", "伏特", "雷电", "电击", "闪电", "十万伏特", "pika", "皮卡"]
    for kw in electric_keywords:
        if kw.lower() in text.lower():
            violations.append(f"发现电属性描述: '{kw}'")
    
    # 黄色/小鼠（不应该描述为黄色小老鼠）
    wrong_desc = ["黄色", "小老鼠", "鼠", "可爱", "萌", "宠物小精灵", "宝可梦", "pokemon"]
    for kw in wrong_desc:
        if kw.lower() in text.lower():
            violations.append(f"发现不符合设定的描述: '{kw}'")
    
    # 正确描述检查
    correct_keywords = ["赤红", "鳞甲", "狮", "火", "炎"]
    found_correct = [kw for kw in correct_keywords if kw in text]
    
    return violations, found_correct


def main():
    tests = [test_a_no_rag(), test_b_short_rag(), test_c_full_defense()]
    
    print("=" * 70)
    print("  对比测试：自定义魔兽「皮卡丘」—— AI能否遵循你的设定？")
    print("=" * 70)
    print(f"\n  自定义设定：皮卡丘 = 三阶火属性魔兽，狮形，赤红鳞甲")
    print(f"  训练集知识：皮卡丘 = 电属性小黄鼠（宝可梦）")
    print("=" * 70)
    
    for i, test in enumerate(tests):
        print(f"\n{'='*70}")
        print(f"  测试 {test['label']}")
        print(f"{'='*70}")
        
        try:
            output, usage = call_deepseek(test)
            violations, correct = check_violations(output)
            
            print(f"\n--- AI输出 ---\n")
            print(output)
            print(f"\n--- 检测结果 ---")
            print(f"  Token: {usage.prompt_tokens}(输入) + {usage.completion_tokens}(输出)")
            
            if violations:
                print(f"  [FAIL] 发现 {len(violations)} 处违规:")
                for v in violations:
                    print(f"    x {v}")
            else:
                print(f"  [PASS] 未发现训练集污染")
            
            if correct:
                print(f"  正确使用设定: {', '.join(correct)}")
            else:
                print(f"  [WARN] 未检测到知识库设定关键词")
                
        except Exception as e:
            print(f"  API调用失败: {e}")
    
    print(f"\n{'='*70}")
    print("  总结")
    print("=" * 70)
    print("  A: 无RAG → 大概率被训练集污染（出现电属性）")
    print("  B: 简短RAG → 可能部分改善，但AI仍会自行脑补细节")
    print("  C: 三层防线 → 应该能严格遵循自定义设定")
    print("=" * 70)


if __name__ == "__main__":
    main()
