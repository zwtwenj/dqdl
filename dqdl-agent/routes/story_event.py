"""
故事事件生成路由：POST /generate/story-event

管理平台「生成事件」按钮的后端链路。内部通过 subprocess 串行调用：
  1. dqdl_writer/main.py  —— v5 生成网状冒险故事（world rules + 叙事弧 + 主线→观察→续写），
                            产出 output/story_{timestamp}.json
  2. dqdl-agent/adapt_story.py --story <json>
                            —— 结构转换 + LLM 决策 action + 向量库回填 mob/地图/奖励 + 入库 story_event

用 subprocess 而非直接 import：dqdl_writer 依赖 langchain-openai，dqdl-agent 依赖 openai，
两套 LLM 客户端环境不同，子进程天然隔离。
生成是耗时操作（多段 LLM），管理后台低并发，同步执行返回结果。

Body: 可选 { prompt: "事件主题指令" }
Returns: { ok, story_id, title, event_id }  （story_event 入库后的记录）
"""
import glob
import json
import logging
import os
import subprocess
import sys

from flask import Blueprint, request, jsonify

logger = logging.getLogger('dqdl-agent.story_event')
bp = Blueprint('story_event', __name__)

# 本文件在 dqdl-agent/routes/，兄弟目录是 dqdl_writer
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WRITER_DIR = os.path.join(BASE_DIR, '..', 'dqdl_writer')

# subprocess 超时（秒）：v5 生成 + 适配，多段 LLM 可能较长
GENERATE_TIMEOUT = 600


def _run(cmd, cwd):
    """跑子进程，返回 (ok, stdout_tail)"""
    logger.info(f'运行: {cmd}')
    try:
        proc = subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True,
            encoding='utf-8', errors='replace',
            timeout=GENERATE_TIMEOUT,
        )
        tail = (proc.stdout or '')[-1500:] + ('\n' + (proc.stderr or '')[-800:])
        if proc.returncode != 0:
            return False, tail
        return True, tail
    except subprocess.TimeoutExpired:
        return False, f'生成超时（>{GENERATE_TIMEOUT}s）'
    except Exception as e:
        return False, f'子进程启动失败: {e}'


def _latest_story_json():
    """output/ 目录下最新的 story_*.json（main.py 生成后解析）"""
    files = glob.glob(os.path.join(WRITER_DIR, 'output', 'story_*.json'))
    if not files:
        return None
    return max(files, key=os.path.getmtime)


@bp.route('/generate/story-event', methods=['POST'])
def generate_story_event():
    """
    生成一个网状冒险故事事件并入库 story_event。
    Body: { prompt?: string }  prompt 为事件主题指令（可选，缺省用默认主题）
    """
    data = request.get_json(force=True, silent=True) or {}
    prompt = (data.get('prompt') or '').strip()

    # 1. v5 生成故事（dqdl_writer/main.py）
    cmd = [sys.executable, 'main.py']
    if prompt:
        cmd += ['--prompt', prompt]
    ok, out = _run(cmd, WRITER_DIR)
    if not ok:
        return jsonify({'ok': False, 'msg': f'故事生成失败: {out[-400:]}'}), 500

    # 2. 找到刚生成的 story JSON
    story_json = _latest_story_json()
    if not story_json:
        return jsonify({'ok': False, 'msg': f'未找到生成的 story JSON\n{out[-400:]}'}), 500

    # 3. 适配并入库（dqdl-agent/adapt_story.py）
    adapt_py = os.path.join(BASE_DIR, 'adapt_story.py')
    ok2, out2 = _run([sys.executable, adapt_py, '--story', story_json], BASE_DIR)
    if not ok2:
        return jsonify({'ok': False, 'msg': f'适配入库失败: {out2[-400:]}'}), 500

    # 4. 查入库结果（按 story_id）
    story_id = os.path.splitext(os.path.basename(story_json))[0]
    try:
        from db import _db_config
        import pymysql
        conn = pymysql.connect(**_db_config(), connect_timeout=5)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    'SELECT id, title FROM story_event WHERE story_id=%s',
                    (story_id,),
                )
                row = cur.fetchone()
        finally:
            conn.close()
    except Exception as e:
        logger.warning(f'查询入库结果失败: {e}')
        row = None

    if row:
        return jsonify({'ok': True, 'story_id': story_id, 'title': row[1], 'event_id': row[0]})
    return jsonify({'ok': False, 'msg': '生成完成但未查到入库记录'}), 500
