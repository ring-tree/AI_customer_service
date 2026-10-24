# 模型网关（model-gateway）

多 Provider OpenAI 兼容 LLM 网关：对上提供 OpenAI 协议，对下适配腾讯混元（TokenHub）/ DeepSeek / 智谱 / Kimi。客服工作台的默认对话后端。

## 功能

- `GET /health`：健康检查（列出已注册 Provider 与可用模型）
- `GET /v1/models`：OpenAI list 格式模型列表（仅返回已配置 Key 的模型）
- `POST /v1/chat/completions`：非流式与 SSE 流式；透传 `reasoning_content`、`response_format`、`tools`、`tool_choice`
- `POST /v1/embeddings`：向量化透传（供 embedding 流量收敛到网关）

调用分流：混元 / DeepSeek 走原生 fetch（保留思考内容与 usage），智谱 / Kimi 走 AI SDK。模型别名表见 `models.json`（缺失时用内置回退表）。

## 快速开始

```bash
copy .env.example .env   # 至少填写 HUNYUAN_API_KEY（腾讯云 TokenHub 中国站）
npm install
npm start                # 默认端口 11434
```

健康检查：`curl http://localhost:11434/health`

## 验证记录

最近一轮接口回归 10/10（含 `response_format` 结构化输出、embeddings 1024 维、流式单 finish 帧），见根目录 `tests/evidence/deploy-2026-10-24/`。
