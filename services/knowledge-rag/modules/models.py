# ---------------------------------------------------------------------------
# LLM 链：路由 / 检索打分 / 生成 / 幻觉打分 / 答案打分 / 问句改写
# 对话走 TokenHub 混元（可与模型网关共用 Key）；仅 [已实现]/3b 需填客服 Prompt
# ---------------------------------------------------------------------------
from typing import Literal

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import os

from modules.env_utils import read_env_value, validate_llm_api_key

load_dotenv(override=True)

DEFAULT_LLM_MODEL = "hy3"
# F5：默认基址改中国站（项目 Key 属中国站，国际站默认会 401/401002）
DEFAULT_LLM_API_BASE = "https://tokenhub.tencentmaas.com/v1"

LLM_MODEL = os.getenv("LLM_MODEL", DEFAULT_LLM_MODEL)
LLM_API_KEY = read_env_value(
    "HUNYUAN_API_KEY",
    "TOKENHUB_API_KEY",
    "OPENAI_API_KEY",
    "DEEPSEEK_API_KEY",
)
LLM_API_BASE = os.getenv(
    "OPENAI_API_BASE",
    os.getenv("HUNYUAN_API_URL", os.getenv("TOKENHUB_API_URL", DEFAULT_LLM_API_BASE)),
).rstrip("/")

# F7：模块级校验改为惰性——由 rag_app.validate_env() 统一给出中文指引后退出，
# 避免缺 Key 时用户直接看到裸 traceback
def ensure_llm_key_valid() -> None:
    validate_llm_api_key(LLM_API_KEY)


# 已实现：混元结构化输出默认 json_schema，避免 function_calling 502
def _structured_output_method() -> str:
    """TokenHub 混元对复杂 prompts 的 function_calling 易 502，默认改用 json_schema。"""
    explicit = os.getenv("LLM_STRUCTURED_METHOD", "").strip().lower()
    if explicit in {"function_calling", "json_schema", "json_mode"}:
        return explicit
    base = LLM_API_BASE.lower()
    model = LLM_MODEL.lower()
    if "tokenhub" in base or "hunyuan" in base or model.startswith("hy"):
        return "json_schema"
    return "function_calling"


def _structured(llm, schema):
    # 混元偶发返回非严格 JSON，结构化解析失败属瞬态错误（ValueError 家族）：自动重试 3 次
    chain = llm.with_structured_output(schema, method=_structured_output_method())
    return chain.with_retry(
        retry_if_exception_type=(ValueError,),
        wait_exponential_jitter=False,
        stop_after_attempt=3,
    )


def _chat_llm(temperature: float = 0):
    kwargs = {
        "model": LLM_MODEL,
        "temperature": temperature,
        "api_key": LLM_API_KEY,
        "base_url": LLM_API_BASE,
    }
    return ChatOpenAI(**kwargs)


# [已实现]客服路由 Prompt；输出 vectorstore | casual_convo，供 nodes.route_question
class Router:
    class RouteQuery(BaseModel):
        """Route a user query to the most relevant datasource."""

        datasource: Literal["vectorstore", "casual_convo"] = Field(
            ...,
            description="Given a user question choose to route it to casual_convo or a vectorstore.",
        )

    llm = _chat_llm()
    structured_llm_router = _structured(llm, RouteQuery)

    # 客服场景路由 system prompt：知识类 → vectorstore；闲聊/无关 → casual_convo
    system = """你是企业智能客服系统的用户问题路由器。请判断用户问题应当前往哪个数据源，只能在下列两类中选择：
- "vectorstore"：问题与企业知识库相关，涉及企业微信、腾讯会议、腾讯云服务器（CVM）、腾讯云对象存储（COS）、微信小程序的使用方法、功能说明、接口开发、账号权限、安全设置、故障排查，以及客服服务范围、服务时效、转人工规则、信息收集等客服政策。涉及这些产品的“如何做、是什么、怎么办”类问题优先选择 vectorstore。
- "casual_convo"：仅是与上述主题无关的寒暄问候、闲聊、通用常识，或明显不属于本客服知识范围的内容。
若难以判断，倾向于选择 "vectorstore"，交由知识库环节进一步处理。只输出路由判断结果，不要回答问题。"""
    route_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system),
            ("human", "{question}"),
        ]
    )

    question_router = route_prompt | structured_llm_router

    @staticmethod
    def get_model():
        return Router.question_router


# 已实现：检索文档是否相关（yes/no），供 nodes.grade_documents
class DocGrader:
    class GradeDocuments(BaseModel):
        """Binary score for relevance check on retrieved documents."""

        binary_score: str = Field(
            description="Documents are relevant to the question, 'yes' or 'no'"
        )

    llm = _chat_llm()
    structured_llm_grader = _structured(llm, GradeDocuments)

    system = """You are a grader assessing relevance of a retrieved document to a user question.
        If the document contains keyword(s) or semantic meaning related to the user question, grade it as relevant.
        It does not need to be a stringent test. The goal is to filter out erroneous retrievals.
        Give a binary score 'yes' or 'no' score to indicate whether the document is relevant to the question."""
    grade_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system),
            ("human", "Retrieved document: \n\n {document} \n\n User question: {question}"),
        ]
    )

    retrieval_grader = grade_prompt | structured_llm_grader

    @staticmethod
    def get_model():
        return DocGrader.retrieval_grader


# [已实现]客服生成 Prompt（只答库内、禁编资费、不确定转人工），供 nodes.generate
class Generator:
    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                # 客服生成 system prompt：只依据资料作答，禁编造资费，不确定时提示转人工
                """你是企业智能客服系统的智能助手，负责基于检索到的知识库资料回答客户问题。
必须遵守以下要求：
1. 只使用「资料」与「对话历史」中提供的信息回答；不得编造资料中没有的内容，尤其不得编造资费、价格、折扣、版本、权限或时效信息，资料未提及时明确说明无法确认。
2. 回答准确、简洁、条理清晰；操作类问题优先给出分步骤指引。
3. 当资料不足以回答，或问题涉及账号安全、资金、隐私等高风险操作时，明确说明并建议转接人工客服。
4. 与腾讯产品及本客服业务无关的话题，礼貌说明无法解答，并引导用户提出产品相关问题。""",
            ),
            (
                "human",
                """请仅使用下列检索资料与对话历史回答问题；不要编造资料中没有的内容。
问题：{question}
资料：{context}
回答：""",
            ),
        ]
    )

    llm = _chat_llm()
    rag_chain = prompt | llm | StrOutputParser()

    @staticmethod
    def get_model():
        return Generator.rag_chain


# 已实现：生成是否 grounded；供 nodes.grade_generation_v_documents_and_question
class HallucinationGrader:
    class GradeHallucinations(BaseModel):
        """Binary score for hallucination present in generation answer."""

        binary_score: str = Field(
            description="Answer is grounded in the facts, 'yes' or 'no'"
        )

    llm = _chat_llm()
    structured_llm_grader = _structured(llm, GradeHallucinations)

    system = """You are a grader assessing whether an LLM generation is grounded in / supported by a set of retrieved facts.
        Give a binary score 'yes' or 'no'. 'Yes' means that the answer is grounded in / supported by the set of facts.
        If the LLM Generation is saying that it doesnt know or not sure or stating to keep the questions relevant to topic , grade it as 'yes'."""
    hallucination_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system),
            (
                "human",
                "If the LLM Generation is saying that it doesnt know or not sure or stating to keep the questions relevant to topic , grade it as 'yes'. Set of facts: \n\n {documents} \n\n LLM generation: {generation}",
            ),
        ]
    )

    hallucination_grader = hallucination_prompt | structured_llm_grader

    @staticmethod
    def get_model():
        return HallucinationGrader.hallucination_grader


# 已实现：生成是否回答了问题；与幻觉打分一起决定 useful / not useful / not supported
class AnswerGrader:
    class GradeAnswer(BaseModel):
        """Binary score to assess answer addresses question."""

        binary_score: str = Field(
            description="Answer addresses the question, 'yes' or 'no'"
        )

    llm = _chat_llm()
    structured_llm_grader = _structured(llm, GradeAnswer)

    system = """You are a grader assessing whether an answer addresses / resolves a question
        Give a binary score 'yes' or 'no'. Yes' means that the answer resolves the question.
        If the LLM Generation is saying that it doesnt know or not sure or stating to keep the questions relevant to topic , grade it as 'yes'."""
    answer_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system),
            (
                "human",
                "If the LLM Generation is saying that it doesnt know or not sure or stating to keep the questions relevant to topic , grade it as 'yes'. User question: \n\n {question} \n\n LLM generation: {generation}",
            ),
        ]
    )

    answer_grader = answer_prompt | structured_llm_grader

    @staticmethod
    def get_model():
        return AnswerGrader.answer_grader


# 已实现：把用户问句改写成更适合检索的中文；供 nodes.transform_query
class QuestionRewriter:
    llm = _chat_llm()

    system = """你是检索问句改写器。将用户输入改写成更适合向量检索、简洁明确的中文问句。
可结合聊天历史补全指代与省略，并尽量保留或补全产品名称。知识库主题包括企业微信、
腾讯会议、腾讯云服务器、腾讯云对象存储和微信小程序的产品功能、配置方法、账号权限、
接口开发、安全设置、使用指南与故障排查。
只输出改写后的问句，不要解释。"""
    re_write_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system),
            (
                "human",
                "原始问题：\n\n {question} \n 请给出更优检索问句。\n\n 聊天历史：{chat_history}。",
            ),
        ]
    )

    question_rewriter = re_write_prompt | llm | StrOutputParser()

    @staticmethod
    def get_model():
        return QuestionRewriter.question_rewriter
