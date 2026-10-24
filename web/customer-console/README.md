# 客服工作台（customer-console）

企业智能客服的前端工作台（Vite 5 + React 18 + TS + Zustand）：落地页 + 客服悬浮窗，多会话管理、流式打字机、文本附件、引用来源与推理步骤渲染，三种接入模式单选切换。

## 模式与后端

| 模式 | 后端 | 说明 |
|------|------|------|
| 直连 API | TokenHub（经 Vite `/tokenhub` 代理） | 需在设置面板填 Key |
| 模型网关（**默认**） | `services/model-gateway`（:11434） | 服务端持钥，免配置 |
| 知识库 RAG | `services/knowledge-rag`（:14052） | 非流式，带引用来源与步骤 |

## 快速开始

```bash
npm install
npm run dev     # http://localhost:3098
```

构建与类型检查：`npm run build`

## 结构速览

- `src/views/HomePage.tsx`：发送闭环（本地转人工 / LLM 流式 / RAG 分支，附件内容拼入 prompt）
- `src/utils/api.ts`：按模式选上游、测连、拉模型、`fetchWithTimeout`（60/15s 分级超时）
- `src/utils/ragApi.ts`：知识服务契约封装（`/chat` 180s 超时）
- `src/utils/messageHandler.ts`：SSE 流式解析与打字机增量
- `src/components/`：设置面板、消息渲染（sources/steps 面板）、输入区（.txt/.md/.csv 附件）
- `src/stores/`：Zustand（设置与会话持久化到 localStorage）

使用指引详见 `LEARNING_GUIDE.md`（历史学习笔记，路径口径已按当前结构修正）。
