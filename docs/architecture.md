# class1 / class2 / services/knowledge-rag 三项目协同关系分析

> 分析对象：`services/model-gateway`（A1 统一模型服务）、`web/customer-console`（A2 客服工作台）、`services/knowledge-rag`（A3 LangGraphRAG 知识服务）
> 分析日期：2026-10-13 ｜ 依据：三个项目全部源码通读 + class1/class2 实测结论 + services/knowledge-rag 代码级核查

---

## 一、结论速览

1. **三者之间不存在任何代码级"继承"**（三个独立仓库、三种技术栈：Node.js / React+TS / Python）。实际存在的是 **契约对齐（可视为"接口继承"）+ 系统级组合 + 单向可选依赖** 三种关系。
2. **"services/knowledge-rag 是 class1/class2 的优化与补充"这一说法需要修正**：
   - **"补充"成立**：services/knowledge-rag 为系统补上了 class1 完全没有的"知识库检索 + 可追溯回答"能力，是 class2 预置的第三个后端模式；
   - **"优化"目前不成立**：services/knowledge-rag 并不改进或替代 class1/class2 的任何现有功能，它反而引入了与 class1 平行的第二条 TokenHub 出网通道（重复的密钥/接入约定）。唯有完成"模型网关收敛"改造（见第五节 L2）后，它才真正转化为对 class1"统一模型服务"定位的强化。
3. **三者可联合使用**（同机并存、端口无冲突、CORS 已互开），但联合形态是 **"三后端并存、前端单选切换"**，而非并发融合——class2 同一会话只能处于 direct / proxy / rag 之一。
4. 联合使用的**两个硬约束**（若要做深度整合必须先解决）：
   - class1 **不透传 `response_format`/`tools`** → services/knowledge-rag 的结构化输出链路（Router/打分器）经 class1 会失效；
   - class1 **没有 `/v1/embeddings` 路由** → services/knowledge-rag 的向量化无法收敛到网关。

---

## 二、三者定位与关系本质

### 2.1 定位（分层视图）

```
                 ┌─────────────────────────────────────────────┐
   用户/浏览器 →  │ class2  web_ui (:3098)  呈现与编排层（唯一入口）│
                 └──────┬──────────────┬──────────────┬────────┘
                        │ direct 模式   │ proxy 模式    │ rag 模式
                        ▼              ▼              ▼
               /tokenhub(Vite代理)  class1(:11434)  services/knowledge-rag(:14052)
                        │              模型网关        RAG 编排服务
                        │              │               ├─ Chroma(db_md 本地向量库)
                        └──────────────┴───────────────┴─→ 腾讯 TokenHub
                                                          （混元 hy3 对话 + kinfra Embedding）
```

- **class1 = 网关层**：对上一个 OpenAI 协议，对下适配 4 厂商；持钥方、协议归一化。
- **services/knowledge-rag = 知识增强层**：LangGraph 状态机（路由→改写→检索→评分→生成→校验），产出带 `sources`/`steps` 的可信回答。
- **class2 = 呈现与编排层**：三种连接模式切换、多会话、流式打字机、sources/steps 渲染、转人工规则——它是三个项目的"用户界面"，也是 class1 与 services/knowledge-rag 的能力消费方。

### 2.2 关系类型逐一判定

| 关系维度 | class1 ↔ class2 | class2 ↔ services/knowledge-rag | class1 ↔ services/knowledge-rag |
|---|---|---|---|
| 代码级继承 | ❌ 无 | ❌ 无 | ❌ 无 |
| 运行依赖（单向） | class2 `proxy` 模式 → class1 | class2 `rag` 模式 → services/knowledge-rag | ❌ 无依赖（当前平行独立） |
| 协议 | OpenAI 兼容（`/v1/chat/completions`、`/v1/models`、`/health`） | 自定义 REST（`/chat`、`/chat/reset`、`/health`） | 同为"TokenHub 出网方"（重复通道） |
| 契约对齐（"接口继承"） | class2 的测连/拉模型/对话逻辑按 class1 接口设计 | class2 的 `RagSource`/`RagStep` 类型、`STEP_LABELS` 节点名、`/chat/reset` 调用方式均按 services/knowledge-rag 契约预置 | 共用 `HUNYUAN_API_KEY` 变量名、共用模型名 `hy3`、同地域约定（文档明确"可与实训二共用 Key"） |
| 组合方式 | class1 是 class2 的**可插拔后端**之一 | services/knowledge-rag 是 class2 的**第三个可插拔后端 + 知识增强层** | **潜在深度组合**：services/knowledge-rag 的 LLM 出口可委托 class1 出网（需补 2 个能力，见下） |
| 调用方向 | 2 → 1（HTTP） | 2 → 3（HTTP） | 3 → 1（可选、未接线） |

**一句话**：这不是"三个类"的 OOP 关系，而是**三个服务**的分层组合——class2 是壳与入口，class1 与 services/knowledge-rag 是它的两个能力后端；services/knowledge-rag 与 class1 之间是"平级互补 + 可选委托"。

### 2.3 已被设计固化的"契约继承"证据

| 预置方（class2） | 期待方（services/knowledge-rag） | 说明 |
|---|---|---|
| `ragApi.ts` 请求 `POST {ragUrl}/chat` body `{question, session_id}` | `server.py` `ChatRequest` 字段同名同义 | 一字不差对齐 |
| `RagChatResponse {session_id, answer, sources, steps}` | `server.py` `ChatResponse` 同构 | 响应契约对齐 |
| `RagStep {node, regeneration?, retrieval?}` + `STEP_LABELS`（`transform_query/retrieve/grade_documents/generate/generate_conv_reply`） | `graph.py` 节点名约定 | **services/knowledge-rag 实现 TODO-4/5 时必须沿用这些节点名**，否则前端步骤面板显示原始英文 |
| `resetRagSession` → `POST /chat/reset?session_id=` | `server.py` 已实现该端点（query 参数） | 已对齐 |
| `testRagConnection` → `GET /health` | `server.py` 已实现 | 已对齐 |

---

## 三、能否联合使用：组合矩阵

| 组合 | 能否联合 | 现状 | 条件 |
|---|---|---|---|
| class2 + class1（proxy 模式） | ✅ 能 | **已实测跑通**（开客服窗→发消息→流式回复，含 reasoning 面板、tokens/s） | class1 已启动且 `.env` 配了 Key |
| class2 + services/knowledge-rag（rag 模式） | ✅ 能（设计目标） | ⏳ 待 services/knowledge-rag 补齐 7 处 TODO（当前 `POST /chat` 返回 501）并完成首次建库 | 按《services/knowledge-rag 项目接手分析与实施计划》执行 |
| class1 + services/knowledge-rag（LLM 出口委托） | ⚠️ 有条件 | 未接线；静态核查发现 **2 个能力缺口**（见问题 A1/A2） | 需先增强 class1 |
| 三者同机并存 | ✅ 能 | 端口 11434 / 3098 / 14052 互不冲突；两个后端 CORS 已互开；无启动依赖顺序 | 单机建议 ≥8GB 内存（向量库+Node+Python 常驻） |

> 注：class2 的三种模式为**单选切换**——"联合使用"的含义是"三后端同时在线、前端随时切换"，而不是同一条消息同时走多个后端。

---

## 四、协同工作方式（如何达到更好效果）

### L1 · 基线协同（零改动，当前即可）

- **知识类问题走 RAG 模式**：获得 class1 给不了的"可追溯回答"——引用来源（sources）+ 推理步骤（steps）+ 客服规则约束（只答库内、不确定转人工，由 services/knowledge-rag 的 Prompt 保证）。
- **闲聊/通用问题走代理模式**：获得流式打字机、多厂商可选、密钥不落前端。
- **class2 本地兜底**："转接人工客服"快捷入口不调任何模型，直接本地回复——三层降级链完整。
- **调试协同**：services/knowledge-rag 开 `DEBUG=True` 看节点流转；class1 看彩色请求日志；class2 看 steps 面板——三层可观测，教学演示效果好。

### L2 · 网关收敛（小改造，把"补充"变成真正的"优化"）

目标形态：**"A2 一个入口、A1 一把密钥、A3 一套知识"**。

1. **services/knowledge-rag 的 LLM 出口改为经 class1**：services/knowledge-rag `.env` 设 `OPENAI_API_BASE=http://localhost:11434/v1`、`LLM_MODEL=hy3`（class1 的别名表里已有）。
   - 收益：services/knowledge-rag 不再直连 TokenHub，全系统对话流量统一过网关——单一密钥源、统一日志、未来可无感切换 deepseek/glm/kimi（class1 路由）。
   - **前置改造（必须）**：class1 透传 `response_format`（见问题 A1），否则 services/knowledge-rag 的结构化链路崩掉。
2. **（可选）给 class1 增加 `/v1/embeddings` 透传路由**：让 embedding 也收敛到网关（见问题 A2）。若不改，services/knowledge-rag 保留唯一的自持密钥出口（向量化），仍可正常运行。
3. 收敛后密钥盘点：仅 `class1/.env`（对话）+ `services/knowledge-rag/.env` 的 embedding 段（或全部收敛）；class2 直连模式可以弃用。

### L3 · 体验增强（前端扩展，可选）

- **自动模式（Auto Router）**：先走 RAG，检索/评分未命中时回退 LLM 直答——class2 当前无此编排（属其手册拓展项 E2/E3 邻近方向），需要改 `HomePage.handleSend` 的分支逻辑。
- **答案融合**：RAG 拿到 sources 后，用 class1 的流式能力润色输出——同样超出当前实现。

### L4 · 运维协同

- 统一端口台账与启动顺序（建议：services/knowledge-rag → class1 → class2）；三份健康检查（`11434/health`、`14052/health`、web_ui 首页）组成冒烟清单。

---

## 五、约束、冲突与潜在问题（联合使用必读）

> 分级：【阻断】不解决就无法联合；【改造】实现某协同路径的前置条件；【注意】需规避或知情的坑。

### A. 协议与能力边界

| # | 级别 | 问题 | 依据/根因 | 处置方向 |
|---|------|------|-----------|----------|
| A1 | 【改造】 | **class1 不透传 `response_format`/`tools`**：services/knowledge-rag 的 Router、DocGrader、幻觉/答案评分器全部依赖结构化输出（`json_schema`），若经 class1 调用，请求体被重建时这些字段被丢弃，模型输出不受约束，LangChain 解析大概率失败 | class1 `index.js`：请求侧仅解构 `model/messages/stream/temperature/top_p/max_tokens/stream_options`；`buildOpenAIChatBody` 组包时仅有上述字段（已 grep 核查：全文件 0 处 `response_format`/`tools`） | 若要 L2 收敛：给 class1 的请求解构与组包逻辑补透传 `response_format`（`tools` 视需要）；改动约 10 行 |
| A2 | 【改造】 | **class1 无 `/v1/embeddings` 路由**：services/knowledge-rag 的向量化无法走网关 | class1 路由表仅 4 条（`/`、`/health`、`/v1/models`、`/v1/chat/completions`） | 给 class1 增加 embeddings 透传（或接受 services/knowledge-rag 保留独立 embedding 出网） |
| A3 | 【注意】 | services/knowledge-rag `validate_env()` 强制要求 LLM Key 非空且不含 `replace/your_` 等占位词——即使 LLM 改走本地 class1 免钥，也必须放一个"能过校验"的值 | `env_utils.validate_llm_api_key` | 收敛时填 `sk-local-proxy` 类占位值（勿含 `replace`/`your_`/`sk-test` 前缀） |
| A4 | 【注意】 | services/knowledge-rag 的 `_structured_output_method()` 依据 base/model 自动选 `json_schema`：经 class1 时代理地址不含 "tokenhub"，但 `hy3` 前缀仍命中 → 仍会用 `json_schema`——与 A1 叠加才是完整风险链（走通的前提就是修好 A1） | `models.py` 判定逻辑 | 配合 A1 一起验证；换非 hy 系模型（经 class1 用 deepseek 等）时需回归验证结构化输出 |

### B. 契约与交互细节

| # | 级别 | 问题 | 说明 | 处置方向 |
|---|------|------|------|----------|
| B1 | 【注意】 | **节点名契约**：services/knowledge-rag 实现 `ask()` 产出的 `steps[].node` 必须与 class2 `STEP_LABELS` 的 5 个键一致，否则前端显示原始英文 | `graph.py` 已固定节点名（rename 会破坏前端展示） | 实现 TODO-4 时保持既有 5 个节点名 |
| B2 | 【注意】 | **会话生命周期错位**：services/knowledge-rag 会话是进程内内存（重启即清空），class2 的 `ragSessionId` 持久化在 localStorage——服务重启后前端手持"失效 sid"继续提问 | `server.py` `_sessions` + `chat.store` | 实现 TODO-6 时：未知 sid 应**新建会话并回传新 sid**（前端会自动更新 `ragSessionId`，可自愈）；纯 echo 旧 sid 也可，但要注意语义 |
| B3 | 【注意】 | **RAG 模式非流式 + 多次串行 LLM 调用**：一条问题可能触发 4~8 次模型调用（路由 1 + 文档评分 ≤N + 生成 ≤3 + 双评分 ≤2），延迟显著高于代理/直连；hy3 还有冷启动 | services/knowledge-rag 图拓扑 + class2 RAG 分支为一次性返回 | 演示前先"预热"一问；RAG 模式不要期待打字机（设计如此） |
| B4 | 【注意】 | class2 在 RAG 模式下**忽略**模型/流式/temperature 设置（仅 LLM 模式生效） | `SettingsPanel` 仅在 LLM 模式渲染这些项 | 须知即可，非缺陷 |

### C. 密钥、地域与安全

| # | 级别 | 问题 | 说明 | 处置方向 |
|---|------|------|------|----------|
| C1 | 【注意】 | **密钥三处副本**：class1 `.env`、class2 浏览器 localStorage（直连模式）、services/knowledge-rag `.env`——轮换成本高、泄露面大 | 教材已知简化 | 推进 L2 收敛；至少停用 class2 直连模式的使用习惯 |
| C2 | 【注意】 | **地域必须一致**：课程 Key 属中国站。class1 ✓（中国站）、class2 Vite 代理 ✓（中国站）、services/knowledge-rag `.env.example` 对话默认**国际站** ✗ | 三处 base 不一致会得到 401002 | services/knowledge-rag 执行阶段把 `OPENAI_API_BASE` 改为中国站（已在实施计划 S2 中列出） |
| C3 | 【注意】 | **全栈无鉴权**：class1 无客户端校验；services/knowledge-rag `CORS *` + `0.0.0.0`；web_ui dev `host 0.0.0.0` | 教学版限制 | 仅本机/受信内网运行，勿暴露公网 |
| C4 | 【注意】 | **跨机演示地址坑**：web_ui 默认 `localhost:11434` / `127.0.0.1:14052`——若从另一台机器打开 web_ui，浏览器里的这两个地址指向"访问者自己的电脑" | `setting.ts` 默认值 | 跨机时将 proxyUrl/ragUrl 改为服务机局域网 IP |

### D. 运行与并发

| # | 级别 | 问题 | 说明 | 处置方向 |
|---|------|------|------|----------|
| D1 | 【注意】 | **services/knowledge-rag 端口与状态**：`db_md` 未建时 RAG 模式必失败；`REBUILD_VECTORSTORE` 误留 `True` 会每次启动重建（耗时 + 消耗 embedding 额度） | services/knowledge-rag 实施计划 S10 | 建库一次后立即改回 `False` |
| D2 | 【注意】 | **class1 默认端口 11434 与 Ollama 冲突**：项目名 `ollama-api-proxy` 即源于此——本机若装了 Ollama 会撞端口 | class1 `.env` PORT=11434 | 冲突时改 class1 `PORT` 并同步 class2 `proxyUrl` |
| D3 | 【注意】 | **并发污染**：services/knowledge-rag 的熔断计数器（`REGENERATION/RERETREVIAL_COUNT`）是**类级共享**变量，多会话并发互扰；`_sessions` 亦为单进程内存 | `nodes.py` 类属性 | 单人演示无碍；多人同时提问时可能串扰（已记录为教学版已知限制） |
| D4 | 【注意】 | 启动顺序无硬依赖，但 web_ui 打开设置面板/切模式会即时探测后端——**先启动后端再演示**可避免"连接失败"字样出镜 | class2 `SettingsPanel` 自动拉取逻辑 | 冒烟顺序：services/knowledge-rag → class1 → class2 |

---

## 六、联合运行推荐配置（速查）

| 项目 | 端口 | 密钥来源 | 关键开关 | 与谁协同 |
|---|---|---|---|---|
| class1 | 11434 | `.env`（中国站 Key） | `HUNYUAN_API_URL` 中国站 | 被 class2 proxy 模式调用；（改造后）被 services/knowledge-rag 复用 |
| class2 | 3098 | 无需（proxy 模式）；直连模式才填 Key | `connectionMode` 单选 | 编排 class1 / services/knowledge-rag 两个后端 |
| services/knowledge-rag | 14052 | `.env`（对话 + Embedding，均可复用 class1 的 Key） | `REBUILD_VECTORSTORE`（首建 True 后 False）；联调时 `DEBUG=True` | 被 class2 rag 模式调用 |

**冒烟清单（联合演示前按序执行）**：① services/knowledge-rag `/health` → ② class1 `/health` 与 `/v1/models` → ③ web_ui 打开 → 设置面板分别"测试连接" RAG 与代理 → ④ 两模式各发一条样例问题 → ⑤ 观察回答 + sources/steps + 转人工快捷入口。

---

## 七、附：三处关键字段对照（实现时勿改动）

```
class2 (ragApi.ts)              services/knowledge-rag (server.py)              备注
POST {ragUrl}/chat              POST /chat                      body: {question, session_id}
{question, session_id}          同字段                            session_id 可空 → 新建
← {session_id, answer,          ← ChatResponse 同构               前端会回存 session_id
   sources:[{source,metadata,preview}],
   steps:[{node,regeneration?,retrieval?}]}
POST {ragUrl}/chat/reset?session_id=  POST /chat/reset（query 参数）  重新生成前调用
GET  {ragUrl}/health            GET /health
```

---

*本文档为静态分析 + 已有实测结论的汇总；class1 的 A1/A2 两项整改与 services/knowledge-rag 的 7 处 TODO 尚未实施，属"联合深水区"的前置工作，可并入既有实施计划执行。*
