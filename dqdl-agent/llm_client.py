"""
LLM 调用封装：统一入口 + token 消耗统计。

- call_deepseek: system+user 两条消息的调用（map/training/encounter/breakthrough/dungeon/event）
- _chat_with_logging: 多轮 messages 数组调用（dialog）
- _extract_usage: 从 OpenAI 响应提取 token 统计

按 config._pick_client(call_type) 自动选择平台/模型，推理模型自动关闭思考。
所有调用记录 token 消耗到 agent_call_log 表（DB 不可用时降级忽略）。
"""
import time
from config import _pick_client
from db import log_ai_call


def call_deepseek(system_prompt, user_prompt, temperature=0.85, max_tokens=4000,
                  call_type='unknown', ref_type=None, ref_id=None):
    """调用 LLM 生成（按 call_type 自动选模型），并记录 token 消耗到 agent_call_log。
    返回 (content, usage_dict)；usage_dict 含 prompt/completion/total/cache_* tokens。"""
    client, model, need_disable_thinking = _pick_client(call_type)
    start = time.time()
    try:
        kwargs = dict(
            model=model,
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        # GLM/R1 等推理模型默认带思考，会吃掉大量输出 token，这里关闭以省 token 和提速
        if need_disable_thinking:
            kwargs['extra_body'] = {'thinking': {'type': 'disabled'}}
        r = client.chat.completions.create(**kwargs)
        duration_ms = int((time.time() - start) * 1000)
        content = r.choices[0].message.content

        # 解析 usage（DeepSeek 返回 prompt_cache_hit_tokens；GLM 可能无此字段）
        u = _extract_usage(getattr(r, 'usage', None))
        log_ai_call(
            call_type=call_type, model=model,
            prompt_tokens=u['prompt'], completion_tokens=u['completion'],
            total_tokens=u['total'], cache_hit_tokens=u['cache_hit'],
            cache_miss_tokens=u['cache_miss'], temperature=temperature,
            duration_ms=duration_ms, success=True,
            ref_type=ref_type, ref_id=ref_id,
        )
        return content, u
    except Exception as e:
        duration_ms = int((time.time() - start) * 1000)
        log_ai_call(
            call_type=call_type, model=model, temperature=temperature,
            duration_ms=duration_ms, success=False, error_msg=str(e),
            ref_type=ref_type, ref_id=ref_id,
        )
        raise


def _chat_with_logging(messages, temperature=0.85, max_tokens=4000,
                       call_type='unknown', ref_type=None, ref_id=None):
    """直接用 messages 数组调 LLM（按 call_type 选模型）并记录 token 消耗。
    供 dialog 等多轮对话场景使用（call_deepseek 只支持 system+user 两条）。
    返回 (content, usage_dict)。"""
    client, model, need_disable_thinking = _pick_client(call_type)
    start = time.time()
    try:
        kwargs = dict(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if need_disable_thinking:
            kwargs['extra_body'] = {'thinking': {'type': 'disabled'}}
        r = client.chat.completions.create(**kwargs)
        duration_ms = int((time.time() - start) * 1000)
        content = r.choices[0].message.content
        u = _extract_usage(getattr(r, 'usage', None))
        log_ai_call(
            call_type=call_type, model=model,
            prompt_tokens=u['prompt'], completion_tokens=u['completion'],
            total_tokens=u['total'], cache_hit_tokens=u['cache_hit'],
            cache_miss_tokens=u['cache_miss'], temperature=temperature,
            duration_ms=duration_ms, success=True,
            ref_type=ref_type, ref_id=ref_id,
        )
        return content, u
    except Exception as e:
        duration_ms = int((time.time() - start) * 1000)
        log_ai_call(
            call_type=call_type, model=model, temperature=temperature,
            duration_ms=duration_ms, success=False, error_msg=str(e),
            ref_type=ref_type, ref_id=ref_id,
        )
        raise


def _extract_usage(usage):
    """从 OpenAI 响应对象的 usage 提取 token 统计，兼容字段缺失"""
    if usage is None:
        return {'prompt': 0, 'completion': 0, 'total': 0, 'cache_hit': 0, 'cache_miss': 0}
    # usage 可能是对象（有属性）或 dict
    def g(key, default=0):
        if hasattr(usage, key):
            return getattr(usage, key) or default
        if isinstance(usage, dict):
            return usage.get(key, default) or default
        return default
    return {
        'prompt': g('prompt_tokens'),
        'completion': g('completion_tokens'),
        'total': g('total_tokens'),
        'cache_hit': g('prompt_cache_hit_tokens'),
        'cache_miss': g('prompt_cache_miss_tokens'),
    }


def call_with_tools(messages, tools=None, tool_choice='auto', temperature=0.85,
                    max_tokens=4000, call_type='unknown', ref_type=None, ref_id=None):
    """带 tools 的单轮 LLM 调用（function calling）。
    返回 OpenAI 响应对象（含 choices[0].message.tool_calls）。
    token 消耗记录到 agent_call_log。多轮工具循环由 agent_tools.run_with_tools 处理。"""
    client, model, need_disable_thinking = _pick_client(call_type)
    start = time.time()
    try:
        kwargs = dict(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if tools:
            kwargs['tools'] = tools
            kwargs['tool_choice'] = tool_choice
        if need_disable_thinking:
            kwargs['extra_body'] = {'thinking': {'type': 'disabled'}}
        r = client.chat.completions.create(**kwargs)
        duration_ms = int((time.time() - start) * 1000)
        u = _extract_usage(getattr(r, 'usage', None))
        log_ai_call(
            call_type=call_type, model=model,
            prompt_tokens=u['prompt'], completion_tokens=u['completion'],
            total_tokens=u['total'], cache_hit_tokens=u['cache_hit'],
            cache_miss_tokens=u['cache_miss'], temperature=temperature,
            duration_ms=duration_ms, success=True,
            ref_type=ref_type, ref_id=ref_id,
        )
        return r
    except Exception as e:
        duration_ms = int((time.time() - start) * 1000)
        log_ai_call(
            call_type=call_type, model=model, temperature=temperature,
            duration_ms=duration_ms, success=False, error_msg=str(e),
            ref_type=ref_type, ref_id=ref_id,
        )
        raise
