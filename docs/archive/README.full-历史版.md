# 实训四：LangGraphRAG

基于 LangGraph 的自适应 RAG 服务（FastAPI），知识域为**腾讯相关产品技术文档与课程项目客服规则**，供实训三「RAG 模式」调用。

- **LLM**：腾讯混元 TokenHub（默认 `hy3`）
- **Embedding**：腾讯 TokenHub 国内站（默认 `kinfra-text-embedding-0.6b`）
- **向量库**：本地 Chroma（`db_md`）
- **默认端口**：`14052`

## 功能

| 接口 | 说明 |
|------|------|
| `GET /` | 服务说明 JSON |
| `GET /health` | 健康检查 |
| `POST /chat` | RAG 问答（`question` + 可选 `session_id`） |
| `POST /chat/reset` | 重置会话 |

## 快速开始

1. 复制并编辑环境变量：

```powershell
copy .env.example .env
```

至少填写：

- `HUNYUAN_API_KEY`：问答用 TokenHub 密钥（可与实训二共用）
- `EMBEDDING_API_KEY`：向量化密钥（可与问答分开；未设则回退问答 Key）

Embedding 默认：

- `EMBEDDING_API_BASE=https://tokenhub.tencentmaas.com/v1`
- `EMBEDDING_MODEL=kinfra-text-embedding-0.6b`

2. 安装依赖（Python 3.12 推荐）：

```powershell
uv venv --python 3.12 .venv
uv pip install -r requirements.txt --python .venv\Scripts\python.exe
```

3. 启动服务：

```powershell
.\.venv\Scripts\python.exe server.py
```

或双击 `run_server.bat`。

- 健康检查：http://127.0.0.1:14052/health
- 服务说明：http://127.0.0.1:14052/
- 对话 UI：请用实训三「RAG 模式」对接本服务（不再提供内置静态页）

**终端模式：**

```powershell
.\.venv\Scripts\python.exe main.py
```

输入问题回车；输入 `exit` 退出。

## 向量库

- 知识源：`data/md`，共 30 篇代表性文档。为兼顾课堂时长、向量化耗时和接口调用成本，本实训控制知识库规模；真实企业项目通常会接入数量更多、更新更频繁的业务资料。
- 首次启动会构建 `db_md`；之后默认复用
- 换 Embedding 模型或知识文件后，在 `.env` 设 `REBUILD_VECTORSTORE=True`，建库成功后再改回 `False`

## 与实训三

实训三设置选择「实训四 RAG」，Base URL：

`http://127.0.0.1:14052`

## 架构图

### Vector DB Creation

![Vector DB Creation](architecture/vectordb_creation.png)

### RAG Architecture

![RAG Architecture](architecture/RAG.png)

更细的环境与教学要点见 `docs/实践手册要点与环境记录.md`。
