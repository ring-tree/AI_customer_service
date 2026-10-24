# ---------------------------------------------------------------------------
# 环境变量读取与 Key 校验（已实现）
# 供 loader Embedding、models 对话 LLM、rag_app.get_graph 启动前检查使用
# ---------------------------------------------------------------------------
import os


def read_env_value(*names: str) -> str:
    """Read the first non-empty env var and strip inline comments."""
    for name in names:
        raw = os.getenv(name, "")
        if not raw:
            continue
        value = raw.strip()
        if "#" in value:
            value = value.split("#", 1)[0].strip()
        if value:
            return value
    return ""


def assert_ascii_api_key(name: str, value: str) -> None:
    if value and not value.isascii():
        raise ValueError(
            f"{name} 仍是中文占位说明，不能写在密钥字段里。"
            f"请到对应平台申请真实 API Key（sk- 开头），只填在等号后面，说明文字写在 # 注释行。"
        )


def validate_llm_api_key(value: str) -> None:
    assert_ascii_api_key("HUNYUAN_API_KEY / OPENAI_API_KEY", value)
    bad = (
        (not value)
        or ("replace" in value.lower())
        or ("your_" in value.lower())
        or value.startswith("sk-123")
        or value.startswith("sk-test")
    )
    if bad:
        raise ValueError(
            "LLM API Key 无效或未配置，请在知识服务 .env 中填写 TokenHub 混元 API Key"
            "（HUNYUAN_API_KEY 或 OPENAI_API_KEY，可与模型网关共用）。"
        )


def validate_embedding_api_key(value: str) -> None:
    assert_ascii_api_key("EMBEDDING_API_KEY / HUNYUAN_API_KEY", value)
    if not value:
        raise ValueError(
            "缺少 Embedding API Key，请在知识服务 .env 中填写 TokenHub Key"
            "（推荐 HUNYUAN_API_KEY / EMBEDDING_API_KEY，可与对话共用）。"
        )
