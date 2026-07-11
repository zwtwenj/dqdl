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
