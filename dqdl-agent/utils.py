"""
JSON 解析纯函数：从 AI 回复中提取 JSON。

兼容 LLM 返回的多种格式（markdown 代码块包裹、前后多余文字等）。
无外部依赖，纯函数。
"""
import re
import json


def parse_json_response(content):
    """从 AI 回复中提取 JSON 数组（list）。"""
    json_str = content
    # markdown code block
    m = re.search(r'```(?:json)?\s*([\s\S]*?)```', content)
    if m:
        json_str = m.group(1).strip()
    # 找 JSON 数组
    m = re.search(r'\[[\s\S]*\]', json_str)
    if m:
        json_str = m.group(0)
    parsed = json.loads(json_str)
    if not isinstance(parsed, list):
        raise ValueError('Expected JSON array')
    return parsed


def _parse_json_object(content):
    """从 AI 回复中提取 JSON 对象（dict）。"""
    json_str = content
    m = re.search(r'```(?:json)?\s*([\s\S]*?)```', content)
    if m:
        json_str = m.group(1).strip()
    m = re.search(r'\{[\s\S]*\}', json_str)
    if m:
        json_str = m.group(0)
    obj = json.loads(json_str)
    if not isinstance(obj, dict):
        raise ValueError('Expected JSON object')
    return obj
