"""
角色 → 知识库来源映射（可配置）。

设计目的：让特定职能的 NPC（如炼药师）只能基于指定的几本"图鉴"
来回答玩家问题，避免它"越界"胡编其他领域（如魔兽/经济）的知识。

配置方式：
  1. 优先读 dqdl-agent/.env 的 ROLE_KNOWLEDGE_JSON（一段 JSON 字符串，
     结构：{ "<role_id>": ["文档文件名", ...] }），便于不改代码热配置。
  2. 回退到本文件里的 ROLE_KNOWLEDGE 默认表（见下）。

文件名必须与 rag/ 目录下的 docx 文件名（即 chunk 的 source 字段）一致。
未配置 role_id 的角色不限制来源（检索全部文档）。
"""
import os
import json
import logging

logger = logging.getLogger('dqdl-agent.role_knowledge')

# ── 默认映射表（role_id → 允许检索的文档文件名列表）──
# 注：role_id 对应 npc_role 表主键，与 seed_npc.py 的插入顺序一致。
#     炼药师 = 第 4 个插入 = role_id 4。
DEFAULT_ROLE_KNOWLEDGE = {
    # 炼药师公会驻场药师：只能回答草药与丹药相关知识
    4: ['草药图鉴.docx', '丹药图鉴.docx'],
}


def _load_from_env():
    """从 .env 的 ROLE_KNOWLEDGE_JSON 读取覆盖配置（失败/缺省返回 None）。"""
    raw = os.getenv('ROLE_KNOWLEDGE_JSON', '').strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            logger.warning('ROLE_KNOWLEDGE_JSON 非对象，忽略')
            return None
        # 规范化 key 为 int、value 为 list[str]
        normalized = {}
        for k, v in data.items():
            try:
                rid = int(k)
            except (TypeError, ValueError):
                continue
            if isinstance(v, str):
                v = [v]
            if not isinstance(v, list):
                continue
            normalized[rid] = [str(x) for x in v]
        return normalized
    except json.JSONDecodeError as e:
        logger.warning(f'ROLE_KNOWLEDGE_JSON 解析失败，忽略：{e}')
        return None


def get_role_sources(role_id):
    """
    返回某角色允许检索的文档来源白名单。

    - 返回 list[str]：只允许检索这些文档（如 ['草药图鉴.docx', '丹药图鉴.docx']）。
    - 返回 None：该角色未配置限制，检索全部文档。

    @param role_id: npc_role.id；为空/非法时返回 None（不限制）。
    """
    if role_id is None:
        return None
    try:
        rid = int(role_id)
    except (TypeError, ValueError):
        return None

    table = _load_from_env() or DEFAULT_ROLE_KNOWLEDGE
    sources = table.get(rid)
    if not sources:
        return None
    return list(sources)
