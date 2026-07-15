"""
dqdl-agent: AI 生成服务（Flask）

入口文件：创建 Flask app + 注册所有 Blueprint 路由 + 启动。
业务逻辑分散在 config/llm_client/utils/services/routes 各模块。

路由清单：
  GET  /health              健康检查
  POST /generate/map        地图子节点生成（routes/map.py）
  POST /rag/search          RAG 语义检索（routes/map.py）
  POST /generate/dialog     NPC 对话生成（routes/dialog.py）
  POST /generate/training   历练叙事生成（routes/training.py）
  POST /generate/encounter  奇遇发现叙事（routes/encounter.py）
  POST /generate/breakthrough 突破叙事（routes/breakthrough.py）
  POST /generate/dungeon    箱庭副本五幕蓝图（routes/dungeon.py）
  POST /generate/event      场景事件规格（routes/event.py）
"""
from flask import Flask
from config import AGENT_HOST, AGENT_PORT
from routes.map import bp as map_bp
from routes.dialog import bp as dialog_bp
from routes.training import bp as training_bp
from routes.encounter import bp as encounter_bp
from routes.breakthrough import bp as breakthrough_bp
from routes.dungeon import bp as dungeon_bp
from routes.event import bp as event_bp
from routes.npc import bp as npc_bp

app = Flask(__name__)

# 注册所有路由 Blueprint
app.register_blueprint(map_bp)
app.register_blueprint(dialog_bp)
app.register_blueprint(training_bp)
app.register_blueprint(encounter_bp)
app.register_blueprint(breakthrough_bp)
app.register_blueprint(dungeon_bp)
app.register_blueprint(event_bp)
app.register_blueprint(npc_bp)

# ── 兼容旧测试的 re-export ──
# test_event.py / test_fallback.py 用 `import app as agent` 访问以下符号，
# 它们实际已搬到 services/ 和 utils/，这里 re-export 保持向后兼容。
from utils import _parse_json_object, parse_json_response  # noqa: E402
from services.dungeon_service import (  # noqa: E402
    DUNGEON_SCENES, _normalize_dungeon, _fallback_dungeon,
)
from services.event_service import (  # noqa: E402
    EVENT_EFFECT_KEYS, _normalize_event, _normalize_choice,
    _normalize_effect, _clamp_effect_value, _fallback_event,
)
from services.map_service import (  # noqa: E402
    fallback_generate, ensure_city_districts,
)

if __name__ == '__main__':
    print(f'dqdl-agent 启动: http://{AGENT_HOST}:{AGENT_PORT}')
    app.run(host=AGENT_HOST, port=AGENT_PORT, debug=False)
