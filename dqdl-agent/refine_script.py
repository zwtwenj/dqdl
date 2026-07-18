"""
剧本细化脚本：把「抽象剧本」落地成「拍摄脚本」。

输入：generate_script.py 产出的剧本 JSON（含 title/nodes 节点图）。
输出：拍摄脚本（shooting script）——三部分：
  1. stage（舞台）：把剧本里的虚构地点（如"乌坦城坊市"）映射成通用槽位
     {loc_type, scene_type, danger_level}，运行时再匹配真实 location_net 节点。
     例如"坊市" → {loc_type:'city', scene_type:'market'}；
         "魔兽山脉" → {loc_type:'wild', danger_level:1~3}。
  2. cast（演员表）：每个登场角色一张「选角卡」——
     {name, role(职业), nature(性格), is_dynamic(静态不够则动态生成), voice(台词风格), level(实力参考)}。
     role/nature 对齐 npc_role/nature 表的枚举值，便于运行时落 static_npc 或动态 NPC。
  3. storyboard（分镜）：保留原节点图，但每节点台词按选角卡的 voice 风格细化重写，
     并标注「谁说的/对谁说的」。不碰 effects（原子能力留待后续统一接入）。

设计原则：
  - 只细化「叙事层」，不碰「机制层（effects）」——原子能力尚未统一，先搭骨架。
  - 输出仍是 JSON，可独立审阅；后续可再接入 effect 编排层。
  - 舞台/演员都做成「槽位 + 枚举」，运行时按槽位匹配真实数据，不硬编码具体 id。

用法：
  cd dqdl-agent
  python refine_script.py --in ../scripts/ev.json          # 从文件读
  python refine_script.py --inline '{"title":...}'         # 直接传 JSON
  python refine_script.py --gen                            # 现场生成一条剧本再细化
  python refine_script.py --in ev.json --out refined.json
"""
import os
import sys
import json
import argparse

os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'

from llm_client import call_deepseek
from utils import _parse_json_object

# ── 运行时数据枚举（对齐 DB，供 agent 选角/选景对齐）──
LOC_TYPES = ['city', 'wild', 'sect', 'secret']  # location_net.loc_type
SCENE_TYPES = ['market', 'guild', 'alchemy', 'cultivation', 'auction']  # location_scene.scene_type
NPC_ROLES = ['公会接待员', '坊市管理员', '拍卖师', '炼药师', '铁匠', '锻造师', '药材商',
             '旅馆老板', '修炼场教官', '修炼室管理员', '散修', '佣兵', '赏金猎人',
             '采药人', '魔修', '遗迹寻宝者', '落魄贵族']  # 前10来自DB，后7为动态NPC预留职业
NATURES = ['豪爽', '阴沉', '热情', '冷淡', '精明', '憨厚', '高傲', '随和']  # nature.name

WORLD = '严格遵循斗气大陆（斗破苍穹）世界观。台词用第二人称"你"，简洁有张力。'


def refine(script):
    """单次 LLM 调用：读剧本 → 输出拍摄脚本（stage + cast + storyboard）。"""
    sys_prompt = (
        '你是斗气大陆游戏的事件导演。给定一份抽象剧本（含虚构地点/角色名/节点图），'
        '把它细化为「拍摄脚本」——确定舞台、选角、重写台词分镜。只输出 JSON。'
    )
    user_prompt = (
        f'【世界观】{WORLD}\n\n'
        f'【待细化剧本】\n{json.dumps(script, ensure_ascii=False, indent=2)}\n\n'
        '【可用枚举（必须从中选，不得编造）】\n'
        f'- 地点类型 loc_type：{LOC_TYPES}\n'
        f'- 场景类型 scene_type（city 内细分）：{SCENE_TYPES}\n'
        f'- NPC 职业 role：{NPC_ROLES}\n'
        f'- NPC 性格 nature：{NATURES}\n\n'
        '【细化要求】\n'
        '1. stage（舞台）：把剧本里出现的地点映射成槽位，不要写死具体城市名。\n'
        '   - 坊市/拍卖 → loc_type:"city", scene_type:"market"/"auction"\n'
        '   - 佣兵公会/炼药师公会 → loc_type:"city", scene_type:"guild"/"alchemy"\n'
        '   - 野外/山脉/森林 → loc_type:"wild", danger_level:1~3\n'
        '   - 宗门 → loc_type:"sect"\n'
        '   若剧本跨多个地点，给 primary（主舞台）+ optional（可选次要地点）。\n'
        '2. cast（演员表）：剧本里每个有台词/有名号的角色一张选角卡：\n'
        '   {name(剧中名), role(从枚举选职业), nature(从枚举选性格), '
        'is_dynamic(该职业是否DB静态NPC覆盖不到→true用动态NPC), '
        'voice(一句话台词风格), level(实力参考如"斗者"/"斗师")}。\n'
        '   is_dynamic 判定：role 在前10个DB职业(接待员/管理员/拍卖师/炼药师/铁匠/锻造师/'
        '药材商/旅馆老板/教官/修炼室管理员)→false；其余(散修/佣兵/赏金猎人等)→true。\n'
        '3. storyboard（分镜）：保留原节点图结构(nodes.start/nodes.map)，'
        '但每个节点的 npc 台词按该说话角色的 voice 风格重写一遍（更贴合性格、更有画面感），'
        '并在台词前标注「角色名：」。如果有多个角色对话，用「角色名：台词」分行。\n'
        '   - choices 的 text 可微调措辞，但 goto 必须不变。\n'
        '   - effects 数组原样保留，不要改（原子能力留待后续）。\n\n'
        '【输出格式】严格 JSON：\n'
        '{\n'
        '  "title": "剧本标题",\n'
        '  "stage": {"primary":{"loc_type":"...","scene_type":"...(city才填)","danger_level":0}, '
        '"optional":[{"loc_type":"..."}]},\n'
        '  "cast": [{"name":"...","role":"...","nature":"...","is_dynamic":false,"voice":"...","level":"..."}],\n'
        '  "storyboard": {"start":"intro","map":{ ...(同原 nodes.map 结构，台词已重写)... }}\n'
        '}'
    )
    content, _ = call_deepseek(sys_prompt, user_prompt, temperature=0.8, max_tokens=3000, call_type='event')
    result = _parse_json_object(content)
    # 基础校验
    if not result.get('stage') or not result.get('cast') or not result.get('storyboard'):
        raise ValueError(f'细化字段缺失: stage/cast/storyboard 必须齐全')
    # 校验枚举合法性（软警告，不阻断）
    primary = result['stage'].get('primary', {})
    if primary.get('loc_type') not in LOC_TYPES:
        print(f'  [警告] loc_type 非法: {primary.get("loc_type")}', file=sys.stderr)
    if primary.get('scene_type') and primary['scene_type'] not in SCENE_TYPES:
        print(f'  [警告] scene_type 非法: {primary.get("scene_type")}', file=sys.stderr)
    for ch in result['cast']:
        if ch.get('role') not in NPC_ROLES:
            print(f'  [警告] role 非法: {ch.get("role")} ({ch.get("name")})', file=sys.stderr)
        if ch.get('nature') not in NATURES:
            print(f'  [警告] nature 非法: {ch.get("nature")} ({ch.get("name")})', file=sys.stderr)
    return result


def print_refined(r):
    print(f'\n{"="*64}')
    print(f'🎬 拍摄脚本：《{r["title"]}》')
    s = r['stage']['primary']
    danger = f' / danger:{s.get("danger_level",0)}' if s.get('loc_type') == 'wild' else ''
    scene = f' / scene:{s.get("scene_type")}' if s.get('scene_type') else ''
    print(f'📍 舞台：loc_type={s.get("loc_type")}{scene}{danger}')
    if r['stage'].get('optional'):
        print(f'   次要地点：{r["stage"]["optional"]}')
    print(f'\n🎭 演员表（{len(r["cast"])}人）：')
    for ch in r['cast']:
        dyn = '⚡动态' if ch.get('is_dynamic') else '🟢静态'
        print(f'   {dyn} {ch["name"]}｜{ch.get("role","?")}·{ch.get("nature","?")}·{ch.get("level","?")}')
        print(f'         台词风格：{ch.get("voice","")[:40]}')
    sb = r['storyboard']
    print(f'\n🎬 分镜（{len(sb["map"])}场，入口 {sb["start"]}）：')
    for nid, node in sb['map'].items():
        tag = '🏁结局' if node.get('end') else ''
        print(f'   [{nid}] {tag}')
        npc = (node.get('npc') or '').strip()
        if npc:
            for line in npc.split('\n')[:3]:
                if line.strip():
                    print(f'       {line.strip()[:60]}')
        for c in node.get('choices') or []:
            print(f'       ▸ {c["text"][:30]} → {c["goto"]}')
    print('=' * 64)


def main():
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument('--in', dest='infile', help='输入剧本 JSON 文件')
    src.add_argument('--inline', help='直接传剧本 JSON 字符串')
    src.add_argument('--gen', action='store_true', help='现场生成一条剧本再细化')
    ap.add_argument('--trigger', default='enter_location')
    ap.add_argument('--loc', default='乌坦城坊市')
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    # 读剧本
    if args.gen:
        import generate_script
        generate_script.ensure_rag() if hasattr(generate_script, 'ensure_rag') else None
        from config import ensure_rag
        ensure_rag()
        print('>>> 现场生成剧本...')
        skeleton = generate_script.gen_skeleton(args.trigger, args.loc)
        nodes_obj = generate_script.gen_nodes(skeleton, args.trigger)
        script = generate_script.validate(nodes_obj)
        print(f'    剧本就绪：{script["title"]}')
    elif args.inline:
        script = json.loads(args.inline)
    else:
        with open(args.infile, encoding='utf-8') as f:
            script = json.load(f)

    print(f'>>> 细化剧本：《{script.get("title","?")}》...')
    refined = refine(script)
    print('    ✓ 细化完成')

    print_refined(refined)

    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump(refined, f, ensure_ascii=False, indent=2)
        print(f'\n✅ 已写入：{args.out}')
    else:
        print('\n--- 原始 JSON ---')
        print(json.dumps(refined, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
