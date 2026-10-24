# 项目长期记忆（企业智能客服三件套）

## 关键事实
- 项目根：历史文档曾写 `E:`/`F:` 盘；**本会话工作区与文档所写盘符不一致**。自 2026-10-21 起统一约定：文档与命令只写**相对项目根目录**的路径；`check_log.py` 默认日志路径已改为按脚本位置推导，不再硬编码盘符。
- 三服务：class1 `02api-proxy` :11434（npm start）、class2 `web_ui` :3098（npm run dev）、class3 :14052（`.venv\Scripts\python.exe server.py`）。
- 启动顺序：class3 → class1 → class2。全部依赖复用既有 node_modules / .venv / db_md，无需重装。**2026-10-21 任务周期结束时三服务已全部停止，端口 11434/3098/14052 已释放。**
- 密钥：class1 与 class3 各自 `.env` 持有同一把腾讯 TokenHub **中国站** Key（`https://tokenhub.tencentmaas.com/v1`）；class2 默认模式 direct 且 Key 为空，演示需切「实训二代理」或「实训四 RAG」。

## 已验证结论（2026-10-20）
- 全链路 20/20 通过：A1 接口 8、A3 接口 8、A2 浏览器端到端 4。
- RAG 单问耗时 54~93s（4~8 次串行调用），属设计；闲聊分支约 8s。
- hy3 是思考型模型：`max_tokens` 过小会导致 `content` 为空（预算被 reasoning 吃满）；前端默认 4096。
- 测试含中文的 HTTP 请求不要用 Git Bash `curl -d`（会按 GBK 发送导致乱码），用 Python/Node 显式 UTF-8。

## 已知待优化（未修）
- class3 纯空白 question 触发 4 轮检索环（134s）→ 建议 strip 后 400。
- class2 缺 ESLint 配置，`npm run lint` 不可用。
- class1 流式结尾重复 `finish_reason:"stop"` 帧。
- chromadb 依赖 venv 内 MSVC DLL 补丁，重建 venv 必须重做（或装 VC++ 2015-2022 运行库）。

## 维护约定
- **`Agent.md` 是常驻薄层**（约 86 行）：常用命令、验证要点/已知坑、硬边界、收尾动作、文档地图。**不再承载日志模板与细则**。
- **`worklog` skill 是落账规范**：`.workbuddy/skills/worklog/SKILL.md` + `templates/task-block.md` + `scripts/check_log.py`。任务收尾调用，四项必填——任务时间（GMT+8）/ 任务输入 / 执行过程 / 任务产出，并跑 `check_log.py` 自检。任务编号 `T-YYYYMMDD-NN`。
- 写日志前先 `date` 取系统时间，禁止估写时间区间。
- 事实源分工：`README.md` = 架构/端口/启动；`Agent.md` = 约束与命令；skill = 记录怎么写；`工作日志.md` = 历史记录。
- 内部技术细节仍写 `.workbuddy/memory/YYYY-MM-DD.md`；证据放 `test-evidence/<日期或主题>/`。
- 根目录文档集（2026-10-21 清理后）：`README.md`、`Agent.md`、`实施指导手册-整改与修复.md`、`三项目协同关系分析.md`、`工作日志.md`。已归档至 `_archive/2026-10-21/`：项目完整性审计报告、整改计划表、两份测试报告（原始文件，需要时可查）；更早已永久删除：项目分析与测试报告.md、下一步执行计划.md（无 git）。
- **删除风险**：本环境 genie-trash 会报 "operations aborted" 但文件实际永久删除且不进回收站；项目无 git，删文件前必须先确认并考虑先备份。
