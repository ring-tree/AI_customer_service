// ---------------------------------------------------------------------------
// 消息格式化与上游响应解析
// 职责：造气泡数据；把 SSE / JSON 增量写成 updateCallback，供 HomePage 更新 UI
// 流式约定与实训二一致（data: / [DONE] / reasoning_content）
// ---------------------------------------------------------------------------
import { FileItem } from '../stores/chat'

export interface MessageData {
  id: number
  role: 'user' | 'assistant'
  content: string
  reasoning_content?: string
  files?: FileItem[]
  completion_tokens?: number
  speed?: number
  loading?: boolean
}

let messageIdCounter = 0

export const messageHandler = {
  // 已实现：构造一条标准消息对象，供 TODO-5 插入 user / assistant 占位气泡
  formatMessage(
    role: 'user' | 'assistant',
    content: string,
    reasoning_content: string = '',
    files: FileItem[] = []
  ): MessageData {
    return {
      id: Date.now() + messageIdCounter++,
      role,
      content,
      reasoning_content,
      files,
      completion_tokens: 0,
      speed: 0,
      loading: false,
    }
  },

  /**
   * TODO(学生)-4：解析 SSE 流式响应
   * 约定（与实训二一致）：
   * - 行格式：data: {json}
   * - 结束：data: [DONE]
   * - 文本增量：choices[0].delta.content
   * - 思考增量：choices[0].delta.reasoning_content
   * - usage.completion_tokens 用于估算速度
   * 每解析到有效增量，调用 updateCallback(text, think, tokens, speed)
   */
  async handleStreamResponse(
    response: Response,
    updateCallback: (content: string, reasoning_content: string, tokens: number, speed: string) => void
  ) {
    const reader = response.body?.getReader()
    if (!reader) return

    // TODO(学生)-4：实现 buffer 按行拆分 + processChunk + emitUpdate
    const decoder = new TextDecoder()
    let text = ''
    let think = ''
    let buffer = ''
    let completionTokens = 0
    const startTime = Date.now()

    // 每次增量都回写 UI：内容 / 思考 / token 数 / 生成速度
    const emitUpdate = () => {
      const elapsedSec = (Date.now() - startTime) / 1000
      const speed =
        completionTokens > 0 && elapsedSec > 0 ? (completionTokens / elapsedSec).toFixed(1) : '0'
      updateCallback(text, think, completionTokens, speed)
    }

    // 处理单个 data: 行（半行由 buffer 兜住，不完整的不解析）
    const processChunk = (rawLine: string) => {
      const trimmed = rawLine.trim()
      if (!trimmed || trimmed === 'data: [DONE]') return
      if (!trimmed.startsWith('data:')) return

      const data = JSON.parse(trimmed.slice(5).trim())
      const delta = data.choices?.[0]?.delta
      if (delta?.content) text += delta.content
      if (delta?.reasoning_content) think += delta.reasoning_content
      if (typeof data.usage?.completion_tokens === 'number') {
        completionTokens = data.usage.completion_tokens
      }
      emitUpdate()
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // 末尾可能是半行 JSON，留到下一轮再拼
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        try {
          processChunk(line)
        } catch {
          // 无法解析的行直接跳过，不中断流
        }
      }
    }

    // 流结束但最后一行没有换行符时，补处理一次
    if (buffer.trim()) {
      try {
        processChunk(buffer)
      } catch {
        // 忽略
      }
    }
  },

  // 已实现：非流式一次取出 message.content / reasoning_content
  handleNormalResponse(
    response: any,
    updateCallback: (content: string, reasoning_content: string, tokens: number, speed: string) => void
  ) {
    const msg = response.choices[0].message
    updateCallback(
      msg.content,
      msg.reasoning_content ?? '',
      response.usage?.completion_tokens ?? 0,
      String(response.speed ?? '0')
    )
  },

  // 已实现：按 isStream 分流到 TODO-4 或 handleNormalResponse；TODO-5 统一走这里
  async handleResponse(
    response: Response | any,
    isStream: boolean,
    updateCallback: (content: string, reasoning_content: string, tokens: number, speed: string) => void
  ) {
    if (isStream) {
      await this.handleStreamResponse(response, updateCallback)
    } else {
      this.handleNormalResponse(response, updateCallback)
    }
  },
}
