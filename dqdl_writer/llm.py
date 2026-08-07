"""
LLM 客户端：通过 langchain-openai 调用 DeepSeek API。
"""
from langchain_openai import ChatOpenAI
from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL


def get_llm(temperature: float = 0.9, max_tokens: int = 4000) -> ChatOpenAI:
    """获取 DeepSeek LLM 实例"""
    if not DEEPSEEK_API_KEY:
        raise ValueError(
            "请设置 DEEPSEEK_API_KEY 环境变量。\n"
            "  Windows: set DEEPSEEK_API_KEY=sk-xxx\n"
            "  Linux:  export DEEPSEEK_API_KEY=sk-xxx"
        )
    return ChatOpenAI(
        api_key=DEEPSEEK_API_KEY,
        base_url=DEEPSEEK_BASE_URL,
        model=DEEPSEEK_MODEL,
        temperature=temperature,
        max_tokens=max_tokens,
    )
