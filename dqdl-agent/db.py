"""
agent 数据库连接 + AI 调用日志写入。
从 .env 读 DB 配置，兼容 DB_* 和 MYSQL_* 两套变量名。
用 pymysql 直连，写 agent_call_log 表。

设计原则：日志写入是"尽力而为"——任何 DB 异常都吞掉（仅打印错误），
绝不影响 agent 的主业务（生成叙事/地图等）。
"""
import os
import logging
import pymysql

logger = logging.getLogger('dqdl-agent.db')


def _db_config():
    """读取数据库配置，兼容 DB_*（后端用）和 MYSQL_*（旧脚本用）两套变量名"""
    return {
        'host': os.getenv('DB_HOST') or os.getenv('MYSQL_ADDRESS') or '127.0.0.1',
        'port': int(os.getenv('DB_PORT') or os.getenv('MYSQL_PORT') or '3306'),
        'user': os.getenv('DB_USER') or os.getenv('MYSQL_USER') or 'root',
        'password': os.getenv('DB_PASSWORD') or os.getenv('MYSQL_PASSWORD') or '',
        'database': os.getenv('DB_DATABASE') or os.getenv('MYSQL_DATABASE') or 'dqdl1.0',
        'charset': 'utf8mb4',
    }


def log_ai_call(
    call_type,
    model,
    prompt_tokens=0,
    completion_tokens=0,
    total_tokens=0,
    cache_hit_tokens=0,
    cache_miss_tokens=0,
    temperature=None,
    duration_ms=None,
    success=True,
    error_msg=None,
    ref_type=None,
    ref_id=None,
):
    """
    写入一条 agent_call_log 记录。
    - cache_hit_ratio 自动计算（cache_hit / (cache_hit + cache_miss)）。
    - 任何异常都吞掉（日志写入失败不应影响业务），仅打印错误。
    """
    try:
        cache_total = cache_hit_tokens + cache_miss_tokens
        cache_hit_ratio = (cache_hit_tokens / cache_total) if cache_total > 0 else None

        conn = pymysql.connect(**_db_config(), connect_timeout=5)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO agent_call_log
                       (call_type, ref_type, ref_id, model, prompt_tokens, completion_tokens,
                        total_tokens, cache_hit_tokens, cache_miss_tokens, cache_hit_ratio,
                        temperature, duration_ms, success, error_msg)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (
                        call_type,
                        ref_type,
                        ref_id,
                        model,
                        int(prompt_tokens or 0),
                        int(completion_tokens or 0),
                        int(total_tokens or 0),
                        int(cache_hit_tokens or 0),
                        int(cache_miss_tokens or 0),
                        cache_hit_ratio,
                        temperature,
                        duration_ms,
                        1 if success else 0,
                        (error_msg or '')[:500] if error_msg else None,
                    ),
                )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        logger.error(f'写入 agent_call_log 失败（已忽略）: {e}')


def log_dialog_call(
    server_session_id,
    call_index,
    messages=None,
    player_input=None,
    reply=None,
    model=None,
    usage=None,
    duration_ms=None,
    success=True,
    error_msg=None,
):
    """
    写入一条 agent_dialog_call 记录（每次 deepseek 调用一行，智能体视角）。
    server_session_id 绑定 server 端 dialog_session.id（跨服务唯一耦合键）。
    messages 存完整快照（system+history+user，第 N 次天然含前 N-1 次记忆）。
    返回新插入记录的 id（call_id）；任何异常吞掉（日志写入不影响业务）。
    """
    try:
        import json as _json
        u = usage or {}
        conn = pymysql.connect(**_db_config(), connect_timeout=5)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO agent_dialog_call
                       (server_session_id, call_index, messages, player_input, reply, model,
                        prompt_tokens, completion_tokens, total_tokens,
                        cache_hit_tokens, cache_miss_tokens, duration_ms, success, error_msg)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (
                        int(server_session_id),
                        int(call_index),
                        _json.dumps(messages, ensure_ascii=False) if messages is not None else None,
                        (player_input or '')[:500] if player_input else None,
                        reply,
                        model,
                        int(u.get('prompt', 0) or 0),
                        int(u.get('completion', 0) or 0),
                        int(u.get('total', 0) or 0),
                        int(u.get('cache_hit', 0) or 0),
                        int(u.get('cache_miss', 0) or 0),
                        duration_ms,
                        1 if success else 0,
                        (error_msg or '')[:500] if error_msg else None,
                    ),
                )
                call_id = cur.lastrowid
            conn.commit()
            return call_id
        finally:
            conn.close()
    except Exception as e:
        logger.error(f'写入 agent_dialog_call 失败（已忽略）: {e}')
        return None


def save_story(story, source='agent'):
    """把一个多结局分支故事写入 story 表（agent 直接写库）。

    story 结构（由 generate_story.py 的 normalize_story 产出）：
      { story_id, title, summary, theme, start, nodes:{start, map:{...}} }
    本函数额外计算冗余字段：
      - endings_count：nodes.map 里 end=true 的节点数
      - max_depth：从 start 出发的最长链路步数（BFS）

    幂等：story_id 有 UNIQUE 约束，重复插入捕获后返回 None（表示已存在）。
    任何异常吞掉（仅打印错误），返回 None；成功返回新插入的 id。
    """
    import json as _json

    nodes = story.get('nodes') or {}
    node_map = nodes.get('map') or {}
    endings_count = sum(1 for n in node_map.values() if isinstance(n, dict) and n.get('end'))
    max_depth = _story_max_depth(nodes)

    try:
        conn = pymysql.connect(**_db_config(), connect_timeout=5)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO story
                       (story_id, title, summary, theme, nodes, endings_count, max_depth, source)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                    (
                        story.get('story_id', ''),
                        story.get('title', '')[:64],
                        (story.get('summary') or '')[:255],
                        (story.get('theme') or '')[:32] or None,
                        _json.dumps(nodes, ensure_ascii=False),
                        int(endings_count),
                        int(max_depth),
                        source,
                    ),
                )
                new_id = cur.lastrowid
            conn.commit()
            return new_id
        finally:
            conn.close()
    except pymysql.err.IntegrityError as e:
        # 1062 =Duplicate entry（story_id 已存在）
        if e.args and e.args[0] == 1062:
            logger.warning(f'story_id 已存在，跳过入库: {story.get("story_id")}')
            return None
        logger.error(f'写入 story 失败（IntegrityError）: {e}')
        return None
    except Exception as e:
        logger.error(f'写入 story 失败（已忽略）: {e}')
        return None


def _story_max_depth(nodes):
    """计算故事节点图从 start 出发的最长链路步数（DFS + 记忆化）。
    nodes = {start, map:{id:{choices:[{goto}], end?}}}。
    DAG 用记忆化正确处理合流；有环时环路径不计入（返回 -∞ sentinel），避免缓存污染。
    失败返回 0。

    用 DFS 而非 BFS：BFS 的 visited 会让「合流节点」(多条路径汇聚到同一节点)
    只记录最先到达的深度，导致最长链路算错。DFS 递归返回每个节点到结局的最大步数，
    合流节点取所有后继的最大值，正确。
    """
    try:
        node_map = nodes.get('map') or {}
        start = nodes.get('start')
        if not start or start not in node_map:
            return 0

        memo = {}           # nodeId -> 到任意结局的最大步数（仅缓存无环路径的结果）
        CYCLE = -1          # 环 sentinel：表示该分支走入环，不计有效深度

        def dfs(nid, path):
            """返回从 nid 到任意结局节点的最大步数；环路径返回 CYCLE。"""
            if nid in memo:
                return memo[nid]
            if nid in path:
                return CYCLE  # 环：不计入，不缓存（缓存会污染其他路径）
            node = node_map.get(nid)
            if not isinstance(node, dict):
                return 0
            if node.get('end'):
                return 0
            choices = node.get('choices') or []
            if not choices:
                return 0
            best = 0
            next_path = path | {nid}
            for c in choices:
                if isinstance(c, dict) and c.get('goto'):
                    sub = dfs(c['goto'], next_path)
                    if sub == CYCLE:
                        continue  # 环路径跳过，不参与比较
                    if sub + 1 > best:
                        best = sub + 1
            memo[nid] = best
            return best

        return dfs(start, frozenset())
    except Exception:
        return 0
