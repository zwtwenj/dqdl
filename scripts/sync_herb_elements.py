"""
草药图鉴 → item 表元素能量同步脚本

从 rag/草药图鉴.docx 逐条解析【ID】+【名称】+【元素】，按 item_id 索引更新 item.element_energy。
支持负元素量（如赤血藤 雷-10），用于炼丹中和机制。

用法:
  python scripts/sync_herb_elements.py           # 预览差异，不写库
  python scripts/sync_herb_elements.py --apply   # 实际写库

幂等：重复运行结果一致。仅更新 type='草药' 且 item_id 以 yb- 开头的记录。
"""
import os
import re
import json
import sys
import argparse
import pymysql
from docx import Document
from dotenv import load_dotenv

# 元素解析正则：匹配 "木10"、"火-5"、"雷-10" 等（支持负数）
ELEM_RE = re.compile(r'(金|木|水|火|土|雷|风)(-?\d+)')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCX = os.path.join(ROOT, 'rag', '草药图鉴.docx')
# server/.env 用 DB_HOST 等命名（首选）；根 .env 用 MYSQL_ADDRESS 等命名（回退）
ENV_SERVER = os.path.join(ROOT, 'dqdl-server', '.env')
ENV_ROOT = os.path.join(ROOT, '.env')


def parse_herbs_from_docx(path):
    """从 docx 解析草药列表，返回 [{item_id, name, elements:{元素:值}}]"""
    d = Document(path)
    herbs = []
    current = {}
    for p in d.paragraphs:
        t = p.text.strip()
        if not t:
            continue
        if t.startswith('【ID】'):
            if current.get('item_id'):
                herbs.append(current)
            current = {'item_id': t.replace('【ID】', '').strip(), 'name': '', 'elements': {}}
        elif t.startswith('【名称】') and current.get('item_id'):
            current['name'] = t.replace('【名称】', '').strip()
        elif t.startswith('【元素】') and current.get('item_id'):
            # 解析 "木10 火5 雷-10" → {"木":10,"火":5,"雷":-10}
            for m in ELEM_RE.finditer(t):
                current['elements'][m.group(1)] = int(m.group(2))
    if current.get('item_id'):
        herbs.append(current)
    return herbs


def main():
    parser = argparse.ArgumentParser(description='同步草药图鉴元素到 item 表')
    parser.add_argument('--apply', action='store_true', help='实际写库（默认仅预览）')
    args = parser.parse_args()

    # 1) 解析 docx
    if not os.path.exists(DOCX):
        print(f'❌ 找不到 {DOCX}')
        sys.exit(1)
    herbs = parse_herbs_from_docx(DOCX)
    print(f'📖 从图鉴解析出 {len(herbs)} 条草药')

    # 2) 连库（优先读 server/.env 的 DB_* 变量，回退根 .env 的 MYSQL_* 变量）
    load_dotenv(ENV_SERVER, override=True)
    load_dotenv(ENV_ROOT, override=True)
    db_host = os.getenv('DB_HOST') or os.getenv('MYSQL_ADDRESS')
    if not db_host:
        print(f'❌ 未能读取 DB 配置（已尝试 {ENV_SERVER} 和 {ENV_ROOT}）')
        sys.exit(1)
    conn = pymysql.connect(
        host=db_host,
        port=int(os.getenv('DB_PORT', '3306')),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', ''),
        database=os.getenv('DB_DATABASE', 'dqdl'),
        charset='utf8mb4',
    )
    cur = conn.cursor()

    # 3) 读取现有 item 表草药数据
    cur.execute("SELECT item_id, name, element_energy FROM item WHERE type='草药' AND item_id LIKE 'yb-%' ORDER BY item_id")
    rows = {r[0]: {'name': r[1], 'energy': r[2]} for r in cur.fetchall()}

    # 4) 计算差异
    diffs = []
    for h in herbs:
        iid = h['item_id']
        if iid not in rows:
            print(f'  ⚠️  图鉴有 {iid}({h["name"]}) 但 item 表无此记录，跳过')
            continue
        old_energy = json.loads(rows[iid]['energy']) if rows[iid]['energy'] else {}
        new_energy = h['elements']
        if old_energy != new_energy:
            diffs.append({
                'item_id': iid,
                'name': h['name'],
                'old': old_energy,
                'new': new_energy,
            })

    if not diffs:
        print('✅ 图鉴与 item 表完全一致，无需更新')
        conn.close()
        return

    # 5) 打印差异
    print(f'\n🔍 发现 {len(diffs)} 处差异：')
    for d in diffs:
        print(f"  {d['item_id']} {d['name']}: {d['old']} → {d['new']}")

    if not args.apply:
        print('\n📌 预览模式，未写库。加 --apply 实际执行更新。')
        conn.close()
        return

    # 6) 写库
    print('\n⏳ 正在更新...')
    updated = 0
    for d in diffs:
        cur.execute(
            "UPDATE item SET element_energy=%s WHERE item_id=%s AND type='草药'",
            (json.dumps(d['new'], ensure_ascii=False), d['item_id']),
        )
        updated += cur.rowcount
    conn.commit()
    print(f'✅ 已更新 {updated} 条记录')
    conn.close()


if __name__ == '__main__':
    main()
