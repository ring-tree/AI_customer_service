# 实训二（学生版）：多 Provider OpenAI 兼容代理

请配合《实训二：后端 OpenAI 兼容代理 实验指导手册》完成 `src/index.js` 中所有 `TODO(学生)`。

## 快速开始

```bash
copy .env.example .env
# 至少填写 HUNYUAN_API_KEY（腾讯云 TokenHub）

npm install
npm start
```

默认端口：`11434`

## 挖空清单

| 标记 | 内容 |
|------|------|
| TODO-1a~1d | 注册 hunyuan / deepseek / zhipu / kimi |
| TODO-2 | models.json 缺失时的内置回退表 |
| TODO-3 | getProviderFetchConfig（混元/DeepSeek） |
| TODO-4 | generateResponse 非流式 |
| TODO-5 | streamOpenAICompatibleFetch 原生 SSE |
| TODO-6 | streamOpenAIResponse 总入口 |
| TODO-7 | handleOpenAIChatCompletions |
| TODO-8 | GET /v1/models |

完整答案见教师保留的「完整代码文件」，勿直接对照抄写；以手册步骤为准。
