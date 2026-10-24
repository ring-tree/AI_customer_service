# 企业智能客服系统（模型网关 + 客服工作台 + 知识检索服务）

> 基于大模型的**智能 AI 客服**完整演示项目（个人项目），由三个可独立运行、可互相联调的服务组成：
> **统一模型网关** + **客服工作台（前端）** + **LangGraphRAG 知识服务**。
> 最近一轮全量验证通过（2026-10-25），证据见 `tests/evidence/deploy-2026-10-24/`。
>
> ⚠️ **执行规约**：在本仓库执行任何任务前，请先读 [`Agent.md`](Agent.md)（命令、硬边界、收尾动作）；任务结束时按 `worklog` skill 在 [`docs/worklog.md`](docs/worklog.md) 落账（任务时间 / 输入 / 过程 / 产出）。

---

## 1. 系统架构

```
                         ┌──────────────────────────────────────┐
   用户 / 浏览器  ──────► │  web/customer-console（客服工作台 :3098）│
                         │  设置面板切换三种接入模式（单选）          │
                         └────┬──────────────┬──────────────┬───┘
                              │ direct 模式   │ proxy 模式    │ rag 模式
                              ▼              ▼              ▼
                   /tokenhub（Vite代理）  model-gateway   knowledge-rag
                     直连 TokenHub       统一模型网关      LangGraphRAG
                              │           （多厂商适配）    ├─ Chroma（db_md 本地向量库）
                              │              :11434        │    :14052
                              └──────────────┴──────────────┴─► 腾讯混元 TokenHub
                                                    （hy3 对话 + kinfra-embedding 向量化）
```

| 服务 | 目录 | 定位 | 技术栈 | 端口 | 入口 |
|---|---|---|---|---|---|
| 模型网关 | `services/model-gateway` | OpenAI 兼容统一出口，适配混元/DeepSeek/智谱/Kimi；透传 `response_format`/`tools`，含 `/v1/embeddings` | Node.js（原生 HTTP，无框架） | **11434** | `npm start` |
| 客服工作台 | `web/customer-console` | 对话 UI、多会话、流式打字机、文本附件、引用来源渲染 | Vite 5 + React 18 + TS + Zustand | **3098** | `npm run dev` |
| 知识服务 | `services/knowledge-rag` | 自适应 RAG（路由→改写→检索→评分→生成→校验），带引用来源 | Python + LangGraph + FastAPI + Chroma | **14052** | `.venv\Scripts\python.exe server.py` |

---

## 2. 目录结构

```
项目根目录/                            # 下文所有路径均相对项目根目录
├── services/
│   ├── model-gateway/         # 模型网关（Node.js）
│   └── knowledge-rag/         # 知识服务（Python）
│       ├── server.py / main.py    #   HTTP 服务入口 / 终端问答入口
│       ├── modules/               #   图拓扑、节点、LLM 链、知识入库、统一 ask()
│       ├── data/md/               #   知识库：30 篇腾讯产品文档（六类目）
│       ├── db_md/                 #   Chroma 向量库（154 chunks）
│       └── requirements.lock.txt  #   依赖锁定（复现环境用）
├── web/customer-console/      # 客服工作台（React 前端）
├── tests/evidence/            # 历轮验收证据（截图/脚本/日志，最新 deploy-2026-10-24/）
├── tests/evidence/contract/   # 前后端节点名契约测试
├── docs/
│   ├── worklog.md             # 工作日志（最新置顶）
│   ├── architecture.md        # 三服务关系、联合使用约束与方案
│   ├── 整改进度与任务日志.md    # 2026-10-24~25 整改执行进度与恢复锚点
│   └── archive/               # 历史过程文档
├── .workbuddy/skills/worklog/ # 落账 skill：SKILL.md + 模板 + check_log.py 校验脚本
├── Agent.md                   # 执行约束薄层（命令 / 硬边界 / 收尾动作 / 文档地图）
├── README.md                  # 本文件
└── _archive/                  # 归档（历史报告、备份、课程物料）
```

---

## 3. 环境要求

| 组件 | 要求 | 本机实测 |
|---|---|---|
| 操作系统 | Windows 10/11 | Windows 10/11 ✓ |
| Node.js | ≥ 18 | v24.15.0 ✓ |
| Python | 3.13（标准版；free-threaded 构建与二进制扩展不兼容） | 3.13.2 ✓ |
| 网络 | 可访问腾讯 TokenHub 中国站 | ✓ |
| 密钥 | 腾讯云 TokenHub API Key（中国站） | 已配置 ✓ |

> TokenHub Key（中国站）在网关与知识服务间**共用一把**：两处 `.env` 已配置；工作台直连模式需在浏览器设置面板填写（代理/RAG 模式无需）。

---

## 4. 快速开始（三终端启动）

> 启动顺序无硬依赖；演示前建议先启动两个后端，再打开前端。
> 以下命令均在**项目根目录**执行，使用相对路径。

**终端 1：知识服务（:14052）**
```powershell
cd services/knowledge-rag
./.venv/Scripts/python.exe server.py     # 或双击 run_server.bat
# 健康检查: http://127.0.0.1:14052/health
```

**终端 2：模型网关（:11434）**
```powershell
cd services/model-gateway
npm start
# 健康检查: http://localhost:11434/health
```

**终端 3：客服工作台（:3098）**
```powershell
cd web/customer-console
npm run dev
# 浏览器访问 http://localhost:3098 ，点击右下角客服悬浮球（默认即代理模式，免配置）
```

### 配置摘要（重装环境时参考）

- `services/model-gateway/.env`：`HUNYUAN_API_KEY=sk-...`；`HUNYUAN_API_URL=https://tokenhub.tencentmaas.com/v1`（**中国站，必须与 Key 地域一致**）
- `services/knowledge-rag/.env`：`HUNYUAN_API_KEY` + `OPENAI_API_BASE=https://tokenhub.tencentmaas.com/v1` + `EMBEDDING_API_KEY`（同一把 Key）+ `EMBEDDING_MODEL=kinfra-text-embedding-0.6b`
- 依赖复现：`pip install -r requirements.lock.txt`；首次建库：`.env` 置 `REBUILD_VECTORSTORE=True` 启动一次，完成后改回 `False`（当前已建库、已置 False）
- venv 重建注意：用**标准版** Python 3.13（非 3.13t）；重建后必须重做 chromadb 运行库补丁（见第 7 节第 1 条）

---

## 5. 三种接入模式对照

| 模式 | 上游 | 前置依赖 | 流式 | 引用来源 | 适用场景 |
|---|---|---|---|---|---|
| 直连 API | TokenHub（经 Vite 代理） | 无（需填 Key） | ✓ | ✗ | 快速体验对话 |
| 模型网关 | `http://localhost:11434` | 网关已启动 | ✓ | ✗ | 统一出口 / 多厂商切换（**默认模式**） |
| 知识库 RAG | `http://127.0.0.1:14052` | 知识服务已启动 | ✗（多节点串行） | **✓ 引用来源 + 推理步骤** | 知识问答（可追溯） |

### 推荐体验问题（客服域）

- 企业微信如何获取 `access_token`？（追问："那有效期多久？" → 观察多轮改写）
- 腾讯会议如何通过会议号加入会议？
- 腾讯云服务器如何重置实例密码？
- 对象存储如何创建存储桶？
- 什么情况下建议转人工？
- 闲聊测试："今天天气怎么样？" → 应走闲聊分支并礼貌引导
- 附件测试：上传 `.txt/.md/.csv` 后问"附件里写了什么？"（文本附件内容会进入对话）

---

## 6. 接口一览

**模型网关（OpenAI 兼容）**：`GET /health`、`GET /v1/models`、`POST /v1/chat/completions`（SSE 流式，透传 `reasoning_content`/`response_format`/`tools`）、`POST /v1/embeddings`

**知识服务（自定义 REST）**：
| 接口 | 说明 |
|---|---|
| `GET /health` / `GET /` | 健康检查 / 服务说明 |
| `POST /chat` | `{question, session_id?}` → `{session_id, answer, sources, steps}`（多轮由 session_id 维持，服务端内存；空白问题 400） |
| `POST /chat/reset?session_id=` | 重置会话（前端"重新生成"时自动调用） |

---

## 7. 重要注意事项（必读）

1. **⚠️ chromadb 运行库补丁（重建 venv 后必须重做）**
   系统 MSVC 运行库较旧时 chromadb 原生模块会进程级崩溃（`0xC0000005`）。已将较新的 `msvcp140.dll / vcruntime140.dll / vcruntime140_1.dll` 放入 `services/knowledge-rag/.venv/Scripts/` 与 `.venv/Lib/site-packages/chromadb_rust_bindings/`。重建 venv 后按 `docs/archive/实施记录-2026-10-13.md` 第三节恢复；或安装官方 VC++ 2015-2022 运行库永久修复。
2. **密钥安全**：`.env` 已在 `.gitignore`；提交作业/截图前务必打码；建议定期在 TokenHub 控制台轮换 Key。
3. **地域一致性**：项目 Key 属**中国站**，所有基址须指向 `https://tokenhub.tencentmaas.com/v1`；用错地域会 401/401002。
4. **端口冲突**：11434 是 Ollama 默认端口，本机若运行 Ollama 需改网关 `PORT` 并同步工作台代理地址。
5. **向量库维护**：修改 `data/md` 知识或更换 Embedding 模型后，须 `REBUILD_VECTORSTORE=True` 重建一次；中断后先删 `db_md` 再重跑（重建前备份到 `_archive/`）。
6. **安全边界**：三个服务均无鉴权、CORS 全开，仅限本机/受信内网使用；跨机演示把工作台中的 `localhost/127.0.0.1` 改为服务机 IP。
7. **性能预期**：hy3 首次调用需冷启动；RAG 模式单问触发 4~8 次模型调用，耗时约 1 分钟属正常（非流式为设计使然）；前端已内置分级超时（对话 60s / RAG 180s）。
8. **已知限制**（教学版底子）：知识服务会话与熔断计数为进程内存、重启清空；熔断计数为类级共享变量，多会话并发可能互扰。

---

## 8. 文档与验收证据

| 文档 | 内容 |
|---|---|
| `Agent.md` | **执行约束薄层**：常用命令、验证要点与已知坑、硬边界（密钥/契约/删除/环境）、收尾动作、文档地图 |
| `.workbuddy/skills/worklog/` | **落账 skill**：任务块四项必填字段、编号规则、模板与 `check_log.py` 校验脚本 |
| `docs/architecture.md` | 三服务关系、联合使用约束与深度整合方案 |
| `docs/整改进度与任务日志.md` | 2026-10-24~25 整改执行记录（A0-A8 + F1-F12），可作中断恢复锚点 |
| `docs/archive/` | 历史过程文档（接手分析、实施记录等） |
| `tests/evidence/` | 历轮验收证据；最新一轮 `deploy-2026-10-24/`（网关 10/10、知识服务 9/9、UI 4/4、契约测试通过） |

**最近一轮验收结论**（2026-10-24~25）：三服务全链路实测通过——工作台三模式可用（直连/代理/RAG，附件进入对话），网关 10 项接口全过（含 `response_format` 透传、embeddings、流式单 finish 帧），知识服务 9 项全过（含空白问题 400 拦截），前后端节点名契约一致，前端构建 0 错误。

---

## 9. 常见问题速查

| 现象 | 处理 |
|---|---|
| 网关启动即退出，提示 No API keys found | 检查 `services/model-gateway/.env` 是否配置了 `HUNYUAN_API_KEY` |
| 上游 401 / 401002 | Key 与中国站/国际站地域不匹配（本项目统一用中国站） |
| 工作台代理模式"没有可用模型" | 网关未启动或未配置 Key |
| 工作台 RAG 模式"无法连接服务" | 知识服务未启动（`server.py` 未运行在 14052） |
| RAG 偶发 400 | 混元偶发非严格 JSON；已内置自动重试（3 次），偶发仍失败可重发 |
| 建库崩溃（0xC0000005 或 Rust panic） | 见第 7 节第 1 条（运行库补丁）；清理残留 `db_md` 后重建 |
| 修改 `.env` 后不生效 | 重启对应服务 |
| 空白提问被 400 拒绝 | 属预期行为（F6 前置拦截），请输入有效问题 |

---

*最后更新：2026-10-25 ｜ 项目已建立 git 基线（见 `git log`），历次改动可追溯。*
