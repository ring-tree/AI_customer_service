# 统一模型服务（02api-proxy）使用手册

> OpenAI 兼容的多厂商 LLM 中转网关
> 版本：1.0.4 ｜ 默认端口：11434 ｜ 更新日期：2026-09-29

---

## 1. 项目简介

本服务是业务应用与各家模型平台之间的一层**统一模型服务（模型中转网关）**：

- **对上**：暴露标准的 OpenAI Chat Completions 协议，业务侧只依赖一套接口；
- **对下**：适配腾讯混元 TokenHub、DeepSeek、智谱、Kimi 四个厂商；
- **内部**：集中管理密钥、屏蔽厂商差异、统一异常封装，并通过 `models.json` 做模型别名映射。

服务运行在 Node.js 原生 HTTP 之上，无 Web 框架依赖，启动即可用。它是 A2 客服工作台的模型调用入口。

---

## 2. 环境要求

| 项目 | 要求 | 说明 |
|---|---|---|
| Node.js | 18.x / 20.x LTS（推荐 20） | 需支持原生 `fetch` 与 ESM |
| npm | ≥ 9 | 随 Node 安装 |
| 网络 | 可访问所选厂商 API | 混元需可访问 TokenHub 对应地域域名 |
| 端口 | 默认 `11434` | 可通过 `PORT` 修改 |

依赖（由 `package.json` 声明，无需手工安装单个包）：

| 包 | 版本 | 用途 |
|---|---|---|
| `ai` | ^4.3.16 | Vercel AI SDK，`generateText` / `streamText` |
| `@ai-sdk/openai` | ^1.3.22 | OpenAI 兼容 Provider 工厂 |
| `dotenv` | ^16.4.7 | 加载 `.env` |

---

## 3. 目录结构

```
02api-proxy/
├── src/
│   ├── index.js          # 服务主文件：Provider 注册、路由、非流式/流式对话
│   └── console.js        # 彩色日志封装（带时间戳），无需修改
├── models.json           # 对外模型名 → provider + 上游模型 ID 映射表
├── .env.example          # 环境变量模板（提交仓库）
├── .env                  # 本地实际配置（含密钥，已被 .gitignore 忽略）
├── package.json          # ESM + start 脚本
├── package-lock.json     # 依赖锁定
├── Dockerfile            # 容器化构建
└── README.md
```

---

## 4. 快速开始

### 4.1 安装依赖

在**包含 `package.json` 的项目根目录**执行：

```bash
npm install
```

### 4.2 配置环境变量

```bash
# Windows PowerShell
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

编辑 `.env`，**至少**填写混元 TokenHub 的 Key：

```env
HUNYUAN_API_KEY=sk-你的TokenHub密钥
```

> 密钥只保存在本机 `.env` 中，禁止写入源码、前端代码或提交到仓库。

### 4.3 启动服务

```bash
npm start        # 等价于 node ./src/index.js
npm run dev      # 开发热重载（node --watch）
```

正常启动输出示例：

```
✅ Loaded models from ...\02api-proxy\models.json
🚀 LLM Proxy running on http://localhost:11434
🔑 Providers: hunyuan
📋 Available models: hy3, hy3-preview, hunyuan-role-latest
📡 POST http://localhost:11434/v1/chat/completions
📡 GET  http://localhost:11434/v1/models
📡 GET  http://localhost:11434/health
```

停止服务：`Ctrl + C`（已实现 `SIGINT` / `SIGTERM` 优雅退出）。

> ⚠️ 若一个密钥都没配置，服务会打印 `No API keys found` 并**以退出码 1 退出**，这是刻意的保护机制，避免服务"带病启动"。

---

## 5. 配置详解

### 5.1 环境变量一览

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `HUNYUAN_API_KEY` | 是* | 空 | 混元 TokenHub 密钥 |
| `HUNYUAN_API_URL` | 否 | `https://tokenhub-intl.tencentmaas.com/v1` | 混元接入地址，**注意地域** |
| `TOKENHUB_API_KEY` | 否 | 空 | 混元 Key 的备用变量名 |
| `TOKENHUB_API_URL` | 否 | 同 `HUNYUAN_API_URL` | 混元地址的备用变量名 |
| `DEEPSEEK_API_KEY` | 否 | 空 | DeepSeek 密钥 |
| `DEEPSEEK_API_URL` | 否 | `https://api.deepseek.com/v1` | DeepSeek 地址 |
| `ZHIPU_API_KEY` | 否 | 空 | 智谱密钥 |
| `ZHIPU_API_URL` | 否 | `https://open.bigmodel.cn/api/paas/v4` | 智谱地址 |
| `KIMI_API_KEY` | 否 | 空 | Kimi 密钥 |
| `KIMI_API_URL` | 否 | `https://api.moonshot.cn/v1` | Kimi 地址 |
| `PORT` | 否 | `11434` | 监听端口 |
| `NODE_ENV` | 否 | — | 设为 `production` 时**关闭日志时间戳与 debug 日志** |

\* 四个厂商至少配置一个，否则服务启动即退出。混元是课程必通项。

### 5.2 ⚠️ 关键：TokenHub 接入地域（最容易踩的坑）

腾讯云 TokenHub 按**接入地域**提供两个独立域名，密钥与地域绑定，**用错地域会返回 401**：

| 地域 | Base URL |
|---|---|
| 中国站（广州） | `https://tokenhub.tencentmaas.com/v1` |
| 国际站（新加坡） | `https://tokenhub-intl.tencentmaas.com/v1` |

代码中**默认走国际站**。如果你的 Key 属于中国站，必须显式配置：

```env
HUNYUAN_API_URL=https://tokenhub.tencentmaas.com/v1
```

**典型症状**：

```json
{"error":{"message":"hunyuan HTTP 401: {\"error\":{\"type\":\"authentication_error\",
\"code\":\"401002\",\"message\":\"The API Key does not exist or signature verification failed...\"}}"}}
```

出现 `401002 authentication_error` 而 Key 确认无误时，**第一件事就是核对地域**。

### 5.3 `models.json` 模型别名表

服务对外暴露的模型名可以与厂商真实模型 ID 不同，映射关系全部集中在 `models.json`：

```json
{
    "hy3":                   { "provider": "hunyuan",  "model": "hy3" },
    "hy3-preview":           { "provider": "hunyuan",  "model": "hy3-preview" },
    "hunyuan-role-latest":   { "provider": "hunyuan",  "model": "hunyuan-role-latest" },
    "deepseek-chat":         { "provider": "deepseek", "model": "deepseek-chat" },
    "deepseek-reasoner":     { "provider": "deepseek", "model": "deepseek-reasoner" },
    "glm-4-flash":           { "provider": "zhipu",    "model": "glm-4-flash" },
    "kimi-k2":               { "provider": "kimi",     "model": "moonshot-v1-8k" }
}
```

要点：

- 左侧键 = **请求 `model` 字段要填的值**；右侧 `model` = 转发给上游的真实模型 ID。
- 例：`kimi-k2` → 上游 `moonshot-v1-8k`，这就是别名映射的价值——换模型只改这一处。
- 文件**缺失时**服务会自动启用内置回退表（内容与上表一致）。
- 文件**存在但 JSON 语法错误**时，服务报错并以退出码 1 退出。
- 修改 `models.json` 后**必须重启服务**才生效。

---

## 6. 接口文档

### 6.1 接口总览

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/` | 探活文案（纯文本） |
| `GET` | `/health` | 健康检查，返回已启用 providers 与可用 models |
| `GET` | `/v1/models` | 当前可调用的模型列表（OpenAI list 格式） |
| `POST` | `/v1/chat/completions` | 对话补全：JSON（非流式）或 SSE（流式） |
| `OPTIONS` | `*` | CORS 预检 |

所有响应均带 CORS 头：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

### 6.2 `GET /`

探活接口，返回纯文本。

**响应** `200` `text/plain`

```
Multi-provider LLM proxy (OpenAI-compatible).
```

---

### 6.3 `GET /health`

健康检查，用于确认服务状态、已启用厂商与可用模型。

**响应** `200` `application/json`

```json
{
    "status": "ok",
    "service": "ollama-api-proxy",
    "port": 11434,
    "providers": ["hunyuan"],
    "models": ["hy3", "hy3-preview", "hunyuan-role-latest"]
}
```

> `models` 只包含**对应 Provider 已配置密钥**的模型。

---

### 6.4 `GET /v1/models`

返回当前环境**真正可调用**的模型列表，用于前端渲染模型下拉框。

**响应** `200` `application/json`

```json
{
    "object": "list",
    "data": [
        { "id": "hy3", "object": "model", "created": 1790678576, "owned_by": "hunyuan" },
        { "id": "hy3-preview", "object": "model", "created": 1790678576, "owned_by": "hunyuan" },
        { "id": "hunyuan-role-latest", "object": "model", "created": 1790678576, "owned_by": "hunyuan" }
    ]
}
```

> 列表会按 `providers` 过滤：只配置了混元 Key 时，`glm-4-flash`、`kimi-k2`、`deepseek-chat` 不会出现在结果中，避免前端展示无法调用的选项。

---

### 6.5 `POST /v1/chat/completions`

#### 请求参数

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `model` | string | 是 | 对外模型名，取自 `models.json` 的键，如 `hy3`、`deepseek-chat`、`glm-4-flash`、`kimi-k2` |
| `messages` | array | 是 | `[{role, content}, ...]`，`role` 支持 `system` / `user` / `assistant` |
| `stream` | boolean | 否 | `true` = SSE 流式；`false`/省略 = JSON 非流式 |
| `temperature` | number | 否 | 采样温度（`deepseek-reasoner` 会被自动忽略） |
| `top_p` | number | 否 | 核采样（`deepseek-reasoner` 会被自动忽略） |
| `max_tokens` | number | 否 | 最大生成长度 |
| `stream_options` | object | 否 | 仅流式有效，默认 `{"include_usage": true}` |

> 建议 `content` 传字符串。`role` 只认 `assistant` / `system`，其余一律按 `user` 处理；空白字符串消息会被自动丢弃。

---

#### 6.5.1 非流式对话（`stream: false`）

**请求**

```http
POST http://localhost:11434/v1/chat/completions
Content-Type: application/json

{
    "model": "hy3",
    "messages": [
        { "role": "system", "content": "你是简洁助手。" },
        { "role": "user", "content": "用一句话介绍你自己" }
    ],
    "stream": false,
    "temperature": 0.7,
    "max_tokens": 512
}
```

**响应** `200` `application/json`

```json
{
    "id": "chatcmpl-mumk5ocit03ld5",
    "object": "chat.completion",
    "created": 1790679193,
    "model": "hy3",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "我是混元，是由腾讯开发的大模型。",
                "reasoning_content": "用户要求用一句话介绍我自己。..."
            },
            "finish_reason": "stop"
        }
    ],
    "usage": { "prompt_tokens": 16, "completion_tokens": 173, "total_tokens": 189 }
}
```

> **`reasoning_content`**：推理类模型（混元 hy3、`deepseek-reasoner`）会额外返回该字段，内含模型的思考过程。非推理模型不返回此字段。前端应把它与 `content` 分开渲染。

---

#### 6.5.2 流式对话（`stream: true`）

**请求**

```json
{
    "model": "hy3",
    "messages": [{ "role": "user", "content": "写一首四句短诗" }],
    "stream": true
}
```

**响应头**

```
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache
Connection: keep-alive
```

**响应体格式**：每个数据帧为 `data: {JSON}\n\n`，以 `data: [DONE]\n\n` 结束。

帧类型一览：

| 帧 | 结构 | 说明 |
|---|---|---|
| 首帧 | `delta: {"role":"assistant"}` | 固定第一帧，标记角色 |
| 内容帧 | `delta: {"content":"..."}` | 正式回答的增量片段 |
| 推理帧 | `delta: {"reasoning_content":"..."}` | 推理模型的思考过程增量 |
| 用量帧 | `choices: []`, `usage: {...}` | 流结束时返回 token 统计 |
| 结束帧 | `delta: {}`, `finish_reason: "stop"` | 正常结束标记 |
| 终止 | `data: [DONE]` | 必须以此判断回答结束 |

**实际报文示例（首 3 帧）**

```
data: {"id":"chatcmpl-mumk5ocit03ld5","object":"chat.completion.chunk","created":1790679193,"model":"hy3","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-mumk5ocit03ld5","object":"chat.completion.chunk","created":1790679193,"model":"hy3","choices":[{"index":0,"delta":{"reasoning_content":"用户"},"finish_reason":null}]}

data: {"id":"chatcmpl-mumk5ocit03ld5","object":"chat.completion.chunk","created":1790679193,"model":"hy3","choices":[{"index":0,"delta":{"reasoning_content":"要求"},"finish_reason":null}]}
```

**实际报文示例（末 3 帧）**

```
data: {"id":"chatcmpl-mumk5ocit03ld5","object":"chat.completion.chunk","created":1790679193,"model":"hy3","choices":[],"usage":{"prompt_tokens":18,"completion_tokens":722,"total_tokens":740}}

data: {"id":"chatcmpl-mumk5ocit03ld5","object":"chat.completion.chunk","created":1790679193,"model":"hy3","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

> **流式异常处理**：若上游调用失败，服务会在已建立的 SSE 流中推送一个带 `error` 字段的 chunk，随后补发 `data: [DONE]` 并关闭连接，客户端不会一直等待。异常帧形如：
> ```json
> {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"error":{"message":"hunyuan HTTP 401: ..."}}
> ```

> **帧粒度提示**：上游（尤其混元）按**字符级**推送，一次请求可能产生数百个内容帧。前端打字机效果直接逐帧渲染即可，无需额外节流。

---

### 6.6 `OPTIONS *`

CORS 预检，返回 `200` 且携带完整跨域响应头，空响应体。

---

### 6.7 错误响应规范

所有错误统一为 OpenAI 风格结构：

```json
{
    "error": {
        "message": "错误描述",
        "type": "invalid_request_error",
        "code": null
    }
}
```

| HTTP | `type` | 触发场景 | `message` 示例 |
|---|---|---|---|
| `400` | `invalid_request_error` | 缺少必填参数 | `Missing required parameter: model` |
| `404` | `invalid_request_error` | 路由不存在 | `Not found` |
| `404` | `server_error` | 模型未在 `models.json` 中定义 | `Model gpt-4o not supported` |
| `404` | `server_error` | 模型所属厂商未配置密钥 | `Provider zhipu not available` |
| `500` | `server_error` | 上游返回非 2xx（含 401 鉴权失败） | `hunyuan HTTP 401: {...}` |
| `500` | `server_error` | 请求体非合法 JSON / 其他内部异常 | `Unexpected token ...` |

> 关键设计：**上游错误被完整封装为统一结构返回，服务自身绝不崩溃**。上游原始报文会拼在 `message` 中，便于排查。

---

## 7. 调用链路说明（双轨适配）

服务对四个厂商采用"特例 + 惯例"的双轨策略：

| 厂商 | 调用方式 | 原因 |
|---|---|---|
| 混元 TokenHub | **原生 `fetch`** | 需要透传 `reasoning_content` 与 `usage` |
| DeepSeek | **原生 `fetch`** | 同上，且便于处理 `deepseek-reasoner` 参数限制 |
| 智谱 | Vercel AI SDK | 标准 OpenAI 兼容，SDK 直接覆盖 |
| Kimi | Vercel AI SDK | 同上 |

分流开关为 `getProviderFetchConfig(providerName)`：混元 / DeepSeek 返回 `{ apiKey, baseURL }`，其余返回 `null`。

**一次请求的完整流程**：

1. 接收请求，解析方法与路径；
2. `OPTIONS` 直接返回 CORS 响应头；
3. 匹配路由表，未匹配返回统一 404；
4. 解析请求体，校验 `model` 与 `messages`；
5. `validateModel` 查询 `models.json`，得到 provider 与上游模型 ID，并确认该 provider 已启用；
6. 按 `stream` 分流；
7. 组装上游请求体（`buildOpenAIChatBody`），发起调用；
8. 归一化上游结果为统一结构后返回；流式则逐帧推送并以 `data: [DONE]` 收尾；
9. 全程异常统一封装为 OpenAI 错误结构。

---

## 8. 客户端调用示例

### 8.1 curl（Windows 下请使用 `curl.exe`）

```bash
# 健康检查
curl.exe http://localhost:11434/health

# 模型列表
curl.exe http://localhost:11434/v1/models

# 非流式对话
curl.exe -X POST http://localhost:11434/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"hy3\",\"messages\":[{\"role\":\"user\",\"content\":\"你好\"}],\"stream\":false}"

# 流式对话（-N 关闭缓冲，实时看到 SSE 帧）
curl.exe -N -X POST http://localhost:11434/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"hy3\",\"messages\":[{\"role\":\"user\",\"content\":\"写一首四句短诗\"}],\"stream\":true}"
```

### 8.2 JavaScript（流式解析）

```js
const res = await fetch('http://localhost:11434/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'hy3',
    messages: [{ role: 'user', content: '写一首四句短诗' }],
    stream: true,
  }),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let answer = '';
let thinking = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (payload === '[DONE]') break;

    const chunk = JSON.parse(payload);
    const delta = chunk.choices?.[0]?.delta || {};
    if (delta.reasoning_content) thinking += delta.reasoning_content;   // 思考过程
    if (delta.content) answer += delta.content;                        // 正式回答
  }
}

console.log('思考:', thinking);
console.log('回答:', answer);
```

---

## 9. 日志与调试

| 日志前缀 | 含义 |
|---|---|
| `🚀 / 🔑 / 📋 / 📡` | 启动信息：端口、已启用厂商、可用模型、接口地址 |
| `ℹ️  GET /health` | 每次请求命中的路由（`方法 + 路径`） |
| `🐛 [getBody] ...` | 请求体长度与解析出的字段（仅非 production 环境） |
| `🐛 [prepareMessages] ...` | 消息规整前后的条数 |
| `❌ [OpenAI /v1/chat/completions] error: ...` | 对话接口捕获到的异常（含上游原始报文） |

- 日志带本地时间戳；`NODE_ENV=production` 时时间戳与 `🐛 debug` 日志自动关闭。
- 日志输出带颜色（仅 TTY 环境），重定向到文件时自动降级为纯文本。
- 调试日志会打印请求体字段名与消息条数，**不含完整用户输入内容**。

---

## 10. 常见问题排查

| 现象 | 根因 | 解决方案 |
|---|---|---|
| 启动即打印 `No API keys found` 并退出 | 未配置任何厂商密钥 | 在 `.env` 填写 `HUNYUAN_API_KEY` 等 |
| 上游 `401 / 401002 authentication_error` | **接入地域不匹配**（最常见）；或 Key 有误、含多余空格 | 中国站 Key 需设 `HUNYUAN_API_URL=https://tokenhub.tencentmaas.com/v1` |
| `Model xxx not supported`（404） | `models.json` 中没有该模型键 | 核对请求 `model` 字段，或补充映射 |
| `Provider xxx not available`（404） | 该厂商未配置密钥 | 补 Key，或改用已启用的模型 |
| 修改 `.env` 后不生效 | 进程未重启 | `Ctrl + C` 后重新 `npm start` |
| 启动报 `EADDRINUSE` | 端口 11434 被占用 | 改 `.env` 中的 `PORT`，或结束旧进程 |
| 流式响应迟迟没有 `[DONE]` | 上游中断或客户端未按帧解析 | 检查是否有 `error` chunk；确认按 `\n\n` 分帧 |
| 返回中文乱码 | 客户端未按 UTF-8 解码 | 响应已声明 `charset=utf-8`，请确保客户端按 UTF-8 解析 |
| 流式首帧没有 `role` | 客户端跳过了首帧 | 首帧固定为 `delta:{"role":"assistant"}`，应保留 |
| `deepseek-reasoner` 报参数错误 | 推理模型不接受采样参数 | 服务已自动忽略 `temperature` / `top_p`，无需改客户端 |

---

## 11. 自测验收清单

启动服务后按顺序逐项验证：

| 序号 | 用例 | 预期结果 |
|---|---|---|
| 1 | `npm start` | 正常监听端口，打印 Providers 与可用模型，无异常退出 |
| 2 | `GET /` | `200`，返回探活文案 |
| 3 | `GET /health` | `200`，`providers` 与 `models` 正确 |
| 4 | `GET /foo` | `404`，OpenAI 错误结构 |
| 5 | `OPTIONS /v1/chat/completions` | `200`，携带完整 CORS 头 |
| 6 | `GET /v1/models` | `200`，仅含已配置密钥的模型 |
| 7 | 非流式 `hy3` | `200`，`choices[0].message.content` 有内容 |
| 8 | 流式 `hy3` | `Content-Type: text/event-stream`，多条 `data:`，结尾 `finish_reason: stop` + `data: [DONE]` |
| 9 | 缺少 `model` / `messages` | `400 invalid_request_error` |
| 10 | 未知模型 / 未配置厂商 | `404`，message 分别为 `not supported` / `not available` |
| 11 | 错误 Key | 上游 401 被封装为统一错误，服务不崩溃 |

---

## 12. 容器化部署

`Dockerfile` 已就绪（基于 `node:20-alpine`）：

```bash
docker build -t api-proxy .

# 密钥通过环境变量注入（.env 不会被 COPY 进镜像）
docker run -d --name api-proxy -p 11434:11434 \
  -e HUNYUAN_API_KEY=sk-你的密钥 \
  -e HUNYUAN_API_URL=https://tokenhub.tencentmaas.com/v1 \
  api-proxy
```

> 镜像内只安装了生产依赖（`npm install --omit=dev`），并通过 `EXPOSE 11434` 暴露端口。

---

## 13. 安全须知

1. 密钥**只写入 `.env`**，禁止写入源码、前端代码或提交仓库；
2. `.env` 已列入 `.gitignore`，仓库中只保留 `.env.example` 模板；
3. 提交截图与实训证据前，必须对密钥内容**打码**；
4. 修改 `.env` 后必须**重启服务**配置才生效；
5. 调试日志不得长期保留用户完整输入内容。

---

## 14. 已知限制

当前为教学实现，以下生产级能力**尚未实现**：

- 网关自身鉴权（当前无任何客户端身份校验，仅监听本机时安全）
- 限流与配额控制
- 调用日志落库、成本统计与审计
- 多轮会话上下文管理（`messages` 由客户端完整传入）
- 智能路由 / 故障转移（模型与厂商需显式指定）
- 流式 AI SDK 分支（智谱 / Kimi）只输出 `content`，不输出 `reasoning_content`
