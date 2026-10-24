# Agent.md —— 本仓库的执行约束

> 这是**常驻约束层**，只写三件事：这仓库怎么跑、哪些地方不许碰、收尾要做什么。
> 细节不在这里：架构与端口 → [`README.md`](README.md)｜记录格式 → [`.workbuddy/skills/worklog/`](.workbuddy/skills/worklog/SKILL.md)｜历史 → [`docs/worklog.md`](docs/worklog.md)

---

## 1. 仓库是什么

企业智能客服三件套，三个独立服务、三种技术栈，靠 HTTP 契约组合：

| 服务 | 目录 | 端口 | 角色 |
|---|---|---|---|
| A1 模型网关 | `services/model-gateway` | 11434 | OpenAI 兼容，多厂商适配 |
| A2 客服工作台 | `web/customer-console` | 3098 | 唯一 UI 入口，三模式切换 |
| A3 RAG 知识服务 | `services/knowledge-rag` | 14052 | LangGraph 自适应检索 |

启动顺序：**services/knowledge-rag → class1 → class2**。依赖方向：A2 → A1（代理模式）、A2 → A3（RAG 模式）。

---

## 2. 常用命令

> 以下命令均在**项目根目录**执行，路径一律使用相对路径。

```powershell
# 启动（三个终端，或后台运行）
cd services/knowledge-rag          && ./.venv/Scripts/python.exe server.py
cd services/model-gateway && npm start
cd web/customer-console   && npm run dev

# 健康检查（三端都应 200）
curl -s http://127.0.0.1:14052/health
curl -s http://localhost:11434/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:3098/

# 前端构建 / 类型检查
cd web/customer-console && npm run build

# 回归脚本（需先起服务；UI 用例另需 Chrome --remote-debugging-port=9445）
cd tests/evidence/deploy-2026-10-20
python t_class1.py    # A1 接口 8 项
python t_services/knowledge-rag.py    # A3 接口 8 项，约 5 分钟
node   t_class2_ui.js # A2 浏览器端到端

# 工作日志格式校验
python .workbuddy/skills/worklog/scripts/check_log.py
```

---

## 3. 验证与已知坑

1. **含中文的请求不要用 Git Bash `curl -d`**（按 GBK 发送，服务端 UTF-8 解出乱码）。用 Python/Node 显式 `encode('utf-8')`。
2. **RAG 单问 50~95 秒属正常**（4~8 次串行模型调用），超时阈值给 ≥300s，勿误判卡死。
3. **`hy3` 是思考型模型**：`max_tokens` 过小时预算被 `reasoning_content` 吃满，`content` 为空但 `finish=stop`。判断成功不能只看 `content`。
4. **改完必须验证**：声称"通过/修复"须附脚本、日志或截图路径；无证据只能写"推测"。

---

## 4. 硬边界（不得）

- **泄露密钥**：不打印、不写日志/报告、不截图，引用统一 `sk-***`；`.env` 仅本地。
- **改动跨项目契约**：5 个图节点名、`/chat` 的 `{question, session_id}` → `{session_id, answer, sources, steps}`、`/chat/reset?session_id=`。
- **不可逆删除**：本环境删除**不进回收站**且项目无 git。删改前先列清单 → 确认 → 备份到 `_archive/<日期>/`。
- **重建环境**：不擅自升级依赖、重建 `.venv`（chromadb 需 MSVC DLL 补丁，重建必重做）或 `db_md`；`REBUILD_VECTORSTORE` 建库后立刻改回 `False`。
- **顺手重构**：只改与任务相关的文件；结构调整后同步 README，不留死链。

---

## 5. 收尾动作（MUST）

任务产生文件改动、部署、测试结论或删除操作时，**结束前调用 `worklog` skill** 落账，并用其中的 `check_log.py` 自检。

> 兜底：若当前环境无法加载 skill，至少在 `docs/worklog.md` 追加四行——**任务时间 / 任务输入 / 执行过程 / 任务产出**，不得无记录结束。

---

## 6. 文档地图

| 想知道 | 去哪里 |
|---|---|
| 架构、端口、完整启动与配置 | `README.md` |
| 记录怎么写、模板、校验 | `.workbuddy/skills/worklog/SKILL.md` |
| 历次任务与问题台账 | `docs/worklog.md` |
| 最新部署与测试结论 | `docs/worklog.md`（T-20261021-01）或 `tests/evidence/deploy-2026-10-21/` |
| 三者关系与整合约束 | `docs/architecture.md` |
| 测试脚本与证据 | `tests/evidence/<日期或主题>/` |
