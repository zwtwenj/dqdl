"""
配置：LLM 连接 + 文件路径 + 提取参数。
DeepSeek API 通过 langchain-openai 的 OpenAI 兼容接口调用。
"""
import os
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

# === LLM 配置 ===
# DeepSeek API（OpenAI 兼容接口）
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

# === 文件路径 ===
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BOOKS_DIR = BASE_DIR  # txt 文件放在同目录

# 书籍配置
BOOKS = {
    "斗破苍穹": {
        "file": "斗破苍穹.txt",
        "encoding": "gbk",
        "power_system": "斗气（斗之气/斗者/斗师/大斗师/斗灵/斗王/斗皇/斗宗/斗尊/斗圣/斗帝）",
        "world_name": "斗气大陆",
    },
}

# === 提取参数 ===
# 快速验证：只取前 N 章做提取（全书太慢）
CHAPTERS_FOR_PROTOTYPE = 3  # 备用参数（当前流程不读原文）
CHAPTER_MAX_CHARS = 5000    # 每章截取的最大字符数（避免超长 prompt）
