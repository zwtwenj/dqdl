"""
剧本生成脚本（三段式）：调 DeepSeek + RAG，生成 1 条多分支多结局剧本。

三段式设计（避免 LLM 一步生成节点图时逻辑崩塌/前后矛盾）：
  段1 骨架：RAG 检索(桥段模板 + NPC原型 + 地域风物) → LLM 生成事件骨架
  段2 分支树：骨架 + RAG 检索(魔兽/物品给结局落地) → LLM 展开成 3 结局节点图
  段3 校验：复用 event_service._normalize_event（结构校验 + effect白名单 + 数值钳制）

输出：打印剧本 JSON + 可选写入文件（--out path.json）。
失败：任一段失败则报错退出（不降级，便于看真实问题）。

用法：
  cd dqdl-agent
  python generate_script.py                       # 默认：进入坊市触发，打印
  python generate_script.py --trigger combat      # 指定触发类型
  python generate_script.py --loc 魔兽山脉         # 指定地点
  python generate_script.py --out ../scripts/ev1.json
"""
import os
import sys
import json
import argparse

# 离线模式（避免模型加载连 HF）
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'

from llm_client import call_deepseek
from utils import _parse_json_object
from config import ensure_rag
from rag_service import search
from services.event_service import _normalize_event, EVENT_EFFECT_KEYS

# 世界观约束（与 generate_lore 一致）
WORLD = '严格遵循斗气大陆（斗破苍穹）世界观：斗气修炼(斗之气→斗帝)、炼药师、魔兽、异火、佣兵、宗门。强者为尊，金币/魔核/丹药是核心资源。台词用第二人称"你"。'


def rag_pick(query, sources, top_k=2):
    """检索并拼接成简短素材串（带来源标签）。失败返回空串。"""
    try:
        results = search(query, top_k=top_k, sources=sources)
        if not results:
            return ''
        parts = []
        for r in results:
            # 截断过长条目，控制 prompt 体积
            parts.append(f"[{r['source'][:6]}]\n{r['text'][:400]}")
        return '\n---\n'.join(parts)
    except Exception as e:
        print(f'  [RAG 跳过] {e}', file=sys.stderr)
        return ''


# ============================================================
#  段1：事件骨架
# ============================================================
def gen_skeleton(trigger, location):
    """检索桥段/NPC/地域 → 生成事件骨架。返回 dict。"""
    # 三路检索：桥段模板决定套路、NPC原型决定角色、地域风物决定舞台
    trope = rag_pick(f'{trigger} 奇遇 委托 抉择 冲突', ['剧情素材.docx'], top_k=2)
    npc = rag_pick(f'散修 佣兵 炼药师 复仇者', ['剧情素材.docx'], top_k=2)
    region = rag_pick(f'{location} 地貌 危险 机遇', ['剧情素材.docx', '基础场景设定.docx'], top_k=1)

    sys = (
        '你是斗气大陆事件设计师。基于给定的桥段模板、NPC原型、地域风物，'
        '构思一个事件骨架（不是完整节点图，只是大纲）。只输出 JSON。'
    )
    user = (
        f'【世界观】{WORLD}\n\n'
        f'【触发情境】玩家{trigger_desc(trigger)}（地点：{location}）\n\n'
        f'【参考桥段模板】\n{trope or "（无，自行构思一个套路）"}\n\n'
        f'【参考NPC原型】\n{npc or "（无，自行设计登场角色）"}\n\n'
        f'【舞台风物】\n{region or "（无）"}\n\n'
        '【任务】写一个事件骨架，要求：\n'
        '- 1-2 个登场角色（参考上面的NPC原型，可改名）\n'
        '- 1 个核心冲突（开场如何起头）\n'
        '- 恰好 3 个结局走向（好/平淡/坏），每个结局一句话\n'
        '- 奖惩要合理克制（金币几十~几千，物品1~10个）\n\n'
        '【输出格式】严格 JSON：\n'
        '{\n'
        '  "title": "事件标题(6-12字)",\n'
        '  "theme": "奇遇/冲突/委托/抉择/探索 择一",\n'
        '  "characters": [{"name":"角色名","archetype":"原型简述","motivation":"动机"}],\n'
        '  "conflict": "开场冲突一句话",\n'
        '  "endings": [\n'
        '    {"key":"good","desc":"向好结局描述","reward":"奖励类型,如 金币500/一阶回春丹x3"},\n'
        '    {"key":"neutral","desc":"平淡结局描述","reward":"无 或 小得失"},\n'
        '    {"key":"bad","desc":"坏结局描述","penalty":"惩罚,如 扣金币300/战斗/损失修为"}\n'
        '  ]\n'
        '}'
    )
    content, _ = call_deepseek(sys, user, temperature=0.95, max_tokens=1200, call_type='event')
    sk = _parse_json_object(content)
    # 基本校验
    if not sk.get('title') or not sk.get('endings') or len(sk['endings']) < 3:
        raise ValueError(f'骨架字段不完整: title={sk.get("title")}, endings={len(sk.get("endings") or [])}')
    return sk


# ============================================================
#  段2：展开分支节点图
# ============================================================
def gen_nodes(skeleton, trigger):
    """骨架 + 检索魔兽/物品 → 展开成 3 结局节点图。返回 dict(nodes)。"""
    # 检索真实的魔兽/物品，让结局的奖惩能落地（引用图鉴条目而非凭空编造）
    # 根据结局里的奖励/惩罚类型构造 query
    reward_text = ' '.join(str(e.get('reward', '')) + ' ' + str(e.get('penalty', '')) for e in skeleton['endings'])
    loot = rag_pick(f'{reward_text} 魔兽 材料 丹药 掉落', ['魔兽图鉴.docx', '材料图鉴.docx', '丹药图鉴.docx'], top_k=3)

    chars = '；'.join(f"{c['name']}({c.get('archetype','')},{c.get('motivation','')})" for c in skeleton.get('characters', []))
    endings = '\n'.join(
        f'  - {e["key"]}: {e["desc"]}（奖惩: {e.get("reward") or e.get("penalty") or "无"}）'
        for e in skeleton['endings'][:3]
    )

    effects_hint = ', '.join(EVENT_EFFECT_KEYS)
    sys = (
        '你是斗气大陆事件设计师。把给定骨架展开成分支对话节点图（nodes），必须包含恰好 3 个结局。'
        '严格只用给定的 effect 原子能力 key，不得编造。只输出 JSON。'
    )
    user = (
        f'【世界观】{WORLD}\n\n'
        f'【事件骨架】\n标题：{skeleton["title"]}\n主题：{skeleton.get("theme","")}\n'
        f'登场角色：{chars}\n开场冲突：{skeleton["conflict"]}\n三个结局：\n{endings}\n\n'
        f'【可用的真实魔兽/物品】（奖惩尽量引用这些真实条目，不要编造不存在的物品名）\n{loot or "（无，用 money/grantCultivation 代替物品）"}\n\n'
        '【可用的 effect key（effects 数组每条对象只用其一）】\n'
        f'  {effects_hint}\n'
        '【effect 语义】money:{money:±n} / giveItem:{giveItem:{name,count}} / '
        'createTask:{createTask:{name,desc,target[],reward[],star?}} / '
        'startBattle:{startBattle:{mobId:"WB-001"}} 或 {startBattle:{name,level,power,intelligence,quick,stamina}} / '
        'grantCultivation:{grantCultivation:{amount}} / triggerEncounter:{} / movePlayer:{movePlayer:{position:[...]}}\n\n'
        '【结构要求】\n'
        '- nodes = {start:入口id, map:{节点id:节点}}\n'
        '- 节点字段：npc(台词,第二人称"你")、choices([{text,goto,require?}])、effects(进节点即落地)、roll([{weight,goto}])、end(bool)\n'
        '- 分支：intro 抛出冲突 → 2-3 个 choices → 各自走向 → 最终恰好 3 个 end 节点(对应骨架的 good/neutral/bad)\n'
        '- 战斗节点(startBattle)可配 win/lose/flee 跳转\n'
        '- 台词要有斗气大陆口吻，简洁有张力\n'
        '- 数值克制：金币几十~几千，物品 count 1~10\n\n'
        '【输出格式】严格 JSON（不要 markdown）：\n'
        '{\n'
        '  "title": "同骨架标题",\n'
        '  "nodes": {\n'
        '    "start": "intro",\n'
        '    "map": {\n'
        '      "intro": {"npc":"...","choices":[{"text":"...","goto":"..."}]},\n'
        '      "...": {"effects":[{"money":-100}],"npc":"...","end":true}\n'
        '    }\n'
        '  }\n'
        '}'
    )
    content, _ = call_deepseek(sys, user, temperature=0.9, max_tokens=2200, call_type='event')
    nodes_obj = _parse_json_object(content)
    return nodes_obj


# ============================================================
#  段3：校验（复用 event_service._normalize_event）
# ============================================================
def validate(nodes_obj):
    """复用老代码校验：结构 + effect 白名单 + 数值钳制。失败抛 ValueError。"""
    spec = _normalize_event(nodes_obj)
    # 额外检查：至少 3 个 end 节点
    end_count = sum(1 for n in spec['nodes']['map'].values() if n.get('end'))
    if end_count < 3:
        raise ValueError(f'结局节点不足 3 个（实际 {end_count}）')
    return spec


# ============================================================
#  辅助
# ============================================================
def trigger_desc(trigger):
    return {
        'enter_location': '进入新地点',
        'breakthrough': '刚完成突破',
        'kill_mob': '刚击杀魔兽',
        'combat': '陷入一场争斗',
    }.get(trigger, f'触发了{trigger}')


def print_script(spec):
    """友好打印剧本结构。"""
    print(f'\n{"="*60}')
    print(f'标题：{spec["title"]}  (event_id: {spec["event_id"]})')
    print(f'delivery: {spec["delivery"]}')
    nodes = spec['nodes']
    print(f'节点数：{len(nodes["map"])}，入口：{nodes["start"]}')
    print('-' * 60)
    for nid, node in nodes['map'].items():
        tags = []
        if node.get('end'):
            tags.append('【结局】')
        if node.get('effects'):
            tags.append(f'效果:{node["effects"]}')
        if node.get('choices'):
            tags.append(f'选项:{len(node["choices"])}个')
        if node.get('roll'):
            tags.append(f'随机:{len(node["roll"])}路')
        tagstr = ' '.join(tags)
        npc = (node.get('npc') or '').replace('\n', ' ')[:70]
        print(f'[{nid}] {tagstr}')
        if npc:
            print(f'    “{npc}”')
        for c in node.get('choices') or []:
            req = f' (需{c["require"]})' if c.get('require') else ''
            print(f'    → {c["text"]}{req}  => {c["goto"]}')
    print('=' * 60)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--trigger', default='enter_location', help='触发类型')
    ap.add_argument('--loc', default='乌坦城坊市', help='地点名')
    ap.add_argument('--out', default=None, help='输出 JSON 文件路径')
    args = ap.parse_args()

    print(f'=== 剧本生成（trigger={args.trigger}, loc={args.loc}）===')
    ensure_rag()

    print('\n>>> 段1：生成骨架...')
    skeleton = gen_skeleton(args.trigger, args.loc)
    print(f'    标题：{skeleton["title"]}')
    print(f'    主题：{skeleton.get("theme")}，角色：{len(skeleton.get("characters",[]))}个')
    for e in skeleton['endings'][:3]:
        print(f'    结局[{e["key"]}]：{e["desc"][:40]}')

    print('\n>>> 段2：展开分支节点图...')
    nodes_obj = gen_nodes(skeleton, args.trigger)
    print(f'    原始节点数：{len(nodes_obj.get("nodes",{}).get("map",{}))}')

    print('\n>>> 段3：校验 + 钳制...')
    spec = validate(nodes_obj)
    print(f'    ✓ 校验通过，结局节点：{sum(1 for n in spec["nodes"]["map"].values() if n.get("end"))} 个')

    print_script(spec)

    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump(spec, f, ensure_ascii=False, indent=2)
        print(f'\n✅ 已写入：{args.out}')
    else:
        print('\n--- 原始 JSON ---')
        print(json.dumps(spec, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
