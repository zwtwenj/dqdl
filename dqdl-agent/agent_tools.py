"""
Agent 工具调用：function calling 循环 + 工具定义。

run_with_tools() 实现多轮 tool-calling 循环：
  LLM 调工具 → 执行工具返回结果 → LLM 继续 → ... → 最终输出

工具分两类：
  - 上下文拉取工具（get_player_combat_info / get_mob_detail）：LLM 按需调用拉取详情
  - 最终输出工具（generate_narrative）：LLM 用结构化 function call 返回结果

设计要点：
  - 工具数据源来自请求体（agent 不查 DB，由 tool_handlers 闭包提供）
  - 最大循环 3 轮（防止 LLM 无限调工具）
  - 每轮 LLM 调用都经 call_with_tools 记录 token
"""
import json
from llm_client import call_with_tools


def run_with_tools(messages, tools, tool_handlers, call_type='unknown',
                   temperature=0.9, max_tokens=800, max_rounds=3,
                   final_tool_name=None, ref_type=None, ref_id=None):
    """执行带工具的 LLM 多轮对话循环。

    参数：
      messages       初始消息列表（system + user）
      tools          工具定义列表（OpenAI function schema）
      tool_handlers  {tool_name: callable} 工具执行器，callable(args_dict) → result_str
      call_type      场景类型（token 统计用）
      final_tool_name 最终输出工具名（LLM 调它即结束循环，返回其参数）
      max_rounds     最大循环轮次（防无限调用）

    返回：
      成功：final_tool 的参数 dict
      失败（LLM 未在 max_rounds 内调用 final_tool）：None
    """
    for _ in range(max_rounds):
        r = call_with_tools(
            messages, tools=tools, tool_choice='auto',
            temperature=temperature, max_tokens=max_tokens,
            call_type=call_type, ref_type=ref_type, ref_id=ref_id,
        )
        msg = r.choices[0].message

        # 无 tool_calls → LLM 直接回复文本（未走工具流程），结束
        if not msg.tool_calls:
            return None

        # 把 assistant 的 tool_calls 消息加入历史
        messages.append(msg.model_dump(exclude_none=True))

        # 处理每个 tool_call
        for tc in msg.tool_calls:
            fn_name = tc.function.name
            # 达到最终输出工具 → 返回其参数
            if final_tool_name and fn_name == final_tool_name:
                try:
                    return json.loads(tc.function.arguments)
                except (json.JSONDecodeError, ValueError):
                    return None

            # 执行上下文拉取工具
            handler = tool_handlers.get(fn_name)
            if handler:
                try:
                    args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                except (json.JSONDecodeError, ValueError):
                    args = {}
                result = handler(args)
            else:
                result = f'工具 {fn_name} 不存在'

            # 把工具结果喂回 LLM
            messages.append({
                'role': 'tool',
                'tool_call_id': tc.id,
                'content': str(result) if result is not None else '',
            })

    # 超过最大轮次仍未输出最终结果
    return None


# ============================================================
#  Training 场景工具定义
# ============================================================
TRAINING_TOOLS = [
    {
        'type': 'function',
        'function': {
            'name': 'get_player_combat_info',
            'description': '获取玩家的功法、斗技等战斗信息（生成叙事前按需调用）',
            'parameters': {'type': 'object', 'properties': {}, 'required': []},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_mob_detail',
            'description': '获取遭遇魔兽的详细描述、外观、弱点（生成叙事前按需调用）',
            'parameters': {'type': 'object', 'properties': {}, 'required': []},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'generate_narrative',
            'description': '生成最终的历练叙事。这是最终输出步骤，调用此工具即结束叙事生成。',
            'parameters': {
                'type': 'object',
                'properties': {
                    'text': {
                        'type': 'string',
                        'description': '150字以内的第三人称历练叙事文本（主语用玩家名，禁止"你""我"）',
                    },
                    'keywords': {
                        'type': 'array',
                        'description': '叙事中出现的关键词',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'text': {'type': 'string', 'description': '关键词原文'},
                                'type': {'type': 'string', 'description': '类型：mob/location/skill/item/player'},
                            },
                            'required': ['text', 'type'],
                        },
                    },
                },
                'required': ['text'],
            },
        },
    },
]
