# 企业智能客服系统（A1 + A2 + A3 三件套）

> 基于大模型的**智能 AI 客服**完整演示项目，由三个可独立运行、可互相联调的子项目组成：
> **统一模型服务（网关）** + **客服工作台（前端）** + **LangGraphRAG 知识服务**。
> 全部功能已在本地实测通过（2026-10-21），验收证据见 `test-evidence/`。
>
> ⚠️ **执行规约**：在本仓库执行任何任务前，请先读 [`Agent.md`](Agent.md)（命令、硬边界、收尾动作）；任务结束时按 `worklog` skill 在 [`工作日志.md`](工作日志.md) 落账（任务时间 / 输入 / 过程 / 产出）。

---

## 1. 系统架构

```
                         ┌──────────────────────────────────────┐
   用户 / 浏览器  ──────► │  class2  web_ui（客服工作台 :3098）    │
                         │  设置面板切换三种接入模式（单选）       │
                         └────┬──────────────┬──────────────┬───┘
                              │ direct 模式   │ proxy 模式    │ rag 模式
                              ▼              ▼              ▼
                   /tokenhub（Vite代理）  class1 :11434   class3 :14052
                     直连 TokenHub       统一模型服务      LangGraphRAG
                              │           （多厂商网关）    ├─ Chroma（db_md 本地向量库）
                              └──────────────┴──────────────┴─► 腾讯混元 TokenHub
                                                    （hy3 对话 + kinfra-embedding 向量化）
```

| 子项目 | 定位 | 技术栈 | 端口 | 入口 |
|---|---|---|---|---|
| `class1/02api-proxy` | 统一模型服务：对上 OpenAI 协议，对下适配混元/DeepSeek/智谱/Kimi | Node.js（原生 HTTP，无框架） | **11434** | `npm start` |
| `class2/web_ui` | 客服工作台：对话 UI、多会话、流式打字机、引用来源渲染 | Vite 5 + React 18 + TS + Zustand | **3098** | `npm run dev` |
| `class3` | 知识服务：自适应 RAG（路由→改写→检索→评分→生成→校验） | Python + LangGraph + FastAPI + Chroma | **14052** | `.venv\Scripts\python.exe server.py` |

---

## 2. 目录结构

```
项目根目录/                            # 下文所有路径均相对项目根目录
├── class1\02api-proxy\        # A1 统一模型服务（Node.js）
├── class2\web_ui\             # A2 客服工作台（React 前端）
├── class3\                    # A3 LangGraphRAG 知识服务（Python）
│   ├── server.py / main.py    #   HTTP 服务入口 / 终端问答入口
│   ├── modules\               #   图拓扑、节点、LLM 链、知识入库、统一 ask()
│   ├── data\md\               #   知识库：30 篇腾讯产品文档（六类目）
│   ├── db_md\                 #   Chroma 向量库（已构建：154 chunks）
│   └── docs\                  #   接口约定与本项目实施记录
├── test-evidence/             # 验收证据（截图 + 接口/CLI 记录，含 deploy-2026-10-21/）
├── .workbuddy/skills/worklog/  # 落账 skill：SKILL.md + 任务块模板 + check_log.py 校验脚本
├── Agent.md                    # 执行约束薄层（命令 / 硬边界 / 收尾动作 / 文档地图）
├── 实施指导手册-整改与修复.md  # 可执行手册：A0-A8 整改 + F1-F12 修复 + 8 阶段流程
├── 三项目协同关系分析.md       # 三者关系、联合使用约束与方案
├── _archive/2026-10-21/        # 已归档：审计报告、整改计划、两份测试报告原文
└── 工作日志.md                 # 按日期记录的工作日志（最新置顶）
```

---

## 3. 环境要求

| 组件 | 要求 | 本机实测 |
|---|---|---|
| 操作系统 | Windows 10/11 | Windows 10 ✓ |
| Node.js | ≥ 18 | v22.22.2 ✓ |
| Python | 3.12 推荐（3.11/3.13 亦可） | 3.13 ✓ |
| 网络 | 可访问腾讯 TokenHub | ✓ |
| 密钥 | 腾讯云 TokenHub API Key（**中国站**） | 已配置 ✓ |

> 课程 TokenHub Key（中国站）在三个子项目间**共用一把**：class1 与 class3 已写入各自 `.env`；class2 直连模式需在浏览器设置面板中填写。

---

## 4. 快速开始（三终端启动）

> 启动顺序无硬依赖；演示前建议先启动两个后端，再打开前端。
> 以下命令均在**项目根目录**执行，使用相对路径。

**终端 1：A3 知识服务（:14052）**
```powershell
cd class3
./.venv/Scripts/python.exe server.py     # 或双击 run_server.bat
# 健康检查: http://127.0.0.1:14052/health
```

**终端 2：A1 统一模型服务（:11434）**
```powershell
cd class1/02api-proxy
npm start
# 健康检查: http://localhost:11434/health
```

**终端 3：A2 客服工作台（:3098）**
```powershell
cd class2/web_ui
npm run dev
# 浏览器访问 http://localhost:3098 ，点击右下角客服悬浮球
```

### 首次配置摘要（已完成，重装环境时参考）

- `class1/02api-proxy/.env`：`HUNYUAN_API_KEY=sk-...`；`HUNYUAN_API_URL=https://tokenhub.tencentmaas.com/v1`（**中国站，必须与 Key 地域一致**）
- `class3/.env`：`HUNYUAN_API_KEY` + `OPENAI_API_BASE=https://tokenhub.tencentmaas.com/v1` + `EMBEDDING_API_KEY`（同一把 Key，已实测具备向量化权限）+ `EMBEDDING_MODEL=kinfra-text-embedding-0.6b`
- `class3` 首次建库：`.env` 中 `REBUILD_VECTORSTORE=True` 启动一次，建库完成后改回 `False`（当前已建库、已置 False）
- `class2`：三种模式在界面「设置」中切换；直连模式需填 Key（保存在浏览器 localStorage），代理/RAG 模式无需填写

---

## 5. 三种接入模式对照

| 模式 | 上游 | 前置依赖 | 流式 | 引用来源 | 适用场景 |
|---|---|---|---|---|---|
| 直连 API | TokenHub（经 Vite 代理） | 无 | ✓ | ✗ | 快速体验对话 |
| 实训二代理 | `http://localhost:11434` | A1 已启动 | ✓ | ✗ | 统一网关 / 多厂商切换 |
| **实训四 RAG** | `http://127.0.0.1:14052` | A3 已启动 | ✗（多节点串行） | **✓ 引用来源 + 推理步骤** | 知识问答（可追溯） |

### 推荐体验问题（客服域）
- 企业微信如何获取 `access_token`？
- 腾讯会议如何通过会议号加入会议？（追问："那移动端怎么操作？" → 观察多轮改写）
- 腾讯云服务器如何重置实例密码？
- 对象存储如何创建存储桶？
- 什么情况下建议转人工？
- 闲聊测试："今天天气怎么样？" → 应走闲聊分支并礼貌引导

---

## 6. 接口一览

**class1（OpenAI 兼容）**：`GET /health`、`GET /v1/models`、`POST /v1/chat/completions`（支持 stream SSE，透传 `reasoning_content`）

**class3（自定义 REST）**：
| 接口 | 说明 |
|---|---|
| `GET /health` / `GET /` | 健康检查 / 服务说明 |
| `POST /chat` | `{question, session_id?}` → `{session_id, answer, sources, steps}`（多轮由 session_id 维持，服务端内存） |
| `POST /chat/reset?session_id=` | 重置会话（前端"重新生成"时自动调用） |

---

## 7. 重要注意事项（必读）

1. **⚠️ chromadb 运行库修复（本机特有，重建 venv 后必须重做）**
   本机系统 MSVC 运行库较旧（2022 年版），会导致 chromadb 原生模块崩溃（进程级 `0xC0000005`）。已通过将较新的 `msvcp140.dll / vcruntime140.dll / vcruntime140_1.dll`（取自本机 Edge WebView2 目录）放入 `class3/.venv/Scripts/` 与 `class3/.venv/Lib/site-packages/chromadb_rust_bindings/` 解决。
   重建 venv 后若遇崩溃，请按 `class3/docs/实施记录-2026-10-13.md` 第三节恢复；或安装官方 VC++ 2015-2022 运行库（`https://aka.ms/vs/17/release/vc_redist.x64.exe`）永久修复。
2. **密钥安全**：`.env` 均已在 `.gitignore` 中；提交作业/截图前务必打码；建议定期在 TokenHub 控制台轮换 Key。
3. **地域一致性**：课程 Key 属**中国站**，三个子项目的基址均须指向 `https://tokenhub.tencentmaas.com/v1`；用错地域会 401。
4. **端口冲突**：11434 是 Ollama 默认端口，若本机运行 Ollama 需改 class1 的 `PORT` 并同步 class2 代理地址。
5. **向量库维护**：修改 `class3/data/md` 知识或更换 Embedding 模型后，须 `REBUILD_VECTORSTORE=True` 重建一次；崩溃/中断后先删 `db_md` 再重跑。
6. **安全边界**：三个服务均无鉴权、CORS 全开，仅限本机/受信内网使用；跨机演示时把 web_ui 中的 `localhost/127.0.0.1` 改为服务机 IP。
7. **性能预期**：hy3 首次调用需冷启动（较慢）；RAG 模式单问会触发 4~8 次模型调用，耗时约 1 分钟属正常（非流式为设计使然）。
8. **已知限制**（教学版）：class3 会话与熔断计数为进程内存、重启清空；class2 的 `npm run lint` 缺 ESLint 配置（不影响运行）。

---

## 8. 文档与验收证据

| 文档 | 内容 |
|---|---|
| `Agent.md` | **执行约束薄层**：常用命令、验证要点与已知坑、硬边界（密钥/契约/删除/环境）、收尾动作、文档地图 |
| `.workbuddy/skills/worklog/` | **落账 skill**：任务块的四项必填字段、三级记录体系、编号规则、模板与 `check_log.py` 校验脚本 |
| `实施指导手册-整改与修复.md` | 可独立执行的实施手册：A0-A8 整改 + F1-F12 修复（含代码 diff 与单测）、8 阶段实施流程、风险/回滚/验收清单 |
| `class3/docs/项目接手分析与实施计划.md` | A3 缺口盘点与分步实施方案 |
| `class3/docs/实施记录-2026-10-13.md` | A3 实施与验收全记录（7 项补全、三大问题根因与修复） |
| `三项目协同关系分析.md` | 三者继承/组合/依赖关系、联合约束与深度整合方案 |
| `test-evidence/` | 验收证据：首页渲染、对话截图（流式/非流式）、RAG 联调截图、接口与 CLI 记录；最新一轮见 `deploy-2026-10-21/` |

**验收结论**：三件套全链路实测通过——A2 三模式可用（直连 / 代理 / RAG），A1 全部接口通过（含 SSE 流式），A3 具备完整自适应 RAG 能力（含多轮改写、引用来源、转人工规则）。

---

## 9. 常见问题速查

| 现象 | 处理 |
|---|---|
| class1 启动即退出，提示 No API keys found | 检查 `class1/02api-proxy/.env` 是否配置了 `HUNYUAN_API_KEY` |
| 上游 401 / 401002 | Key 与中国站/国际站地域不匹配（本项目统一用中国站） |
| class2 代理模式"没有可用模型" | A1 未启动或未配置 Key |
| class2 RAG 模式"连接失败" | A3 未启动（`server.py` 未运行在 14052） |
| RAG 偶发 400 | 混元偶发非严格 JSON；已内置自动重试（3 次），偶发仍失败可重发 |
| class3 建库崩溃（0xC0000005 或 Rust panic） | 见第 7 节第 1 条（运行库修复）；并清理残留 `db_md` 后重建 |
| 修改 `.env` 后不生效 | 重启对应服务 |

---

*最后更新：2026-10-21 ｜ 维护提示：各子项目的细节使用说明见其目录内《使用手册.md》。*
