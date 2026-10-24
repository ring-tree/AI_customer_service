# ---------------------------------------------------------------------------
# FastAPI：端口默认 14052，给客服工作台「RAG 模式」对接
# /health、/chat/reset 已实现；[已实现] 补 POST /chat（调 rag_app.ask）
# ---------------------------------------------------------------------------
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from uuid import uuid4
import os

from modules.rag_app import ask, get_graph, new_message_history

app = FastAPI(title="LangGraphRAG API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 多轮会话：session_id → message_history（进程内内存，重启清空）
_sessions: dict[str, list] = {}


class ChatRequest(BaseModel):
    # F6：max_length 补 2000 上限；空白拦截在 chat() 入口做
    question: str = Field(..., min_length=1, max_length=2000, description="User question")
    session_id: Optional[str] = Field(
        None, description="Optional session id for multi-turn chat"
    )


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    sources: list
    steps: list


# 启动时建图/向量库（首次 REBUILD 会较慢）
@app.on_event("startup")
def startup():
    get_graph()


@app.get("/")
def root():
    """服务探活说明（前端请用客服工作台 RAG 模式，或调用下方 API）。"""
    return {
        "service": "LangGraphRAG",
        "status": "ok",
        "health": "/health",
        "chat": "POST /chat",
        "reset": "POST /chat/reset",
        "note": "UI 请使用客服工作台「RAG 模式」对接本服务",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """
    多轮会话 /chat：
    - session_id 为空则新建 uuid
    - 从 _sessions 取 history，没有则 new_message_history()
    - ask(question, history) → 写回 _sessions → 返回 ChatResponse
    - ValueError → 400；其它异常 → 500
    """
    session_id = req.session_id or str(uuid4())

    # F6：纯空白问题前置拦截（否则进入检索环烧满 4 轮熔断，实测 134s+）
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="question 不能为空或全为空白字符")

    # 未知 session_id 会以新历史开始（前端拿到返回的 session_id 后会持久化复用）
    history = _sessions.get(session_id)
    if history is None:
        history = new_message_history()

    try:
        result = ask(req.question, history)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # 统一转 500，避免堆栈直出
        raise HTTPException(status_code=500, detail=f"RAG 服务内部错误：{exc}")

    _sessions[session_id] = result["message_history"]

    return ChatResponse(
        session_id=session_id,
        answer=result["answer"],
        sources=result["sources"],
        steps=result["steps"],
    )


# 已实现：客服工作台重新生成前可调用，清掉该 session 历史
@app.post("/chat/reset")
def reset_chat(session_id: Optional[str] = None):
    if session_id and session_id in _sessions:
        del _sessions[session_id]
    return {"ok": True, "session_id": session_id}


def main():
    import uvicorn

    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", "14052"))
    uvicorn.run("server:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
