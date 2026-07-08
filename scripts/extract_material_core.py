#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
从 rag/材料图鉴.docx 与 rag/魔核图鉴.docx 提取干净 JSON 数据，
供后端 import-material-core.ts 幂等导入 material / magic_core / item 表。

输出：
  scripts/material_data_v2.json     517 条材料
  scripts/magic_core_data.json       72 条魔核（8属性×3阶×3品质）

数据源字段（已核实）：
  材料图鉴：{ID, 名称, 来源, 类型, 稀有度, 描述}，无价格。
            来源格式："WB-001 焰尾蜥, WB-255 焰棘蜥"（逗号分隔，mob_id+空格+名称）。
  魔核图鉴：{ID, 名称, 分类, 属性, 品阶, 品质, 外观, 掉落来源, 参考价格, 用途}。
            参考价格为范围如 "50~100 金币"。

运行：python scripts/extract_material_core.py
"""
import json
import re
import sys
from pathlib import Path

import docx

ROOT = Path(__file__).resolve().parent.parent
RAG = ROOT / 'rag'
OUT_DIR = ROOT / 'scripts'


def parse_records(docx_path: Path):
    """按 '---' 分隔解析图鉴，返回 list[dict]。
    每条记录由若干 '【字段】值' 段落组成，遇到 '---' 或下一条 '【ID】' 即结束当前记录。
    """
    doc = docx.Document(str(docx_path))
    records = []
    cur = {}
    for p in doc.paragraphs:
        t = p.text.strip()
        if not t:
            continue
        if t == '---':
            if cur:
                records.append(cur)
                cur = {}
            continue
        m = re.match(r'【(.+?)】(.*)', t)
        if not m:
            # 非字段行（如魔核图鉴开头的说明段落）忽略
            continue
        key = m.group(1).strip()
        val = m.group(2).strip()
        # 遇到新 ID 且当前已有内容，先收尾上一条
        if key == 'ID' and cur:
            records.append(cur)
            cur = {}
        cur[key] = val
    if cur:
        records.append(cur)
    return records


def parse_source_mobs(source: str):
    """解析 'WB-001 焰尾蜥, WB-255 焰棘蜥' → [{mob_id, name}]"""
    mobs = []
    for part in source.split(','):
        part = part.strip()
        if not part:
            continue
        m = re.match(r'^(WB-\d+)\s+(.+)$', part)
        if m:
            mobs.append({'mob_id': m.group(1), 'name': m.group(2).strip()})
    return mobs


TIER_MAP = {'一阶': 1, '二阶': 2, '三阶': 3}


def parse_price(price_str: str):
    """解析 '50~100 金币' → (50, 100)；解析失败返回 (0, 0)"""
    if not price_str:
        return 0, 0
    m = re.search(r'(\d+)\s*[~～]\s*(\d+)', price_str)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r'(\d+)', price_str)
    if m:
        v = int(m.group(1))
        return v, v
    return 0, 0


def extract_material():
    recs = parse_records(RAG / '材料图鉴.docx')
    out = []
    for r in recs:
        item_id = r.get('ID', '').strip()
        if not item_id:
            continue
        out.append({
            'item_id': item_id,
            'name': r.get('名称', '').strip(),
            'rarity': r.get('稀有度', '').strip() or None,
            'source_mobs': parse_source_mobs(r.get('来源', '')),
            'description': r.get('描述', '').strip() or None,
        })
    return out


def extract_magic_core():
    recs = parse_records(RAG / '魔核图鉴.docx')
    out = []
    for r in recs:
        item_id = r.get('ID', '').strip()
        if not item_id:
            continue
        tier_text = r.get('品阶', '').strip()
        tier = TIER_MAP.get(tier_text, 0)
        price_min, price_max = parse_price(r.get('参考价格', ''))
        out.append({
            'item_id': item_id,
            'name': r.get('名称', '').strip(),
            'attribute': r.get('属性', '').strip(),
            'tier': tier,
            'quality': r.get('品质', '').strip(),
            'appearance': r.get('外观', '').strip() or None,
            'drop_source': r.get('掉落来源', '').strip() or None,
            'price_min': price_min,
            'price_max': price_max,
            'usage_desc': r.get('用途', '').strip() or None,
        })
    return out


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    materials = extract_material()
    mat_path = OUT_DIR / 'material_data_v2.json'
    with open(mat_path, 'w', encoding='utf-8') as f:
        json.dump(materials, f, ensure_ascii=False, indent=2)
    print(f'✅ 材料：{len(materials)} 条 → {mat_path}')

    cores = extract_magic_core()
    core_path = OUT_DIR / 'magic_core_data.json'
    with open(core_path, 'w', encoding='utf-8') as f:
        json.dump(cores, f, ensure_ascii=False, indent=2)
    print(f'✅ 魔核：{len(cores)} 条 → {core_path}')

    # 简单完整性校验
    mat_bad = [m for m in materials if not m['item_id'] or not m['name']]
    core_bad = [c for c in cores if not c['item_id'] or not c['name'] or not c['attribute'] or c['tier'] == 0]
    if mat_bad:
        print(f'⚠️ 材料缺字段：{len(mat_bad)} 条', file=sys.stderr)
    if core_bad:
        print(f'⚠️ 魔核缺字段：{len(core_bad)} 条', file=sys.stderr)
        for c in core_bad[:5]:
            print('   ', c, file=sys.stderr)

    # id 唯一性校验
    mat_ids = [m['item_id'] for m in materials]
    core_ids = [c['item_id'] for c in cores]
    if len(mat_ids) != len(set(mat_ids)):
        dup = [x for x in mat_ids if mat_ids.count(x) > 1]
        print(f'⚠️ 材料 item_id 重复：{set(dup)}', file=sys.stderr)
    if len(core_ids) != len(set(core_ids)):
        dup = [x for x in core_ids if core_ids.count(x) > 1]
        print(f'⚠️ 魔核 item_id 重复：{set(dup)}', file=sys.stderr)


if __name__ == '__main__':
    main()
