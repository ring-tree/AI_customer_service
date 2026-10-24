# 实训四（学生版）：LangGraphRAG 智能客服

请配合《实训四：LangGraphRAG（自适应检索增强）实验指导手册》完成 `TODO(学生)-1～6`。

## 挖空清单

| 标记 | 文件 | 内容 |
|------|------|------|
| TODO-1 | `modules/loader.py` | `build_embeddings`（TokenHub Embedding） |
| TODO-2 | `modules/loader.py` | Markdown 切块入库 Chroma |
| TODO-3a/3b | `modules/models.py` | Router / Generator 客服 Prompt |
| TODO-4 | `modules/graph.py` | LangGraph 拓扑连线 |
| TODO-5 | `modules/rag_app.py` | `ask()` 一轮问答 |
| TODO-6 | `server.py` | `POST /chat` 会话接口 |

`nodes.py`、评分器、腾讯产品知识文档与客服规则（`data/md`）已提供。无内置静态问答页；UI 请用实训三「RAG 模式」。

## 快速开始

```powershell
copy .env.example .env
# 填写 HUNYUAN_API_KEY、EMBEDDING_API_KEY（可分开）

uv venv --python 3.12 .venv
uv pip install -r requirements.txt --python .venv\Scripts\python.exe

# 首次建库
# .env 中 REBUILD_VECTORSTORE=True
.\.venv\Scripts\python.exe server.py
```

端口：`14052`。与实训三「RAG 模式」联调地址：`http://127.0.0.1:14052`。

知识域：腾讯产品技术文档与课程项目客服规则。为兼顾课堂时长、向量化耗时和接口调用成本，本实训精选 30 篇具有代表性的文档作为知识库；真实企业项目通常会接入数量更多、更新更频繁的业务资料。
