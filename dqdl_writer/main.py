"""
主入口：运行 v5 故事生成工作流。

工作流：
  1. 提取世界规则（目标书，模型知识，不读原文）
  2. 提取叙事弧（模型对全书的知识，不读原文）
  3. 生成故事（先写主线 → 观察选择点 → 续写分支 → 组装）
  4. 输出

用法：
  python main.py
  python main.py --target 斗破苍穹
  python main.py --prompt "你在魔兽山脉边缘做猎兽佣兵，意外发现一处上古遗迹"
"""
import json
import os
import sys
import argparse
from datetime import datetime

# Windows 控制台/管道默认 GBK 编码，日志含 ✓ 等非 GBK 字符时会 UnicodeEncodeError。
# 强制 stdout/stderr 用 UTF-8，保证 print 与 subprocess 管道都能正常输出。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from langchain_openai import ChatOpenAI
from story_graph import build_story_workflow
from config import BOOKS, DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL


def extract_world_rules(target_book: str) -> str:
    """从目标书提取世界规则"""
    book_conf = BOOKS.get(target_book, {})
    llm = ChatOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL, model=DEEPSEEK_MODEL, temperature=0.3, max_tokens=2000)

    prompt = f"""你是一个小说世界观分析专家。请从以下信息中提取「{target_book}」的世界规则。

已知信息：
- 力量体系：{book_conf.get('power_system', '未知')}
- 世界名称：{book_conf.get('world_name', '未知')}

请输出以下内容（简洁列表，不要原文复制）：
1. 境界/等级体系：每个境界的名称和特征
2. 重要地理：主要地区/城市/危险地带
3. 势力格局：主要势力/宗门/家族
4. 核心规则：修炼方式/资源获取/战斗规则
5. 特色设定：这个世界独有的设定

每项 2-3 句，总字数不超过 500 字。"""

    response = llm.invoke(prompt)
    return response.content.strip()


def extract_story_arcs(target_book: str) -> str:
    """提取冒险/探索类叙事弧（基于模型对全书的知识，不读原文）。

    模型训练数据已完整包含《斗破苍穹》，无需喂章节文本——
    直接让其回忆全书不同阶段的冒险类型，抽象成可复用的叙事弧模板。
    """
    book_conf = BOOKS.get(target_book, {})
    llm = ChatOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL, model=DEEPSEEK_MODEL, temperature=0.4, max_tokens=3000)

    prompt = f"""你熟读《{target_book}》全书（{book_conf.get('world_name', '')}世界）。
现在请基于你对这本书的完整了解，回忆书中出现过的**冒险/探索类事件**（而非主线剧情），
提取 2-3 个可复用的**叙事弧模板**。

回忆方向（不要局限于开篇，想想全书各阶段）：
- 主角踏入陌生地域/秘境/遗迹的探索
- 猎杀或遭遇凶兽、异火、险境的生死冒险
- 争夺天材地宝/功法斗技的冒险
- 在险地求生、结识或对抗其他冒险者的经历

要求：
- 只提取**冒险探索类**的弧：探索未知、遭遇凶险、发现机缘、对抗强敌、规则下成长
- **不要**提取家族斗争、身世复仇、退婚、宗门内斗等套路
- 抽象成通用模板，不含具体人名/地名

输出 2-3 个叙事弧模板，每个包含：
- 弧名：（如"秘境探宝"/"荒原猎兽"/"险地求生"）
- 阶段拆解：每个阶段一句话描述（抽象，不含具体人名/地名）
- 核心冲突
- 情感曲线
- 可迁移元素

格式：JSON 数组。"""

    response = llm.invoke(prompt)
    return response.content.strip()


def main():
    parser = argparse.ArgumentParser(description="主线→观察→续写 故事生成")
    parser.add_argument("--target", default="斗破苍穹", help="目标世界观书籍")
    parser.add_argument("--prompt", default="你在斗气大陆的魔兽山脉边缘做猎兽佣兵，某日追踪一头受伤的魔兽时，意外发现了一处上古遗迹的入口。", help="故事生成指令")
    args = parser.parse_args()

    print("=" * 60)
    print("  DQDL Story Writer v5 — 先写主线 → 观察选择点 → 续写分支")
    print("=" * 60)
    print(f"  目标世界观：{args.target}")
    print(f"  生成指令：  {args.prompt}")
    print("=" * 60)

    # 1. 提取世界规则（模型知识）
    print(f"\n[1/2] 提取《{args.target}》世界规则...")
    world_rules = extract_world_rules(args.target)
    print(f"  → {len(world_rules)}字")

    # 2. 提取叙事弧（模型对全书的知识，不读原文）
    print(f"\n[2/2] 提取冒险叙事弧（模型知识）...")
    story_arcs = extract_story_arcs(args.target)
    print(f"  → {len(story_arcs)}字")

    # 3. 四阶段生成故事（主线 → 观察 → 续写 → 组装）
    print(f"\n生成故事（主线 → 观察选择点 → 续写分支）...\n")
    app = build_story_workflow()

    initial_state = {
        "target_book": args.target,
        "world_rules": world_rules,
        "story_arcs": story_arcs,
        "story_prompt": args.prompt,
        "trunk": None,
        "trunk_draft": "",
        "trunk_retry": 0,
        "trunk_validation": {},
        "choice_plan": None,
        "choice_draft": "",
        "choice_retry": 0,
        "choice_validation": {},
        "branch_results": [],
        "current_choice_index": 0,
        "current_choice_point": {},
        "branch_draft": "",
        "branch_retry": 0,
        "branch_validation": {},
        "outline": None,
        "final_story": {},
        "messages": [],
    }

    result = app.invoke(initial_state)

    # 输出执行日志
    print("\n" + "-" * 40)
    for msg in result.get("messages", []):
        print(msg)

    # 保存结果
    output_dir = os.path.join(os.path.dirname(__file__), "output")
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    story = result.get("final_story", {})
    nodes = story.get("nodes", [])

    # JSON
    json_path = os.path.join(output_dir, f"story_{timestamp}.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(story, f, ensure_ascii=False, indent=2)

    # 可读文本
    txt_path = os.path.join(output_dir, f"story_{timestamp}.txt")
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(f"故事主题：{args.prompt}\n")
        f.write(f"目标世界观：{args.target}\n")
        f.write("=" * 50 + "\n\n")
        for n in nodes:
            node_type = n.get("type", "narrative")
            type_tag = {"narrative": "叙事", "choice": "选择", "ending": "结局"}.get(node_type, node_type)
            f.write(f"【{n.get('id', '?')}】{n.get('title', '')} [{type_tag}]\n")
            f.write(f"{n.get('narrative', '')}\n")
            if node_type == "narrative":
                f.write(f"  → 下一节点: {n.get('next', '?')}\n")
            elif node_type == "choice":
                for c in n.get("choices", []):
                    risk_tag = f"[{c.get('risk', '?')}]" if c.get("risk") else ""
                    f.write(f"  ▸ {c.get('text', '')} →{c.get('next', '?')} {risk_tag}\n")
                    if c.get("intent"):
                        f.write(f"    意图: {c['intent']}\n")
                    if c.get("outcome_hint"):
                        f.write(f"    预期: {c['outcome_hint']}\n")
            elif node_type == "ending":
                f.write(f"  [结局]\n")
            f.write("\n")

    # 中间产物
    meta_path = os.path.join(output_dir, f"meta_{timestamp}.txt")
    with open(meta_path, "w", encoding="utf-8") as f:
        f.write("=== 世界规则 ===\n")
        f.write(world_rules)
        f.write("\n\n=== 叙事弧 ===\n")
        f.write(story_arcs)

    print(f"\n{'=' * 60}")
    print(f"  完成！{len(nodes)} 节点")
    print(f"  JSON: {json_path}")
    print(f"  文本: {txt_path}")
    print(f"  元数据: {meta_path}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
