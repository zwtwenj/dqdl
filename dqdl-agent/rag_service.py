"""
RAG 向量数据库：索引 + 检索
使用 sentence-transformers 本地模型，数据存储在项目目录
"""
import os
import json
import numpy as np
from docx import Document
from sentence_transformers import SentenceTransformer

# ── 路径配置 ──
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
RAG_DIR = os.path.join(PROJECT_DIR, 'rag')
DATA_DIR = os.path.join(BASE_DIR, 'vector_data')

# 向量数据文件
CHUNKS_FILE = os.path.join(DATA_DIR, 'chunks.json')
VECTORS_FILE = os.path.join(DATA_DIR, 'vectors.npy')
META_FILE = os.path.join(DATA_DIR, 'meta.json')

# 使用多语言模型，中文效果好
MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'

# ── 全局变量 ──
_model = None
_chunks = None
_vectors = None


def get_model():
    """懒加载 embedding 模型"""
    global _model
    if _model is None:
        print(f'[RAG] 加载模型: {MODEL_NAME} ...')
        _model = SentenceTransformer(MODEL_NAME)
        print(f'[RAG] 模型就绪')
    return _model


def ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


# ============================================================
#  文档切分
# ============================================================

def read_docx(filepath):
    """读取 docx，返回段落列表"""
    doc = Document(filepath)
    return [p.text.strip() for p in doc.paragraphs if p.text.strip()]


def split_by_entry(paragraphs, filename):
    """
    按条目切分文档。
    图鉴类（魔兽/草药/丹药）：以编号开头的行作为新条目起点
    其他文档：按章节（## 或 一、二、三）切分
    """
    chunks = []
    filename_lower = filename.lower()

    # 图鉴类文档：按【ID】条目切分（优先），fallback到【名称】
    is_bestiary = any(kw in filename_lower for kw in ['图鉴', '魔核'])
    if is_bestiary:
        # 先检查是否有【ID】标记
        has_id_marker = any(line.startswith('【ID】') for line in paragraphs)
        split_marker = '【ID】' if has_id_marker else '【名称】'
        current_lines = []
        for line in paragraphs:
            is_new_entry = line.startswith(split_marker)

            if is_new_entry and current_lines:
                text = '\n'.join(current_lines)
                if len(text) >= 10:
                    chunks.append({
                        'text': text,
                        'source': filename,
                        'type': 'entry',
                    })
                current_lines = [line]
            else:
                current_lines.append(line)

        if current_lines:
            text = '\n'.join(current_lines)
            if len(text) >= 10:
                chunks.append({
                    'text': text,
                    'source': filename,
                    'type': 'entry',
                })
        return chunks

    # 非图鉴文档：按章节/段落切分
    current_lines = []
    for line in paragraphs:
        # 检测章节标题
        is_section = False
        if line.startswith('#') or line.startswith('##'):
            is_section = True
        elif line and len(line) < 30:
            # 短行可能是标题
            import re
            if re.match(r'^[一二三四五六七八九十]+[、．.]', line):
                is_section = True
            elif re.match(r'^第[一二三四五六七八九十]+[章节]', line):
                is_section = True

        if is_section and current_lines:
            text = '\n'.join(current_lines)
            if len(text) >= 20:
                chunks.append({
                    'text': text,
                    'source': filename,
                    'type': 'section',
                })
            current_lines = [line]
        else:
            current_lines.append(line)

    # 处理最后一段
    if current_lines:
        text = '\n'.join(current_lines)
        if len(text) >= 20:
            # 如果太长（超过500字），按段落再切
            if len(text) > 500:
                para_buffer = []
                for l in current_lines:
                    para_buffer.append(l)
                    buffer_text = '\n'.join(para_buffer)
                    if len(buffer_text) > 300:
                        chunks.append({
                            'text': buffer_text,
                            'source': filename,
                            'type': 'paragraph',
                        })
                        para_buffer = []
                if para_buffer:
                    chunks.append({
                        'text': '\n'.join(para_buffer),
                        'source': filename,
                        'type': 'paragraph',
                    })
            else:
                chunks.append({
                    'text': text,
                    'source': filename,
                    'type': 'section',
                })

    return chunks


# ============================================================
#  索引构建
# ============================================================

def build_index():
    """扫描 rag/ 目录，切分文档，计算向量，保存到本地"""
    ensure_data_dir()
    model = get_model()

    all_chunks = []
    docx_files = [f for f in os.listdir(RAG_DIR) if f.endswith('.docx') and not f.startswith('~$')]
    print(f'[RAG] 发现 {len(docx_files)} 个文档')

    for filename in docx_files:
        filepath = os.path.join(RAG_DIR, filename)
        print(f'  处理: {filename} ...', end=' ')
        paragraphs = read_docx(filepath)
        chunks = split_by_entry(paragraphs, filename)
        print(f'{len(chunks)} 个chunk')
        all_chunks.extend(chunks)

    print(f'[RAG] 共 {len(all_chunks)} 个chunk，计算向量...')

    # 批量计算向量
    texts = [c['text'] for c in all_chunks]
    vectors = model.encode(texts, show_progress_bar=True, batch_size=64)
    vectors = np.array(vectors, dtype=np.float32)

    # 归一化（用于余弦相似度）
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1
    vectors = vectors / norms

    # 保存
    with open(CHUNKS_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_chunks, f, ensure_ascii=False, indent=2)
    np.save(VECTORS_FILE, vectors)

    meta = {
        'model': MODEL_NAME,
        'total_chunks': len(all_chunks),
        'vector_dim': vectors.shape[1],
        'sources': list(set(c['source'] for c in all_chunks)),
    }
    with open(META_FILE, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f'[RAG] 索引完成: {len(all_chunks)} chunks, dim={vectors.shape[1]}')
    print(f'[RAG] 数据保存在: {DATA_DIR}')


# ============================================================
#  检索
# ============================================================

def load_index():
    """加载已有的索引"""
    global _chunks, _vectors
    if _chunks is not None:
        return

    if not os.path.exists(CHUNKS_FILE) or not os.path.exists(VECTORS_FILE):
        raise FileNotFoundError('索引文件不存在，请先运行 build_index()')

    with open(CHUNKS_FILE, 'r', encoding='utf-8') as f:
        _chunks = json.load(f)
    _vectors = np.load(VECTORS_FILE)
    print(f'[RAG] 已加载索引: {len(_chunks)} chunks')


def search(query, top_k=5):
    """
    语义检索，返回最相关的 top_k 个chunk
    返回: list of { 'text', 'source', 'type', 'score' }
    """
    load_index()
    model = get_model()

    # 计算 query 向量
    q_vec = model.encode([query])
    q_vec = np.array(q_vec, dtype=np.float32)
    norms = np.linalg.norm(q_vec, axis=1, keepdims=True)
    norms[norms == 0] = 1
    q_vec = q_vec / norms

    # 余弦相似度（已归一化，直接点积）
    scores = np.dot(_vectors, q_vec.T).flatten()
    top_indices = np.argsort(scores)[::-1][:top_k]

    results = []
    for idx in top_indices:
        results.append({
            'text': _chunks[idx]['text'],
            'source': _chunks[idx]['source'],
            'type': _chunks[idx]['type'],
            'score': float(scores[idx]),
        })

    return results


def get_context(query, top_k=5, max_chars=3000):
    """
    检索并拼接成 Prompt 可用的上下文字符串
    自动截断到 max_chars 以内
    """
    results = search(query, top_k=top_k)
    context_parts = []
    total_len = 0

    for i, r in enumerate(results):
        header = f"【{r['source']}】(相关度:{r['score']:.2f})"
        entry = f"{header}\n{r['text']}\n"
        if total_len + len(entry) > max_chars:
            break
        context_parts.append(entry)
        total_len += len(entry)

    return '\n'.join(context_parts)


# ============================================================
#  CLI 入口
# ============================================================

if __name__ == '__main__':
    import sys

    if len(sys.argv) < 2:
        print('用法:')
        print('  python rag_service.py index       # 构建索引')
        print('  python rag_service.py search <查询>  # 测试检索')
        print('  python rag_service.py info         # 查看索引信息')
        sys.exit(0)

    cmd = sys.argv[1]

    if cmd == 'index':
        build_index()

    elif cmd == 'search':
        query = ' '.join(sys.argv[2:]) if len(sys.argv) > 2 else '火属性魔兽'
        print(f'查询: {query}\n')
        results = search(query, top_k=5)
        for i, r in enumerate(results):
            print(f'--- [{i+1}] {r["source"]} (score={r["score"]:.3f}) ---')
            print(r['text'][:200])
            print()

    elif cmd == 'info':
        if os.path.exists(META_FILE):
            with open(META_FILE, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            print(json.dumps(meta, ensure_ascii=False, indent=2))
            print(f'\n向量文件大小: {os.path.getsize(VECTORS_FILE):,} bytes')
            print(f'数据目录: {DATA_DIR}')
        else:
            print('索引未构建，请先运行: python rag_service.py index')

    else:
        print(f'未知命令: {cmd}')
