# ---------------------------------------------------------------------------
# RAG 应用入口：校验 Key、组装 retriever+各链、编译图、跑一轮问答
# get_graph 已实现；TODO-5 ask() 供 server POST /chat 与 main.py 命令行使用
# ---------------------------------------------------------------------------
from dotenv import load_dotenv
from modules.loader import Loader
from modules.models import (
    Router,
    DocGrader,
    Generator,
    HallucinationGrader,
    AnswerGrader,
    QuestionRewriter,
    ensure_llm_key_valid,
)
from modules.nodes import Nodes
from modules.graph import Graph
import sys

from modules.env_utils import read_env_value, validate_embedding_api_key

load_dotenv(override=True)

_INITIAL_HISTORY = ["the messages till now are given below: \n\n"]

_graph = None
_nodes = None


# 启动前检查对话 Key 与 Embedding Key（占位/中文说明会直接退出）
def validate_env() -> None:
    llm_key = read_env_value(
        "HUNYUAN_API_KEY",
        "TOKENHUB_API_KEY",
        "OPENAI_API_KEY",
        "DEEPSEEK_API_KEY",
    )
    embed_key = read_env_value(
        "EMBEDDING_API_KEY",
        "HUNYUAN_API_KEY",
        "TOKENHUB_API_KEY",
        "OPENAI_API_KEY",
        "DASHSCOPE_API_KEY",
    )

    try:
        ensure_llm_key_valid()
        validate_embedding_api_key(embed_key)
    except ValueError as exc:
        print(f"ERROR: {exc}\n")
        print(
            "请编辑实训四项目根目录 .env：\n"
            "  HUNYUAN_API_KEY=sk-问答用TokenHub密钥\n"
            "  OPENAI_API_BASE=https://tokenhub-intl.tencentmaas.com/v1\n"
            "  LLM_MODEL=hy3\n"
            "  EMBEDDING_API_KEY=sk-向量化用TokenHub密钥\n"
            "  EMBEDDING_API_BASE=https://tokenhub.tencentmaas.com/v1\n"
            "  EMBEDDING_MODEL=kinfra-text-embedding-0.6b\n"
            "注意：等号后面只写密钥本身，不要写中文说明。"
        )
        sys.exit(1)


# 进程内只初始化一次：Loader → 各 Model → Nodes → Graph.create（TODO-4）
def get_graph():
    """Lazy-init LangGraph app once per process.（已实现，可直接使用）"""
    global _graph, _nodes
    if _graph is not None:
        return _graph, _nodes

    validate_env()
    print("Initializing retriever / vectorstore...")
    loader = Loader()

    class NodeHelpers:
        retriever = loader.get_retriever()
        question_router = Router.get_model()
        retrieval_grader = DocGrader.get_model()
        rag_chain = Generator.get_model()
        hallucination_grader = HallucinationGrader.get_model()
        answer_grader = AnswerGrader.get_model()
        question_rewriter = QuestionRewriter.get_model()

    _nodes = Nodes(NodeHelpers())
    _graph = Graph.create(_nodes)
    print("RAG graph ready.")
    return _graph, _nodes


def new_message_history():
    return list(_INITIAL_HISTORY)


# TODO-5：执行一轮 graph.stream，组装 answer / sources / steps / 更新历史
def ask(question: str, message_history: list | None = None) -> dict:
    """
    跑一轮 RAG 问答（供 server POST /chat 与 main.py 终端复用）
    要点：
    1. get_graph()；准备 inputs={question, message_history, documents:[]}
    2. for output in graph.stream(inputs): 记录 steps（node 名）
    3. 从最后状态取 generation；追加到 message_history
    4. 从 documents 提取 sources（source/metadata/preview）
    5. return {answer, message_history, sources, steps}
    """
    graph, _nodes = get_graph()

    if message_history is None:
        message_history = new_message_history()

    inputs = {
        "question": question,
        "message_history": message_history,
        "documents": [],
    }

    steps: list[dict] = []
    documents: list = []
    generation = ""

    # 逐节点流转：记录节点路径（steps），捕获最新文档与生成结果
    for output in graph.stream(inputs):
        for node_name, node_output in output.items():
            steps.append({"node": node_name})
            if not isinstance(node_output, dict):
                continue
            if "documents" in node_output:
                documents = node_output["documents"] or []
            if node_output.get("generation"):
                generation = node_output["generation"]
            if node_output.get("message_history"):
                message_history = node_output["message_history"]

    # 把本轮回答追加进历史（沿用 nodes.route_question 的消息编号格式）
    message_history.append(
        "msg number [" + str(len(message_history)) + "] assistant : " + (generation or "")
    )

    # 组装引用来源（source / metadata / preview，与实训三前端契约保持一致）
    sources = []
    for doc in documents:
        metadata = getattr(doc, "metadata", None) or {}
        preview = " ".join((getattr(doc, "page_content", "") or "").split())
        sources.append(
            {
                "source": metadata.get("source"),
                "metadata": metadata,
                "preview": preview[:200],
            }
        )

    return {
        "answer": generation or "",
        "message_history": message_history,
        "sources": sources,
        "steps": steps,
    }
