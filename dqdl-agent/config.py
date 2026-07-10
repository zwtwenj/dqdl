"""
全局配置：.env 加载 + 多平台 LLM 注册表 + 场景路由表 + RAG 懒加载。

设计理念：不同业务场景的玩家关注度/调用频率不同，按场景独立配置模型。
在 .env 中用 {CALL_TYPE}_MODEL=平台:模型名 指定，如：
  TRAINING_MODEL=siliconflow:Qwen/Qwen3-8B   # 历练叙事（高频低关注）→ 便宜模型
  DIALOG_MODEL=deepseek:deepseek-chat        # NPC对话（玩家直接交互）→ 高质量
未配置的场景默认走 deepseek:deepseek-chat。
"""
import os
import logging
from openai import OpenAI
from dotenv import load_dotenv

logger = logging.getLogger('dqdl-agent')

# ── 加载配置（dqdl-agent/.env）──
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# 强制 HuggingFace 离线模式，避免模型加载时连接超时
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'

AGENT_PORT = int(os.getenv('AGENT_PORT', '5000'))
AGENT_HOST = os.getenv('AGENT_HOST', '0.0.0.0')

# ============================================================
#  各平台 key 与 client
# ============================================================
LLM_PLATFORMS = {
    'deepseek': {
        'key': os.getenv('apikey') or os.getenv('DEEPSEEK_API_KEY', ''),
        'base_url': os.getenv('base_url') or os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
    },
    'siliconflow': {
        'key': os.getenv('siliconFlow_key') or os.getenv('SILICONFLOW_KEY', ''),
        'base_url': os.getenv('siliconflow_base_url') or os.getenv('SILICONFLOW_BASE_URL', 'https://api.siliconflow.cn/v1'),
    },
    'glm': {
        'key': os.getenv('glm_key') or os.getenv('GLM_API_KEY') or os.getenv('GLM_KEY', ''),
        'base_url': os.getenv('glm_base_url') or os.getenv('GLM_BASE_URL', 'https://open.bigmodel.cn/api/paas/v4'),
    },
}

# 按 key 是否配置，懒创建 client（避免无 key 的平台初始化报错）
_platform_clients = {}


def _get_platform_client(platform):
    """获取某平台的 OpenAI client（懒创建，缓存）。平台未配 key 返回 None。"""
    if platform not in _platform_clients:
        cfg = LLM_PLATFORMS.get(platform)
        if not cfg or not cfg['key']:
            _platform_clients[platform] = None
        else:
            _platform_clients[platform] = OpenAI(api_key=cfg['key'], base_url=cfg['base_url'])
    return _platform_clients[platform]


# ============================================================
#  场景 → 模型路由表（从 .env 读取）
# ============================================================
_DEFAULT_MODEL = 'deepseek:deepseek-chat'


def _parse_route(env_key):
    """解析 .env 中的路由配置 'platform:model_name' → (platform, model)"""
    val = os.getenv(env_key, '').strip()
    if not val:
        return None
    if ':' not in val:
        return None
    platform, model = val.split(':', 1)
    return platform.strip().lower(), model.strip()


# 各场景的路由（call_type → (platform, model)）
_SCENARIOS = ['training', 'dialog', 'dungeon', 'event', 'map', 'encounter', 'breakthrough']
_ROUTES = {}
for _s in _SCENARIOS:
    _route = _parse_route(_s.upper() + '_MODEL')
    if _route:
        _ROUTES[_s] = _route


def _pick_client(call_type='unknown'):
    """按业务场景选择 (client, model_name, need_disable_thinking)。
    路由优先级：_ROUTES[call_type] → 默认 deepseek:deepseek-chat。
    need_disable_thinking: 推理模型(GLM/R1/Qwen3)默认带思考会吃掉输出token，需关闭。
    若路由指向的平台未配 key，自动降级到 deepseek。"""
    platform, model = _ROUTES.get(call_type, _DEFAULT_MODEL.split(':'))
    client = _get_platform_client(platform)
    if client is None:
        logger.warning(f'场景 {call_type} 路由到 {platform} 但未配置 key，降级 deepseek')
        platform, model = 'deepseek', 'deepseek-chat'
        client = _get_platform_client('deepseek')
    # 推理模型需要关闭思考（GLM/Qwen3/R1 系列默认带推理）
    need_disable = platform in ('glm', 'siliconflow') or 'r1' in model.lower() or 'qwen3' in model.lower()
    return client, model, need_disable


# ============================================================
#  RAG 懒加载
# ============================================================
_rag_loaded = False


def ensure_rag():
    """确保 RAG 向量库已加载（首次调用时加载，之后跳过）。"""
    global _rag_loaded
    if not _rag_loaded:
        from rag_service import load_index
        load_index()
        _rag_loaded = True
