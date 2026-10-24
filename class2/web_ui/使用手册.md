# 企业智能客服前端（web_ui）使用手册

> 前端 LLM 聊天应用 —— A2 客服工作台
> 技术栈：Vite 5 + React 18 + TypeScript 5 + Zustand 4 ｜ 开发端口：3098 ｜ 更新日期：2026-09-29

---

## 1. 项目简介

本项目是**企业智能客服系统的前端工作台**，属于 A2 实训产出，也是企业主项目 A 的用户侧入口。

核心能力：

- **三种后端接入模式**：直连 TokenHub、走 A1 统一模型服务代理、走 A3 RAG 服务；
- **流式对话**：SSE 增量解析，实现打字机效果，并展示深度思考过程与 token 用量/速度；
- **多会话管理**：会话持久化到浏览器本地，支持新建、切换、重命名、删除；
- **内容呈现**：Markdown 渲染、代码块高亮与主题切换、RAG 引用来源与推理步骤；
- **答案编排**：发送闭环、错误恢复、重新生成。

---

## 2. 环境要求

| 项目 | 要求 |
|---|---|
| Node.js | 18.x / 20.x LTS（推荐 20） |
| npm | ≥ 9 |
| 浏览器 | Chrome / Edge 最新稳定版 |

依赖（见 `package.json`）：

| 依赖 | 用途 |
|---|---|
| `react` / `react-dom` 18 | 界面渲染 |
| `react-router-dom` 6 | 路由 |
| `zustand` 4 | 设置与会话状态持久化 |
| `markdown-it` / `highlight.js` / `markdown-it-emoji` | Markdown 与代码高亮 |
| `animate.css` | 过渡动画 |
| `vite` / `typescript` / `sass` | 开发服务器、类型检查、样式 |

---

## 3. 目录结构

```
web_ui/
├─ index.html                  # 挂载点 + 站点图标
├─ vite.config.ts              # 端口 3098；/tokenhub 开发代理（含接入地域配置）
├─ tsconfig.json               # 严格模式 + @ 路径别名
├─ package.json
└─ src/
   ├─ main.tsx                 # 入口，挂载 RouterProvider
   ├─ router/index.tsx         # 路由：/ → HomePage，/chat 重定向到 /
   ├─ views/
   │  ├─ HomePage.tsx          # 首页落地页 + 客服窗 + 发送闭环（核心业务）
   │  └─ HomePage.scss
   ├─ components/
   │  ├─ ChatInput.tsx         # 输入区：文本 / 附件 / 图片
   │  ├─ ChatMessage.tsx       # 消息气泡：Markdown、思考、RAG、操作栏
   │  ├─ SettingsPanel.tsx     # 设置抽屉：模式 / 模型 / Key / 生成参数
   │  ├─ PopupMenu.tsx         # 会话列表弹层（新建 / 切换 / 编辑 / 删除）
   │  ├─ DialogEdit.tsx        # 重命名与删除确认弹窗
   │  └─ SearchDialog.tsx      # 全局提问对话框（Ctrl+K）
   ├─ stores/
   │  ├─ setting.ts            # 连接模式与生成参数（localStorage 持久化）
   │  └─ chat.ts               # 会话与消息（localStorage 持久化）
   ├─ utils/
   │  ├─ api.ts                # 上游地址拼装 + OpenAI 兼容对话请求
   │  ├─ messageHandler.ts     # 消息构造 + SSE / JSON 响应解析
   │  ├─ ragApi.ts             # A3 RAG 接口封装
   │  └─ markdown.ts           # Markdown 渲染
   └─ assets/
      ├─ photo/                # 图标与页面图片
      └─ styles/main.css
```

---

## 4. 快速开始

```bash
npm install
npm run dev
```

终端输出即访问地址（默认 `http://localhost:3098`，配置了 `open: true` 会自动打开浏览器）。

其他命令：

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动开发服务器（3098） |
| `npm run build` | **类型检查（`tsc`）+ 生产构建**，输出到 `dist/` |
| `npm run preview` | 本地预览构建产物 |
| `npm run lint` | ESLint 检查 |

> ⚠️ `npm run build` 会先跑 `tsc` 类型检查。任何 TypeScript 类型错误都会导致构建失败，因此它是本项目最可靠的"体检"命令。

启动后应看到：落地页首页（标题「企业智能客服系统」+ 四个功能入口）、右上角搜索与设置入口、右下角客服悬浮球。点击悬浮球展开客服窗口。

---

## 5. 三种接入模式

点击右上角**设置图标**打开设置抽屉，顶部「接入模式」三选一。

| 模式 | 上游 | 前置依赖 | 是否需填 Key | 是否支持流式 |
|---|---|---|---|---|
| **直连 API** | TokenHub（经 Vite 代理） | 无 | **必须填** | 支持 |
| **实训二代理** | `http://localhost:11434` | 需先启动 A1 服务 | 可留空 | 支持 |
| **实训四 RAG** | `http://127.0.0.1:14052` | 需先启动 A3 服务 | 不需要 | 不支持（服务端 session 维护多轮） |

### 5.1 直连 API 模式

- **API Base URL**：默认 `/tokenhub/v1`。
- **原理**：`/tokenhub` 由 Vite 开发代理转发到真实 TokenHub 域名，从而绕开浏览器 CORS。**因此直连模式不要填写公网地址**，否则会立刻遇到跨域错误。
- **API Key**：填 TokenHub 密钥，模型选 `hy3`。

#### ⚠️ 关键：TokenHub 接入地域

TokenHub 按地域提供两个独立域名，**密钥与地域绑定，用错地域直连必然 401**：

| 地域 | 域名 |
|---|---|
| 中国站（广州） | `https://tokenhub.tencentmaas.com` ← 本项目默认 |
| 国际站（新加坡） | `https://tokenhub-intl.tencentmaas.com` |

配置位置在 `vite.config.ts`：

```ts
proxy: {
  '/tokenhub': {
    target: 'https://tokenhub.tencentmaas.com',
    // ...
  },
}
```

**换地域只需改这一行 `target`**，改完必须**重启开发服务器**才生效。

**典型症状**：测试连接或发送消息返回
`401（The API Key does not exist or signature verification failed / API Key 不存在或签名校验失败）`
而 Key 确认无误时，第一件事就是核对地域。

### 5.2 实训二代理模式

- **实训二代理地址**：默认 `http://localhost:11434`。
- 必须先启动 A1 统一模型服务；打开设置时前端会自动调用代理的 `GET /v1/models` 拉取模型列表。
- 代理模式下**没有可用模型**通常意味着 A1 服务没起，或 A1 的 `.env` 里没有配置任何厂商密钥。
- 代理模式可不填 API Key（密钥由 A1 服务端持有）。
- 该模式的模型下拉列表**动态来自 A1 的 `/v1/models`**，只显示 A1 已配置密钥的模型。

### 5.3 实训四 RAG 模式

- **实训四 RAG 地址**：默认 `http://127.0.0.1:14052`。
- 仅需前端接口代码到位即可；真实问答、会话保持、引用来源与推理步骤的完整链路在 A3 阶段联调。
- 界面会显示 `RAG` 徽标，加载中文案为「知识检索中...」。
- 该模式**忽略**模型、流式、生成参数等设置项。

### 5.4 设置项一览

| 设置项 | 默认值 | 说明 |
|---|---|---|
| 接入模式 | `direct` | direct / proxy / rag |
| API Base URL | `/tokenhub/v1` | 仅直连模式 |
| 实训二代理地址 | `http://localhost:11434` | 仅代理模式 |
| 实训四 RAG 地址 | `http://127.0.0.1:14052` | 仅 RAG 模式 |
| Model | `hy3` | 直连模式固定 4 项：Hy3 / Hy3 Preview / Hy-Role / 自定义模型 |
| 自定义模型名 | 空 | 选择「自定义模型」后出现 |
| API Key | 空 | 仅直连模式必填；以密码框显示 |
| 流式响应 | 关闭 | 建议直连 hy3 首次调用先关闭（需启动推理服务，首包较慢） |
| Max Tokens | 4096 | 上限随所选模型变化（hy3 系列 8192，自定义 16384） |
| Temperature | 0.7 | 0 ~ 2 |
| Top-P | 0.7 | 0 ~ 1 |

**「测试连接」按钮行为**：

| 模式 | 实际请求 |
|---|---|
| 直连 | `GET /tokenhub/v1/models`（带 Bearer） |
| 代理 | 先试 `GET {proxyUrl}/health`，再试 `GET {proxyUrl}/v1/models` |
| RAG | `GET {ragUrl}/health` |

设置项保存后写入浏览器 `localStorage`（键名 `llm-setting-storage`），刷新页面不丢失。

---

## 6. 功能使用说明

### 6.1 首页与客服窗口

- **首页**：标题「企业智能客服系统」、介绍文案、「了解详情」弹窗、四个功能入口（智能问答 / 知识库检索 / 来源引用 / 人工转接）。
- **客服悬浮球**：点击展开客服窗；再次点击最小化。
- **客服窗**：标题栏显示当前会话名与在线状态，含「+ 新对话」、会话列表按钮、最小化、关闭。
- 新建会话时显示的欢迎语是「您好，请描述您想咨询的问题。」，并给出三个快捷入口。

### 6.2 快捷入口

会话为空时显示三个快捷按钮：

| 按钮 | 行为 |
|---|---|
| 咨询产品功能 | 自动发送预设问题 |
| 查询答案来源 | 自动发送预设问题 |
| 转接人工客服 | 本地直接回复转接说明，**不调用大模型** |

### 6.3 消息输入

- **Enter** 发送，**Shift + Enter** 换行。
- 支持添加**附件**（`.pdf` / `.doc` / `.docx` / `.txt`）与**图片**，添加后在输入框上方预览，可逐项移除。
- 生成中时发送按钮禁用，避免重复提交。
- 输入框高度在 24px ~ 144px 之间自适应。

### 6.4 消息展示

助手回复支持：

| 能力 | 说明 |
|---|---|
| Markdown 渲染 | 标题、列表、表格、引用、Emoji |
| 代码高亮 | `highlight.js`，代码块右上角可一键复制 |
| 深度思考 | 推理类模型的 `reasoning_content` 以可折叠面板呈现，默认收起 |
| 引用来源 | RAG 模式展示 `sources` 列表（文档名 + 片段预览），可折叠 |
| 推理步骤 | RAG 模式展示 `steps` 节点链路，可折叠 |
| 操作栏 | 重新生成（仅最后一条助手消息）、复制、喜欢、不喜欢、代码亮/暗主题切换 |
| 用量 | 显示 `tokens: N, speed: N tokens/s`（有用量数据时） |

RAG 步骤节点会翻译为中文标签：`transform_query`→查询改写、`retrieve`→向量检索、`grade_documents`→文档评分、`generate`→答案生成、`generate_conv_reply`→闲聊回复。

生成过程中气泡显示「内容生成中...」（RAG 模式为「知识检索中...」）；正文为空时不会渲染空气泡（流式深度思考阶段会出现这种情况，属正常）。

### 6.5 会话管理

- **新对话**：客服窗标题栏「+ 新对话」，或会话列表弹层中的「新对话」。
- **切换会话**：点击会话列表中的历史条目。
- **重命名**：会话条目上的编辑图标，最多 50 字。
- **删除**：会话条目上的删除图标，需二次确认；删空后会自动新建一个空会话。
- **自动命名**：首次发送消息时，自动用该消息前 20 个字符作为会话标题（未发送前标题为「日常问候」）。
- 会话与消息写入 `localStorage`（键名 `llm-chat-storage`），关闭浏览器后仍在。

### 6.6 重新生成

对**最后一条**助手回复点击「重新生成」：会丢弃最后一轮问答，用同样的用户问题重新请求一次。RAG 模式下会先调用 `POST {ragUrl}/chat/reset` 重置服务端会话。

### 6.7 全局提问对话框

- 打开方式：右上角**搜索**按钮，或快捷键 **Ctrl + K**（macOS 为 ⌘ + K）。
- 内置 4 条建议提示词，点击即填入输入框。
- 该对话框是一个独立的轻量问答面板，会话不写入主会话列表。
- 按 **Esc** 关闭。

### 6.8 快捷键速查

| 快捷键 | 作用 |
|---|---|
| `Enter` | 发送消息 |
| `Shift + Enter` | 输入换行 |
| `Ctrl / ⌘ + K` | 打开全局提问对话框 |
| `Esc` | 关闭提问对话框 / 详情弹窗 |

---

## 7. 请求链路说明

### 7.1 上游地址拼装规则

统一由 `src/utils/api.ts` 的 `appendOpenAIPath(base, resource)` 处理，**兼容 base 是否已含 `/v1`**：

| 连接模式 | base | 最终对话地址 |
|---|---|---|
| 直连 | `/tokenhub/v1` | `/tokenhub/v1/chat/completions` |
| 代理 | `http://localhost:11434` | `http://localhost:11434/v1/chat/completions` |
| RAG | `http://127.0.0.1:14052` | `http://127.0.0.1:14052/chat`（不带 `/v1`） |

**规则**：base 以 `/v1` 结尾只追加 `resource`；否则补 `/v1/resource`。这样可避免出现 `/v1/v1` 的错误路径。

### 7.2 一次发送的完整数据流

1. 输入框收集文本与附件，调用 `handleSend`；
2. 校验空输入与 loading 状态；
3. 写入 user 消息 → 写入 assistant 空占位 → 占位进入 `loading` → 全局 `isLoading = true`；
4. 取当前会话历史，**剔除刚插入的空助手占位**；
5. 按模式分流：
   - **LLM 模式**：`createChatCompletion(history)` 发 `POST /v1/chat/completions`
     - 非流式：一次性取出 `choices[0].message`，写入占位气泡
     - 流式：`handleStreamResponse` 持续解析 SSE，逐帧覆写占位气泡
   - **RAG 模式**：`createRagChat(question, sessionId)` 发 `POST /chat`，写入 `answer` / `sources` / `steps`，并保存返回的 `session_id` 供多轮复用；
6. 出错时把错误信息写入助手气泡（而非弹窗），`finally` 中结束 loading，可立即再次发送。

### 7.3 请求体字段

```json
{
  "model": "hy3",
  "messages": [{ "role": "user", "content": "..." }],
  "stream": false,
  "max_tokens": 4096,
  "temperature": 0.7,
  "top_p": 0.7
}
```

流式时额外附加 `"stream_options": { "include_usage": true }`，以获取 token 用量用于速度估算。

### 7.4 SSE 解析约定

与 A1 统一模型服务保持一致：

| 帧 | 处理 |
|---|---|
| `data: {json}` | 按行解析 |
| `choices[0].delta.content` | 累加到正文 |
| `choices[0].delta.reasoning_content` | 累加到思考过程 |
| `usage.completion_tokens` | 用于计算生成速度 |
| `data: [DONE]` | 结束标志 |

解析器使用**缓冲区**保存跨网络分包的不完整半行，只在遇到换行时解析，因此不会因数据块切分导致 JSON 解析失败或内容丢失。

---

## 8. 常见问题排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 页面只显示空白 / Console 报错 | 依赖未装或端口被占 | 重新 `npm install`；改 `vite.config.ts` 的 `server.port` |
| 直连 401（`401002`） | **地域不匹配**（最常见）；或 Key 有误/含空格 | 核对 `vite.config.ts` 的 `target` 与 Key 所属地域；改后**重启 dev server** |
| 直连报 CORS | 绕过了 Vite 代理，填了公网地址 | API Base URL 用回 `/tokenhub/v1` |
| 直连提示「需要填写 API Key」 | 直连模式未填 Key | 在设置面板填写 |
| 代理模式测试连接失败 / 模型列表为空 | A1 服务未启动，或 A1 未配置厂商密钥 | 先在 A1 目录 `npm start`，再刷新模型 |
| RAG 模式测试连接失败 | A3 服务未启动 | 启动 A3 或改用其他模式 |
| 流式没有打字机效果 | 未开启「流式响应」开关 | 在设置中打开 |
| 发送后无反应 | loading 未结束 / TODO 未实现 | 检查 Console 报错；确认 6 个 TODO 已补全 |
| 打字很久没有正文 | hy3 是推理模型，先输出思考内容 | 展开「深度思考」查看；或适当调大 Max Tokens |
| 修改设置不生效 | 设置写入了 localStorage，但页面未刷新 | 刷新页面或重新打开设置面板确认 |
| 气泡显示错误信息 | 请求失败被捕获后写入气泡（设计如此） | 按错误内容定位，修正后可立即重发 |

---

## 9. 自测验收清单

启动服务后按顺序逐项验证：

| 序号 | 用例 | 预期结果 |
|---|---|---|
| 1 | `npm run dev` | 3098 启动，首页与客服悬浮球可见，客服窗可展开 |
| 2 | 设置面板 | 三种模式可切换；直连填 Key + 选 hy3；「测试连接」至少一种模式成功 |
| 3 | 路径拼装 | Network 中代理模式 URL 为 `/v1/chat/completions`，直连为 `/tokenhub/v1/chat/completions`，**不出现 `/v1/v1`** |
| 4 | 非流式对话 | 关闭流式发送 → 2xx，气泡一次性显示完整回复，loading 结束 |
| 5 | 流式对话 | 开启流式发送 → 气泡增量更新，跨块内容不丢失，`[DONE]` 后结束 |
| 6 | 用量与速度 | 气泡底部显示 `tokens` 与 `speed` |
| 7 | 消息入库 | user 消息与助手占位按顺序进入当前会话；请求体 `messages` 不含空占位 |
| 8 | 状态恢复 | 制造一次失败 → 错误写入气泡、loading 结束、可再次发送 |
| 9 | RAG 代码检查 | `createRagChat` 为 `POST {ragUrl}/chat`，body 含 `question` 与 `session_id`，非 2xx 抛含状态码错误 |
| 10 | 构建 | `npm run build` 通过 |
| 11 | 敏感信息 | 源码、截图、工单中不含可用 API Key |

---

## 10. 构建与部署

```bash
npm run build      # 类型检查 + 产出 dist/
npm run preview    # 本地预览 dist
```

注意事项：

- 构建产物中**不含** Vite 开发代理，`/tokenhub` 代理仅开发环境生效。生产部署需由 Nginx 等反向代理配置同等转发规则，或改为直连网关地址。
- 当前构建产物为单包（约 1.3 MB，gzip 约 459 KB）。如需优化可做路由级代码分割。
- `dist/` 已列入 `.gitignore`，不会被提交。

---

## 11. 安全须知

1. **API Key 只在运行时通过设置面板填写**，不写入源码、不提交仓库；
2. Key 保存在浏览器 `localStorage` 中，属**明文存储**，请勿在公用电脑上填写；
3. 提交截图与实训证据前，Key 必须**打码**；
4. 直连模式必须走 `/tokenhub` 开发代理，**不要**为图方便改填公网地址（既触发 CORS，也容易在截图里泄露 Key）。

---

## 12. 已知限制

- **附件与图片仅作展示**：所选的图片/文件会显示在消息气泡中，但**不会**随请求发送给模型（请求体 `messages` 只包含 `role` 与 `content`）。真正接入多模态需扩展 `createChatCompletion` 与上游协议。
- **RAG 模式不支持流式**：多轮上下文由 A3 服务端 session 维护，前端只做单次请求/响应。
- **推理内容不落渲染管道**：直连或代理的流式路径会展示 `reasoning_content`，但 A1 代理的 AI SDK 分支（智谱 / Kimi）不产出该字段，此时「深度思考」面板不出现。
- **直连模型下拉是固定清单**：hy3 / hy3-preview / hunyuan-role-latest 三项 + 自定义模型。若要使用上游新增模型（如 `hy4-preview`），请选「自定义模型」手动填写。
- **无路由级懒加载**：当前为单包构建。
- **搜索对话框与主会话相互独立**：其中的问答不会写入会话历史。

---

## 附录：本阶段已通过的联调验证

以下为开发阶段实测通过的记录，可作为验收留痕参考：

| 用例 | 实测结果 |
|---|---|
| 开发服启动 | Vite 305ms ready，首页返回 200 |
| 代理模式基址 | `http://localhost:11434/v1/models` → 200，返回 hy3 列表 |
| 直连路径拼装 | `/tokenhub/v1/models` → 200，无 `/v1/v1` 重复 |
| 直连非流式 | 200（约 2.5s），返回「我是混元，是由腾讯开发的大模型。」 |
| 直连流式 | 200，`text/event-stream`，257 帧，首帧 `role=assistant`，含 `[DONE]`，`completion_tokens=436` |
| 错误处理 | 未知模型返回 404，前端可捕获为可读信息，服务不中断 |
| 生产构建 | `npm run build` 通过，无类型错误 |
