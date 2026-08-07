"""
LangGraph 网状故事生成工作流（v5）。

v5 核心变化：从「先生成地图再填内容」改为「先写主线 → 观察选择点 → 续写分支」，
更接近人写故事的方式：

  1. generate_trunk：先写一条单路径主线故事（完整叙事，无分支）
  2. observe_choices：agent 观察主线，找出天然有选择空间的幕（决策点）
  3. generate_branches：从每个选择点续写分支（完整叙事），分支汇回主线
  4. assemble：主线 + 分支组装成最终网状节点图，程序化强校验

为什么这样改（修复 v4 的隐性问题）：
  v4 让 AI 一次性铺开整个地图，结构容易超预算、主线连贯性靠 summary 传递，
  分支内容与主线衔接是"间接"的。
  v5 主线是一气呵成的完整叙事（连贯性由一次生成保证），分支是从已有故事
  上下文里"长"出来的（衔接是直接的），观察与续写分离使每步 LLM 任务更聚焦。
"""
import json
import re
from typing import TypedDict, Annotated, Literal
from operator import add

from langgraph.graph import StateGraph, END

from llm import get_llm


# ========== 常量 ==========

MIN_BEATS = 5          # 主线最少幕数
MAX_BEATS = 7          # 主线最多幕数
MIN_CHOICE_POINTS = 3  # 最少选择点
MAX_CHOICE_POINTS = 4  # 最多选择点
MIN_BRANCHES = 2       # 每个选择点最少分支
MAX_BRANCHES = 3       # 每个选择点最多分支
MAX_RETRIES = 3        # 每个阶段最多重试次数
MIN_ENDINGS = 2        # 最少结局数
MAX_ENDINGS = 3        # 最多结局数
MIN_NODES = 10         # 组装后最少节点数
MAX_NODES = 15         # 组装后最多节点数


# ========== 状态定义 ==========

class StoryState(TypedDict):
    # 输入
    target_book: str
    world_rules: str
    story_arcs: str
    story_prompt: str

    # ---- 阶段 1：主线 ----
    trunk: dict | None                 # 主线 {title, beats:[...]}
    trunk_draft: str
    trunk_retry: int
    trunk_validation: dict

    # ---- 阶段 2：观察选择点 ----
    choice_plan: dict | None           # {choice_points:[{beat_id, reason, branches:[...]}]}
    choice_draft: str
    choice_retry: int
    choice_validation: dict

    # ---- 阶段 3：续写分支（逐选择点） ----
    branch_results: list[dict]         # 已续写完成的选择点分支 [{beat_id, branches:[...]}, ...]
    current_choice_index: int          # 当前处理第几个选择点（0-based）
    current_choice_point: dict         # 当前选择点
    branch_draft: str
    branch_retry: int
    branch_validation: dict

    # ---- 阶段 4：组装 ----
    outline: dict | None               # 组装后的完整节点图（最终校验前的中间产物）

    # 输出
    final_story: dict
    messages: Annotated[list[str], add]


# ========== 工具函数 ==========

def extract_json(text: str) -> dict | None:
    """从 LLM 输出中提取 JSON"""
    match = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
    if match:
        text = match.group(1)
    else:
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            text = text[start:end + 1]
        else:
            return None
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None


def build_trunk_text(trunk: dict) -> str:
    """渲染主线为紧凑文本（含每幕正文），用于观察/续写的上下文"""
    beats = trunk.get("beats", [])
    lines = []
    for b in beats:
        lines.append(
            f"[{b.get('id', '?')}]「{b.get('title', '')}」—— {b.get('narrative', '')}"
        )
    return "\n".join(lines)


# ========== 阶段 1：生成主线 ==========

def generate_trunk(state: StoryState) -> dict:
    """LLM 写一条单路径主线故事（完整叙事，无分支）"""
    world_rules = state["world_rules"]
    story_arcs = state["story_arcs"]
    story_prompt = state["story_prompt"]
    retry = state.get("trunk_retry", 0)
    llm = get_llm(temperature=0.85 if retry == 0 else 0.7, max_tokens=4000)

    issues_hint = ""
    if retry > 0 and state.get("trunk_draft"):
        issues = state.get("trunk_validation", {}).get("issues", [])
        issues_hint = (
            f"\n\n【上一次校验失败的问题】（必须全部修复）\n"
            f"{chr(10).join('- ' + i for i in issues)}"
        )

    prompt = f"""你是一个小说家，正在为类似《斗破苍穹》的玄幻世界写一个**冒险探索类**随机事件故事。
先写一条**单路径主线**：从起点到结局的完整叙事，这一阶段不要任何分支选择。

【世界规则】（必须遵守，力量体系、地域、势力都要符合）
{world_rules}

【可参考的叙事弧模板】（参考其节奏与冲突模式，不要套用家族/身世套路）
{story_arcs}

【事件主题】
{story_prompt}

【主角设定】（必须遵守）
- 你是一名在斗气大陆上游历的**普通冒险者**（可以是猎杀魔兽为生的佣兵、探秘遗迹的寻宝客、行走各地的游商、追逐机缘的散修等）
- **不要写主角的身世、家族、亲属、宗门背景**——主角就是一个无牵无挂、独自闯荡的冒险者
- **不要出现原作主角相关的内容**：不写萧炎、药老/药尘、萧家/萧门、薰儿、纳兰嫣然等任何原作人物与势力，也不要有"被家族逐出""少主""婚约"等原作情节
- 故事全程聚焦"冒险与探索"：探索未知地域/遗迹/秘境、遭遇凶兽与险境、发现机缘与宝藏、结识或对抗其他冒险者、在斗气大陆的规则下成长

【题材倾向】
- 以探索、冒险、猎杀、寻宝、解谜、遭遇战为主线
- 可以遇到危险（凶兽、仇家、陷阱、恶劣环境），可以收获机缘（功法、丹药、宝物、秘辛）
- 不要写成家族斗争、身份复仇、宫廷权谋

要求：
- 共 {MIN_BEATS}-{MAX_BEATS} 幕，最后一幕是结局
- 每幕是一段连贯的场景叙事（第二人称"你"，80-130字），幕与幕之间情节必须衔接
- 主角身处这个世界，遭遇符合世界规则的事件，逐步推进到最后的高潮与结局
- 节奏：前 1-2 幕铺垫处境 → 中间推进冲突 → 最后高潮结局
- 结局幕要有收束感（解决了冲突或留下了悬念）

输出 JSON（只输出 JSON）：
{{
  "title": "事件标题（8-15字）",
  "beats": [
    {{
      "id": "b1",
      "title": "幕标题（4-8字）",
      "summary": "本幕剧情要点（一句话）",
      "narrative": "本幕正文（80-130字，第二人称'你'）"
    }}
  ]
}}{issues_hint}"""

    response = llm.invoke(prompt)
    draft = response.content.strip()

    return {
        "trunk_draft": draft,
        "trunk_validation": {"trunk": None, "parsed": False},
        "messages": [f"[1/4] 写主线故事草稿{'（重试'+str(retry+1)+'）' if retry > 0 else ''}"],
    }


def validate_trunk(state: StoryState) -> dict:
    """校验主线：幕数、字段、叙事长度"""
    trunk = extract_json(state.get("trunk_draft", ""))
    retry = state.get("trunk_retry", 0)

    if not trunk:
        return {
            "trunk_validation": {"trunk": None, "parsed": False, "is_valid": False,
                                 "issues": ["JSON 解析失败"]},
            "messages": [f"  ✗ 主线校验失败：JSON 解析失败（第{retry+1}次）"],
        }

    beats = trunk.get("beats", [])
    issues = []

    if not (MIN_BEATS <= len(beats) <= MAX_BEATS):
        issues.append(f"幕数应为 {MIN_BEATS}-{MAX_BEATS}，实际 {len(beats)}")

    ids = [b.get("id", "") for b in beats]
    if len(ids) != len(set(ids)):
        issues.append("幕 id 存在重复")

    for i, b in enumerate(beats):
        bid = b.get("id", f"b{i+1}")
        if not b.get("title"):
            issues.append(f"幕 {bid}: 缺少 title")
        if not b.get("summary"):
            issues.append(f"幕 {bid}: 缺少 summary")
        n_len = len(b.get("narrative", ""))
        if n_len < 40:
            issues.append(f"幕 {bid}: 叙事过短（{n_len}字，建议80-130字）")
        if n_len > 260:
            issues.append(f"幕 {bid}: 叙事过长（{n_len}字，建议不超过130字）")

    # 幕 id 规范：b1 起
    if beats and beats[0].get("id") != "b1":
        issues.append(f"首幕 id 应为 b1，实际 {beats[0].get('id')}")

    is_valid = len(issues) == 0
    return {
        "trunk_validation": {
            "trunk": trunk,
            "parsed": True,
            "is_valid": is_valid,
            "issues": issues[:8],
            "stats": {"beats": len(beats)},
        },
        "messages": [
            f"  {'✓' if is_valid else '✗'} 主线校验{'通过' if is_valid else '失败'}（{len(beats)}幕）" +
            (f"，问题: {issues[0]}" if issues else "")
        ],
    }


def route_after_trunk(state: StoryState) -> Literal["accept_trunk", "rewrite_trunk"]:
    val = state.get("trunk_validation", {})
    if val.get("is_valid"):
        return "accept_trunk"
    if state.get("trunk_retry", 0) >= MAX_RETRIES:
        return "accept_trunk"
    return "rewrite_trunk"


def rewrite_trunk(state: StoryState) -> dict:
    return {
        "trunk_retry": state.get("trunk_retry", 0) + 1,
        "messages": [f"  → 重写主线故事"],
    }


def accept_trunk(state: StoryState) -> dict:
    trunk = state["trunk_validation"]["trunk"]
    return {
        "trunk": trunk,
        "trunk_retry": 0,
        "messages": [f"[1/4完成] 主线已通过：{len(trunk.get('beats', []))}幕"],
    }


# ========== 阶段 2：观察选择点 ==========

def observe_choices(state: StoryState) -> dict:
    """agent 观察主线，找出天然有选择空间的幕"""
    trunk = state["trunk"]
    retry = state.get("choice_retry", 0)
    llm = get_llm(temperature=0.4, max_tokens=2000)

    trunk_text = build_trunk_text(trunk)

    issues_hint = ""
    if retry > 0 and state.get("choice_draft"):
        issues = state.get("choice_validation", {}).get("issues", [])
        issues_hint = (
            f"\n\n【上一次观察失败的问题】（必须全部修复）\n"
            f"{chr(10).join('- ' + i for i in issues)}"
        )

    prompt = f"""你是一个资深叙事设计师。下面是已定稿的单路径主线故事，请观察这条线，
找出**哪些幕天然面临选择**——即主角在那一刻有明确的两难/取舍/方向抉择。

【主线故事】
{trunk_text}

要求：
- 找出 {MIN_CHOICE_POINTS}-{MAX_CHOICE_POINTS} 个选择点
- 选择点必须落在主线中间幕（不能是第一幕，也不能是最后一幕结局）
- 每个选择点 2 个分支（分支不宜多，每条链路保持 3-4 个选择点即可）
- 分支之间方向差异要明显（激进/保守/探索/社交等意图）
- 选择点要自然：剧情确实在那个时刻让主角面临抉择，不要生硬插入

输出 JSON（只输出 JSON）：
{{
  "choice_points": [
    {{
      "beat_id": "b2",
      "reason": "为什么这里会面临选择（一句话）",
      "branches": [
        {{"intent": "激进", "risk": "high", "hint": "这个分支是什么方向（一句话）"}},
        {{"intent": "保守", "risk": "low", "hint": "这个分支是什么方向（一句话）"}}
      ]
    }}
  ]
}}{issues_hint}"""

    response = llm.invoke(prompt)
    draft = response.content.strip()

    return {
        "choice_draft": draft,
        "choice_validation": {"choice_plan": None, "parsed": False},
        "messages": [f"[2/4] 观察主线找选择点{'（重试'+str(retry+1)+'）' if retry > 0 else ''}"],
    }


def validate_choice_plan(state: StoryState) -> dict:
    """校验选择点观察结果"""
    choice_plan = extract_json(state.get("choice_draft", ""))
    retry = state.get("choice_retry", 0)
    trunk = state["trunk"]
    beats = trunk.get("beats", [])

    if not choice_plan:
        return {
            "choice_validation": {"choice_plan": None, "parsed": False, "is_valid": False,
                                  "issues": ["JSON 解析失败"]},
            "messages": [f"  ✗ 观察结果校验失败：JSON 解析失败（第{retry+1}次）"],
        }

    cps = choice_plan.get("choice_points", [])
    issues = []
    beat_ids = [b.get("id") for b in beats]

    if not (MIN_CHOICE_POINTS <= len(cps) <= MAX_CHOICE_POINTS):
        issues.append(f"选择点应为 {MIN_CHOICE_POINTS}-{MAX_CHOICE_POINTS} 个，实际 {len(cps)}")

    last_beat = beats[-1].get("id") if beats else None
    first_beat = beats[0].get("id") if beats else None

    for cp in cps:
        bid = cp.get("beat_id")
        if bid not in beat_ids:
            issues.append(f"选择点 beat_id {bid} 不存在于主线")
        elif bid == first_beat or bid == last_beat:
            issues.append(f"选择点 {bid} 不能是第一幕或结局幕")
        n_branch = len(cp.get("branches", []))
        if not (MIN_BRANCHES <= n_branch <= MAX_BRANCHES):
            issues.append(f"选择点 {bid}: 分支数应为 {MIN_BRANCHES}-{MAX_BRANCHES}，实际 {n_branch}")

    is_valid = len(issues) == 0
    return {
        "choice_validation": {
            "choice_plan": choice_plan,
            "parsed": True,
            "is_valid": is_valid,
            "issues": issues[:8],
            "stats": {"points": len(cps)},
        },
        "messages": [
            f"  {'✓' if is_valid else '✗'} 选择点观察{'通过' if is_valid else '失败'}（{len(cps)}个选择点）" +
            (f"，问题: {issues[0]}" if issues else "")
        ],
    }


def route_after_choices(state: StoryState) -> Literal["accept_choices", "rewrite_choices"]:
    val = state.get("choice_validation", {})
    if val.get("is_valid"):
        return "accept_choices"
    if state.get("choice_retry", 0) >= MAX_RETRIES:
        return "accept_choices"
    return "rewrite_choices"


def rewrite_choices(state: StoryState) -> dict:
    return {
        "choice_retry": state.get("choice_retry", 0) + 1,
        "messages": [f"  → 重新观察选择点"],
    }


def accept_choices(state: StoryState) -> dict:
    plan = state["choice_validation"]["choice_plan"]
    points = plan.get("choice_points", [])
    branch_summary = "，".join([f"{p.get('beat_id')}({len(p.get('branches',[]))}支)" for p in points])
    return {
        "choice_plan": plan,
        "branch_results": [],
        "current_choice_index": 0,
        "choice_retry": 0,
        "messages": [f"[2/4完成] 观察到 {len(points)} 个选择点：{branch_summary}"],
    }


# ========== 阶段 3：续写分支（逐选择点） ==========

def get_current_choice_point(state: StoryState) -> dict:
    """取当前要处理的选择点，缓存到 state"""
    plan = state["choice_plan"]
    idx = state["current_choice_index"]
    return plan["choice_points"][idx]


def generate_branches(state: StoryState) -> dict:
    """为当前选择点续写分支（完整叙事）"""
    trunk = state["trunk"]
    cp = get_current_choice_point(state)
    retry = state.get("branch_retry", 0)
    llm = get_llm(temperature=0.85 if retry == 0 else 0.7, max_tokens=4000)

    trunk_text = build_trunk_text(trunk)
    beat_id = cp.get("beat_id")
    reason = cp.get("reason", "")
    branches_hint = "\n".join([
        f"  - {b.get('intent','')}/{b.get('risk','')}: {b.get('hint','')}"
        for b in cp.get("branches", [])
    ])

    # 主线的幕顺序（用于提示 merge_to 合法性）
    beats = trunk.get("beats", [])
    beat_list = ", ".join([f"{b.get('id')}" for b in beats])
    cp_idx = next((i for i, b in enumerate(beats) if b.get("id") == beat_id), 0)
    after = [b.get("id") for b in beats[cp_idx + 1:]]

    issues_hint = ""
    if retry > 0 and state.get("branch_draft"):
        issues = state.get("branch_validation", {}).get("issues", [])
        issues_hint = (
            f"\n\n【上一次续写失败的问题】（必须全部修复）\n"
            f"{chr(10).join('- ' + i for i in issues)}"
        )

    prompt = f"""你是一个小说家。主线故事已经写好，现在要在选择点 {beat_id} 处续写分支剧情。

【主线故事】（全文）
{trunk_text}

【当前选择点】{beat_id}（原因：{reason}）
设计的分支方向：
{branches_hint}

要求：
- 为每个分支续写 **1 个叙事节点**（80-120 字，第二人称"你"），描述选择该分支后发生的事
- 分支剧情必须与主线衔接：承接 {beat_id} 的处境，为汇回主线做准备
- **分支最终汇回主线**：分支的节点要回归主线后续的某一幕（merge_to 填主线幕 id，可选值：{after}）
- 分支之间后果要有差异（不同风险对应不同回报/代价）
- 可以选择 1 个分支标记 is_ending=true（成为独立结局，不再汇回主线），其余分支必须 merge_to
- 注意：结局数量（主线结局 + is_ending 分支）控制在 2-3 个，不要把所有分支都变成结局
- **保持冒险探索风格**：不写主角身世/家族/亲属，不出现原作人物与势力（萧炎、药老、萧家等），分支内容是冒险路上的新遭遇（凶兽、险境、机缘、他人）

输出 JSON（只输出 JSON）：
{{
  "beat_id": "{beat_id}",
  "branches": [
    {{
      "text": "选项文字（10-20字）",
      "intent": "激进",
      "risk": "high",
      "nodes": [
        {{"title": "分支节点标题（4-8字）", "summary": "剧情要点", "narrative": "80-120字正文"}}
      ],
      "merge_to": "b4",
      "is_ending": false
    }}
  ]
}}{issues_hint}"""

    response = llm.invoke(prompt)
    draft = response.content.strip()

    return {
        "branch_draft": draft,
        "branch_validation": {"branches": None, "parsed": False},
        "messages": [f"[3/4] 续写选择点 {beat_id} 的分支{'（重试'+str(retry+1)+'）' if retry > 0 else ''}"],
    }


def validate_branches(state: StoryState) -> dict:
    """校验当前选择点的分支续写"""
    val = extract_json(state.get("branch_draft", ""))
    retry = state.get("branch_retry", 0)
    trunk = state["trunk"]
    beats = trunk.get("beats", [])
    cp = get_current_choice_point(state)
    beat_id = cp.get("beat_id")

    if not val:
        return {
            "branch_validation": {"branches": None, "parsed": False, "is_valid": False,
                                  "issues": ["JSON 解析失败"]},
            "messages": [f"  ✗ 分支续写校验失败：JSON 解析失败（第{retry+1}次）"],
        }

    if val.get("beat_id") != beat_id:
        return {
            "branch_validation": {"branches": None, "parsed": False, "is_valid": False,
                                  "issues": [f"beat_id 应为 {beat_id}，实际 {val.get('beat_id')}"]},
            "messages": [f"  ✗ 分支续写校验失败：beat_id 不匹配"],
        }

    branches = val.get("branches", [])
    expected = len(cp.get("branches", []))
    issues = []

    if len(branches) != expected:
        issues.append(f"分支数应为 {expected}，实际 {len(branches)}")

    # 分支走向合法性
    cp_idx = next((i for i, b in enumerate(beats) if b.get("id") == beat_id), 0)
    after_ids = [b.get("id") for b in beats[cp_idx + 1:]]
    last_beat = beats[-1].get("id") if beats else None

    for i, br in enumerate(branches):
        if not br.get("text"):
            issues.append(f"分支{i+1}: 缺少 text")
        nodes = br.get("nodes", [])
        if not (1 <= len(nodes) <= 2):
            issues.append(f"分支{i+1}: 节点数应为 1-2，实际 {len(nodes)}")
        for j, nd in enumerate(nodes):
            if not nd.get("narrative"):
                issues.append(f"分支{i+1}节点{j+1}: 缺少 narrative")
            elif len(nd.get("narrative", "")) < 40:
                issues.append(f"分支{i+1}节点{j+1}: 叙事过短（建议80-120字）")
        # merge 合法性
        if br.get("is_ending"):
            pass
        elif br.get("merge_to"):
            if br["merge_to"] not in after_ids:
                issues.append(f"分支{i+1}: merge_to {br['merge_to']} 不是 {beat_id} 之后的幕（可选: {after_ids}）")
        else:
            issues.append(f"分支{i+1}: 既不是结局(is_ending)也没有 merge_to")

    # 结局数量约束：全局主线结局1个 + 本选择点 is_ending 分支数，不得超过 MAX_ENDINGS
    ending_count = 1  # 主线结局
    for br in branches:
        if br.get("is_ending"):
            ending_count += 1
    if ending_count > MAX_ENDINGS:
        issues.append(f"结局过多：主线1个 + 本选择点 {ending_count-1} 个 = {ending_count}（最多{MAX_ENDINGS}个）")

    is_valid = len(issues) == 0
    return {
        "branch_validation": {
            "branches": val,
            "parsed": True,
            "is_valid": is_valid,
            "issues": issues[:8],
        },
        "messages": [
            f"  {'✓' if is_valid else '✗'} 选择点 {beat_id} 分支续写{'通过' if is_valid else '失败'}" +
            (f"，问题: {issues[0]}" if issues else "")
        ],
    }


def route_after_branches(state: StoryState) -> Literal["accept_branches", "rewrite_branches"]:
    val = state.get("branch_validation", {})
    if val.get("is_valid"):
        return "accept_branches"
    if state.get("branch_retry", 0) >= MAX_RETRIES:
        return "accept_branches"
    return "rewrite_branches"


def rewrite_branches(state: StoryState) -> dict:
    return {
        "branch_retry": state.get("branch_retry", 0) + 1,
        "messages": [f"  → 重写选择点 {get_current_choice_point(state).get('beat_id')} 的分支"],
    }


def accept_branches(state: StoryState) -> dict:
    """接受当前选择点的分支，推进到下一个选择点或进入组装"""
    cp = get_current_choice_point(state)
    result = state["branch_validation"]["branches"]
    branch_results = state["branch_results"] + [result]

    n_ending = sum(1 for br in result.get("branches", []) if br.get("is_ending"))
    msg = f"  → 选择点 {cp.get('beat_id')} 分支已接受（{len(result.get('branches', []))}支，其中{n_ending}支结局）"

    idx = state["current_choice_index"] + 1
    if idx < len(state["choice_plan"]["choice_points"]):
        return {
            "branch_results": branch_results,
            "current_choice_index": idx,
            "branch_retry": 0,
            "messages": [msg],
        }
    return {
        "branch_results": branch_results,
        "current_choice_index": idx,
        "branch_retry": 0,
        "messages": [msg, "[3/4完成] 所有选择点分支续写完毕"],
    }


# ========== 阶段 4：组装 ==========

def assemble(state: StoryState) -> dict:
    """主线 + 分支组装成最终节点图，程序化强校验。

    构建逻辑（两遍）：
      第一遍：按主线幕顺序生成节点，分配真实 id（n1..nN）。
              - 普通幕 → narrative/ending 节点
              - 选择幕 → choice 节点 + 每个分支展开的 1-2 个 narrative 节点链
              记录 beat_id → 该幕入口节点 id 的映射。
      第二遍：解析所有引用。
              - 主线叙事幕 next → 下一幕入口节点
              - 分支链内部 next → 链内下一节点
              - 分支链尾 → merge_to 幕入口节点（或 ending 无 next）
    """
    trunk = state["trunk"]
    beats = trunk.get("beats", [])
    branch_results = state["branch_results"]
    title = trunk.get("title", "")

    choice_map = {cp["beat_id"]: cp for cp in state["choice_plan"]["choice_points"]}
    branch_map = {r["beat_id"]: r["branches"] for r in branch_results}

    nodes = []           # 全部节点（含分支节点）
    beat_entry = {}      # beat_id → 该幕入口节点 id
    branch_tails = []    # [(分支链尾节点, merge_to_beat_id)]
    next_id = 1

    # ---- 第一遍：建节点 ----
    for i, beat in enumerate(beats):
        bid = beat.get("id")
        is_last = (i == len(beats) - 1)

        if bid in choice_map:
            # 选择幕：choice 节点
            choice_node = {
                "id": f"n{next_id}",
                "type": "choice",
                "title": beat.get("title", ""),
                "summary": beat.get("summary", ""),
                "narrative": beat.get("narrative", ""),
                "choices": [],
            }
            next_id += 1
            beat_entry[bid] = choice_node["id"]
            nodes.append(choice_node)

            # 各分支展开为节点链
            for br in branch_map.get(bid, []):
                chain = []
                for nd in br.get("nodes", []):
                    chain.append({
                        "id": f"n{next_id}",
                        "type": "narrative",
                        "title": nd.get("title", ""),
                        "summary": nd.get("summary", ""),
                        "narrative": nd.get("narrative", ""),
                        "next": None,
                    })
                    next_id += 1
                if not chain:
                    continue
                # 链内连接
                for k in range(len(chain) - 1):
                    chain[k]["next"] = chain[k + 1]["id"]
                # 链尾：ending 或 merge
                tail = chain[-1]
                if br.get("is_ending"):
                    tail["type"] = "ending"
                    tail["next"] = None
                else:
                    branch_tails.append((tail, br.get("merge_to")))
                # choice 分支指向链首
                choice_node["choices"].append({
                    "text": br.get("text", ""),
                    "intent": br.get("intent", ""),
                    "risk": br.get("risk", "medium"),
                    "next": chain[0]["id"],
                    "outcome_hint": br.get("outcome_hint", tail.get("summary", "")),
                })
                nodes.extend(chain)
        else:
            # 普通幕
            n = {
                "id": f"n{next_id}",
                "type": "ending" if is_last else "narrative",
                "title": beat.get("title", ""),
                "summary": beat.get("summary", ""),
                "narrative": beat.get("narrative", ""),
                "next": None,
            }
            next_id += 1
            beat_entry[bid] = n["id"]
            nodes.append(n)

    # ---- 第二遍：解析引用 ----
    # 主线叙事幕 next → 下一幕入口
    for i, beat in enumerate(beats):
        if i >= len(beats) - 1:
            continue
        bid = beat.get("id")
        if bid in choice_map:
            continue  # 选择幕由 choices 驱动，无 next
        nxt = beats[i + 1].get("id")
        entry = beat_entry.get(bid)
        for n in nodes:
            if n["id"] == entry:
                n["next"] = beat_entry.get(nxt)
                break
    # 分支链尾 merge → 目标幕入口
    for tail, merge_to in branch_tails:
        if merge_to in beat_entry:
            tail["next"] = beat_entry[merge_to]

    outline = {"title": title, "nodes": nodes}

    # ---- 强校验 + 修复 + 重新编号 ----
    outline, issues = _sanitize_outline(outline)
    outline = _renumber_outline(outline)
    ok, remaining = _validate_structure(outline)

    msgs = [f"[4/4] 组装完成：{len(nodes)}节点"]
    if issues:
        msgs += [f"  ⚠ {log}" for log in issues[:6]]
    if remaining:
        msgs.append(f"  ⚠ 修复后仍有问题: {remaining[:4]}")

    return {
        "outline": outline,
        "messages": msgs,
    }


def _sanitize_outline(outline: dict) -> tuple[dict, list[str]]:
    """程序化修复残破地图，保证最终结构健康。

    修复项：
      1. 断链：next / 分支 next 指向不存在的 id → 重新指向前向存在的节点
      2. 自环、回指（指向序号更小的节点）→ 同上修正
      3. 同一 choice 分支重复指向 → 保留第一个，其余重指向
      4. choice 有效分支 < 2 → 降级为 narrative
      5. 超预算：删除多余叙事节点（优先删非分支目标），引用重定向
      6. ending 误带 next/分支 → 清空；结局数量不足 → 末尾节点补 ending
    返回 (修复后的地图, 修复日志)。
    """
    nodes = [dict(n) for n in outline.get("nodes", [])]
    if not nodes:
        return outline, ["节点列表为空，无法修复"]

    ids = [n.get("id", "") for n in nodes]
    id_set = set(ids)
    logs = []

    # ---- 节点数裁剪：超预算时删多余叙事节点（保留 choice/ending 及分支目标） ----
    if len(nodes) > MAX_NODES:
        over = len(nodes) - MAX_NODES
        removed = 0
        protected = set()
        for n in nodes:
            for c in n.get("choices", []):
                if c.get("next"):
                    protected.add(c["next"])

        def candidates(only_unprotected: bool):
            out = []
            for i in range(len(nodes) - 1, 0, -1):
                n = nodes[i]
                if n.get("type") != "narrative":
                    continue
                if only_unprotected and n.get("id") in protected:
                    continue
                out.append(i)
            return out

        while removed < over:
            idx_list = candidates(only_unprotected=True)
            if not idx_list:
                idx_list = candidates(only_unprotected=False)
            if not idx_list:
                break
            i = idx_list[0]
            victim_id = nodes[i].get("id")
            target = nodes[i].get("next")
            if not target or target not in id_set or target == victim_id:
                target = next((n.get("id") for n in nodes[i+1:]), None)
            for n in nodes:
                if n.get("type") == "narrative" and n.get("next") == victim_id:
                    n["next"] = target
                for c in n.get("choices", []):
                    if c.get("next") == victim_id:
                        c["next"] = target
            del nodes[i]
            id_set.discard(victim_id)
            protected.discard(victim_id)
            logs.append(f"裁剪: 删除超预算叙事节点 {victim_id}（引用重定向到 {target}）")
            removed += 1

    # ---- 剔除不可达的孤立叙事幕（无任何入边） ----
    # 原因：分支 merge_to 可能跳过主线中间幕，导致该幕无节点引用它。
    # 剔除前先重建入边（基于当前 next 引用），只删 narrative 类型，choice/ending 保留。
    if len(nodes) > 1:
        incoming = {n.get("id"): [] for n in nodes}
        for n in nodes:
            if n.get("next"):
                incoming.setdefault(n["next"], []).append(n.get("id"))
            for c in n.get("choices", []):
                if c.get("next"):
                    incoming.setdefault(c["next"], []).append(n.get("id"))
        start_id = nodes[0].get("id")
        orphan = [n.get("id") for n in nodes
                  if n.get("type") == "narrative"
                  and n.get("id") != start_id
                  and not incoming.get(n.get("id"))]
        for oid in orphan:
            nodes = [n for n in nodes if n.get("id") != oid]
            id_set.discard(oid)
            logs.append(f"剔除: 删除不可达叙事节点 {oid}（无入边，分支跳过了它）")

    # ---- 逐节点修引用 ----
    ids = [n.get("id", "") for n in nodes]
    id_set = set(ids)

    def next_forward_ids(i):
        return [n.get("id") for n in nodes[i:]]

    for i, n in enumerate(nodes):
        nid = n.get("id")
        ntype = n.get("type", "narrative")
        fwd = next_forward_ids(i)

        def pick_next(cur):
            if cur in id_set:
                m1 = re.match(r'n(\d+)', str(nid))
                m2 = re.match(r'n(\d+)', str(cur))
                if m1 and m2 and int(m2.group(1)) > int(m1.group(1)):
                    return cur
            fallback = next((x for x in fwd if x != nid), None)
            if fallback and cur != fallback:
                logs.append(f"{nid}: next {cur} 无效，重定向到 {fallback}")
            return fallback

        if ntype == "narrative":
            n["next"] = pick_next(n.get("next"))
        elif ntype == "choice":
            seen = set()
            kept = []
            for c in n.get("choices", []):
                target = pick_next(c.get("next"))
                if target is None or target in seen:
                    continue
                seen.add(target)
                c = dict(c)
                c["next"] = target
                kept.append(c)
            if len(kept) >= 2:
                n["choices"] = kept
                if len(kept) < len(n.get("choices", [])):
                    logs.append(f"{nid}: 移除 {len(n.get('choices',[])) - len(kept)} 个重复/无效分支")
            else:
                target = next((x for x in fwd if x != nid), None)
                n["type"] = "narrative"
                n.pop("choices", None)
                n["next"] = target
                logs.append(f"{nid}: 有效分支不足，降级为叙事节点")
        elif ntype == "ending":
            n["next"] = None
            n["choices"] = []

    # ---- 结局数量兜底 ----
    n_ending = sum(1 for n in nodes if n.get("type") == "ending")
    if n_ending < MIN_ENDINGS:
        for n in reversed(nodes):
            if n.get("type") != "ending":
                n["type"] = "ending"
                n["next"] = None
                n.pop("choices", None)
                n_ending += 1
                logs.append(f"{n.get('id')}: 结局数量不足，降级为结局节点")
                if n_ending >= MIN_ENDINGS:
                    break

    return {"title": outline.get("title", ""), "nodes": nodes}, logs


def _renumber_outline(outline: dict) -> dict:
    """按节点顺序重新编号为 n1..nN，并同步更新所有 next / 分支引用。"""
    nodes = outline.get("nodes", [])
    if not nodes:
        return outline

    id_map = {}
    for i, n in enumerate(nodes, start=1):
        id_map[n.get("id")] = f"n{i}"
        n["id"] = f"n{i}"

    for n in nodes:
        if n.get("type") == "narrative" and n.get("next"):
            n["next"] = id_map.get(n["next"], n["next"])
        for c in n.get("choices", []):
            if c.get("next"):
                c["next"] = id_map.get(c["next"], c["next"])

    return outline


def _validate_structure(outline: dict) -> tuple[bool, list[str]]:
    """最终结构校验（只读，返回 (是否健康, 问题列表)）"""
    nodes = outline.get("nodes", [])
    issues = []
    ids = [n.get("id", "") for n in nodes]
    id_set = set(ids)

    if len(ids) != len(set(ids)):
        issues.append("节点 id 重复")
    n_choice = sum(1 for n in nodes if n.get("type") == "choice")
    n_ending = sum(1 for n in nodes if n.get("type") == "ending")
    if not (MIN_NODES <= len(nodes) <= MAX_NODES):
        issues.append(f"节点数应为 {MIN_NODES}-{MAX_NODES}，实际 {len(nodes)}")
    if not (MIN_ENDINGS <= n_ending <= MAX_ENDINGS):
        issues.append(f"结局应为 {MIN_ENDINGS}-{MAX_ENDINGS} 个，实际 {n_ending}")

    for n in nodes:
        nid = n.get("id")
        ntype = n.get("type")
        if ntype not in ("narrative", "choice", "ending"):
            issues.append(f"节点 {nid} 类型非法: {ntype}")
        if not n.get("narrative"):
            issues.append(f"节点 {nid}: 缺少 narrative")
        if ntype == "narrative" and not n.get("next"):
            issues.append(f"节点 {nid}: 叙事节点缺少 next")
        if ntype == "ending" and (n.get("next") or n.get("choices")):
            issues.append(f"节点 {nid}: 结局节点不应有 next 或分支")
        if ntype == "choice":
            choices = n.get("choices", [])
            if len(choices) < 2:
                issues.append(f"节点 {nid}: 分支不足")
            targets = [c.get("next") for c in choices if c.get("next")]
            if len(targets) != len(set(targets)):
                issues.append(f"节点 {nid}: 分支重复指向")
        # 断链
        for c in n.get("choices", []):
            if c.get("next") and c["next"] not in id_set:
                issues.append(f"节点 {nid}: 断链 → {c['next']}")
        if n.get("next") and n["next"] not in id_set:
            issues.append(f"节点 {nid}: 断链 → {n['next']}")

    return len(issues) == 0, issues


# ========== 输出 ==========

def check_continue_branches(state: StoryState) -> Literal["continue", "assemble"]:
    idx = state["current_choice_index"]
    total = len(state["choice_plan"]["choice_points"])
    if idx >= total:
        return "assemble"
    return "continue"


def finish(state: StoryState) -> dict:
    """输出最终故事"""
    outline = state["outline"]
    nodes = outline.get("nodes", [])
    n_narrative = sum(1 for n in nodes if n.get("type") == "narrative")
    n_choice = sum(1 for n in nodes if n.get("type") == "choice")
    n_ending = sum(1 for n in nodes if n.get("type") == "ending")

    # 清理辅助字段
    for n in nodes:
        n.pop("merge_to", None)

    story = {
        "title": outline.get("title", ""),
        "nodes": nodes,
    }

    return {
        "final_story": story,
        "messages": [f"完成！{len(nodes)}节点（{n_narrative}叙事/{n_choice}选择/{n_ending}结局）"],
    }


# ========== 构建工作流 ==========

def build_story_workflow():
    workflow = StateGraph(StoryState)

    # 阶段 1：主线
    workflow.add_node("generate_trunk", generate_trunk)
    workflow.add_node("validate_trunk", validate_trunk)
    workflow.add_node("rewrite_trunk", rewrite_trunk)
    workflow.add_node("accept_trunk", accept_trunk)

    # 阶段 2：观察
    workflow.add_node("observe_choices", observe_choices)
    workflow.add_node("validate_choices", validate_choice_plan)
    workflow.add_node("rewrite_choices", rewrite_choices)
    workflow.add_node("accept_choices", accept_choices)

    # 阶段 3：续写
    workflow.add_node("generate_branches", generate_branches)
    workflow.add_node("validate_branches", validate_branches)
    workflow.add_node("rewrite_branches", rewrite_branches)
    workflow.add_node("accept_branches", accept_branches)

    # 阶段 4：组装
    workflow.add_node("assemble", assemble)
    workflow.add_node("finish", finish)

    # 入口
    workflow.set_entry_point("generate_trunk")

    # 阶段 1
    workflow.add_edge("generate_trunk", "validate_trunk")
    workflow.add_conditional_edges(
        "validate_trunk",
        route_after_trunk,
        {"accept_trunk": "accept_trunk", "rewrite_trunk": "rewrite_trunk"},
    )
    workflow.add_edge("rewrite_trunk", "generate_trunk")
    workflow.add_edge("accept_trunk", "observe_choices")

    # 阶段 2
    workflow.add_edge("observe_choices", "validate_choices")
    workflow.add_conditional_edges(
        "validate_choices",
        route_after_choices,
        {"accept_choices": "accept_choices", "rewrite_choices": "rewrite_choices"},
    )
    workflow.add_edge("rewrite_choices", "observe_choices")
    workflow.add_edge("accept_choices", "generate_branches")

    # 阶段 3（逐选择点循环）
    workflow.add_edge("generate_branches", "validate_branches")
    workflow.add_conditional_edges(
        "validate_branches",
        route_after_branches,
        {"accept_branches": "accept_branches", "rewrite_branches": "rewrite_branches"},
    )
    workflow.add_edge("rewrite_branches", "generate_branches")
    workflow.add_conditional_edges(
        "accept_branches",
        check_continue_branches,
        {"continue": "generate_branches", "assemble": "assemble"},
    )

    # 阶段 4
    workflow.add_edge("assemble", "finish")
    workflow.add_edge("finish", END)

    return workflow.compile()
