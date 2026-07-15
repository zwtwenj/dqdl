"""
基础路由：健康检查 + 地图生成 + RAG 检索。
"""
import random
from flask import Blueprint, request, jsonify
from config import ensure_rag
from services.map_service import generate_locations, ensure_city_districts, generate_map_node, generate_map_nodes, fetch_real_mobs

bp = Blueprint('map', __name__)


@bp.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'dqdl-agent'})


@bp.route('/generate/map', methods=['POST'])
def generate_map():
    """
    生成地图子节点
    Body: {
        parent: { id, name, loc_type, description, depth, ... },
        rule: { depth, loc_type, gen_prompt, naming_style, danger_range, ... },
        count: number,
        existingNames: string[],
        seed: string|null
    }
    """
    data = request.get_json(force=True)
    parent_info = data.get('parent', {})
    rule = data.get('rule', {})
    count = data.get('count', 3)
    existing_names = data.get('existingNames', [])
    seed = data.get('seed')

    # 生成
    results = generate_locations(parent_info, rule, count, existing_names)

    # 后处理：城市内部的子节点必须有坊市、佣兵公会，50%概率有拍卖行
    if parent_info.get('loc_type') == 'city' and rule.get('depth') == 4:
        results = ensure_city_districts(results, parent_info)

    # 为每个结果分配 seed
    for i, r in enumerate(results):
        if seed:
            r['seed'] = f'{seed}-{i}'
        else:
            r['seed'] = str(random.randint(0, 10000))

    return jsonify(results)


@bp.route('/generate/map-node', methods=['POST'])
def generate_single_map_node():
    """
    为 location_net（网状地图）生成单个节点。
    Body: {
        loc_type: 'wild'|'city'|'sect'|'secret',   # server 已定的类型
        parent_context?: [{name, loc_type, direction}],  # 周边已知地点（可选）
        existingNames?: string[]                   # 已有地名（避免重名）
    }
    返回单个节点对象。
    """
    data = request.get_json(force=True)
    loc_type = data.get('loc_type', 'wild')
    parent_context = data.get('parent_context') or data.get('parentContext')
    existing_names = data.get('existingNames', [])
    node = generate_map_node(loc_type, parent_context, existing_names)
    node['seed'] = str(random.randint(0, 10000))
    return jsonify(node)


@bp.route('/generate/map-nodes', methods=['POST'])
def generate_batch_map_nodes():
    """
    批量生成多个地图节点（一次 LLM 调用）。
    Body: {
        nodes: [{loc_type, gx, gy}],                # server 已定的每个空位类型
        parent_context?: [{name, loc_type, direction}],
        existingNames?: string[]
    }
    返回节点数组，每个含 gx,gy（与请求对齐）。
    """
    data = request.get_json(force=True)
    nodes_request = data.get('nodes') or []
    parent_context = data.get('parent_context') or data.get('parentContext')
    existing_names = data.get('existingNames', [])
    results = generate_map_nodes(nodes_request, parent_context, existing_names)
    for i, r in enumerate(results):
        r['seed'] = f'batch-{random.randint(0, 10000)}-{i}'
    return jsonify(results)


@bp.route('/generate/wild-mobs', methods=['POST'])
def generate_wild_mobs():
    """
    为已有野外节点补填 common_mobs（不重新生成节点本身）。
    复用 RAG 按 danger_level 检索真实魔兽：1→一阶, 2→二阶, 3→三阶。
    Body: {
        name: string,                 # 节点名（喂 RAG 提高贴合度）
        danger_level: number,         # 1/2/3
        description?: string,         # 节点描述（可选，喂 RAG）
        tags?: string[],              # 节点标签（可选，喂 RAG）
        max_count?: number            # 期望数量，默认 4
    }
    返回：{ mobs: [{mob_id, name, rank?}] | null }
    """
    data = request.get_json(force=True)
    loc_info = {
        'danger_level': int(data.get('danger_level', 0)),
        'description': data.get('description', ''),
        'tags': data.get('tags') or [],
    }
    parent_info = {'name': data.get('name', '')}
    max_count = int(data.get('max_count', 4))
    mobs = fetch_real_mobs(parent_info, loc_info, max_count=max_count)
    return jsonify({'mobs': mobs})


@bp.route('/rag/search', methods=['POST'])
def rag_search():
    """
    RAG 语义检索
    Body: { query: string, top_k?: number, max_chars?: number }
    """
    ensure_rag()
    from rag_service import search, get_context

    data = request.get_json(force=True)
    query = data.get('query', '')
    top_k = data.get('top_k', 5)
    max_chars = data.get('max_chars', 3000)

    results = search(query, top_k=top_k)
    context = get_context(query, top_k=top_k, max_chars=max_chars)

    return jsonify({
        'results': results,
        'context': context,
    })
