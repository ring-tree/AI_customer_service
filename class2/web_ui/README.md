# 实训三（学生版）：前端 LLM 聊天应用

请配合《实训三：前端 LLM 聊天应用 实验指导手册》完成下列 `TODO(学生)`。

## 挖空清单

| 标记 | 文件 | 内容 |
|------|------|------|
| TODO-1 | `utils/api.ts` | `appendOpenAIPath` |
| TODO-2 | `utils/api.ts` | `getServiceBaseUrl`（direct / proxy / rag） |
| TODO-3 | `utils/api.ts` | `createChatCompletion` |
| TODO-4 | `utils/messageHandler.ts` | SSE `handleStreamResponse` |
| TODO-5 | `views/HomePage.tsx` | `handleSend` 发送闭环（课上先打通 LLM） |
| TODO-6 | `utils/ragApi.ts` | `createRagChat`（对接实训四，可后做） |

UI、Zustand 持久化、设置面板、样式等已提供，课上以**打通对话**为主。

## 快速开始

```bash
cd 学生实验文件\3.llm-chat-hunyuan-实训三
npm install
npm run dev
```

默认端口：`3098`

## 联调依赖

| 模式 | 依赖服务 | 设置面板 |
|------|----------|----------|
| 直连 TokenHub | 无需本地后端（Vite 代理 `/tokenhub`） | 填写 API Key，模型 hy3 |
| 实训二代理 | `npm start` 于实训二（11434） | 连接模式选「代理」 |
| 实训四 RAG | `python server.py` 于实训四（14052） | 连接模式选「RAG」 |

完整答案见「完整代码文件/3.llm-chat-hunyuan-实训三」。
