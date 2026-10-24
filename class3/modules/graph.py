# ---------------------------------------------------------------------------
# LangGraph 拓扑：节点已注册，TODO-4 只连边
# 条件函数在 nodes.py（route_question / decide_to_generate / grade_generation_...）
# 编好后由 rag_app.get_graph → ask() 执行
# ---------------------------------------------------------------------------
from langgraph.graph import END, StateGraph
from typing import List

from typing_extensions import TypedDict


# 图状态：问句、生成、检索文档、多轮历史
class GraphState(TypedDict):
    """
    Represents the state of our graph.
    """

    question: str
    generation: str
    documents: List[str]
    message_history: List[str]


class Graph:
    @staticmethod
    def create(nodes):
        """
        用 LangGraph 编排自适应 RAG 拓扑：
        - 条件入口：route_question → casual_convo | vectorstore
        - casual 路径：generate_conv_reply → END
        - vectorstore 路径：transform_query → retrieve → grade_documents
        - grade_documents 条件：transform_query | generate
        - transform_query → retrieve（环）
        - generate 条件：not supported → generate；useful → END；not useful → transform_query
        """
        workflow = StateGraph(GraphState)

        workflow.add_node("retrieve", nodes.retrieve)
        workflow.add_node("grade_documents", nodes.grade_documents)
        workflow.add_node("generate", nodes.generate)
        workflow.add_node("generate_conv_reply", nodes.generate)
        workflow.add_node("transform_query", nodes.transform_query)

        # 条件入口：先做问题路由——闲聊直接回复，知识问题走向量库链路
        workflow.set_conditional_entry_point(
            nodes.route_question,
            {
                "casual_convo": "generate_conv_reply",
                "vectorstore": "transform_query",
            },
        )

        # 向量库链路：改写 → 检索 → 文档评分
        workflow.add_edge("transform_query", "retrieve")
        workflow.add_edge("retrieve", "grade_documents")
        workflow.add_conditional_edges(
            "grade_documents",
            nodes.decide_to_generate,
            {
                "transform_query": "transform_query",
                "generate": "generate",
            },
        )

        # 生成后校验：未忠实于资料 → 重试生成；未解决问题 → 回到改写重检索；通过 → 结束
        workflow.add_conditional_edges(
            "generate",
            nodes.grade_generation_v_documents_and_question,
            {
                "not supported": "generate",
                "useful": END,
                "not useful": "transform_query",
            },
        )

        # 闲聊路径：直接生成回复后结束
        workflow.add_edge("generate_conv_reply", END)

        return workflow.compile()
