// ---------------------------------------------------------------------------
// 实训四 RAG HTTP 封装（课上可后做）
// 职责：/chat 问答、会话重置、健康检查；默认基址见 setting.DEFAULT_RAG_URL（:14052）
// ---------------------------------------------------------------------------
import {
  useSettingStore,
  DEFAULT_RAG_URL,
  type Settings,
} from '../stores/setting'

const normalizeBaseUrl = (url: string) => url.trim().replace(/\/+$/, '')

export const getRagBaseUrl = (settings: Settings) =>
  normalizeBaseUrl(settings.ragUrl || DEFAULT_RAG_URL)

export interface RagSource {
  source?: string
  metadata?: Record<string, unknown>
  preview?: string
}

export interface RagStep {
  node: string
  regeneration?: number
  retrieval?: number
}

export interface RagChatResponse {
  session_id: string
  answer: string
  sources: RagSource[]
  steps: RagStep[]
}

/**
 * TODO(学生)-6：调用实训四 POST /chat
 * body: { question, session_id }
 * 成功返回 { session_id, answer, sources, steps }
 * 供 TODO-5 的 RAG 分支调用；课上可先跳过，打通 LLM 对话后再做
 */
export const createRagChat = async (
  question: string,
  sessionId?: string | null
): Promise<RagChatResponse> => {
  const settings = useSettingStore.getState().settings
  const questionText = question.trim()

  if (!questionText) {
    throw new Error('问题不能为空')
  }

  // TODO(学生)-6
  const res = await fetch(`${getRagBaseUrl(settings)}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: questionText,
      session_id: sessionId || null,
    }),
  })

  if (!res.ok) {
    throw new Error(`RAG 请求错误：${res.status}`)
  }

  return (await res.json()) as RagChatResponse
}

// 已实现：重置 RAG 会话（重新生成前可调用）；测连给设置面板 / testConnection 用
export const resetRagSession = async (sessionId: string) => {
  const settings = useSettingStore.getState().settings
  const url = `${getRagBaseUrl(settings)}/chat/reset?session_id=${encodeURIComponent(sessionId)}`

  const res = await fetch(url, { method: 'POST' })

  if (!res.ok) {
    throw new Error(`重置 RAG 会话失败：${res.status}`)
  }
}

export const testRagConnection = async (settings: Settings) => {
  const res = await fetch(`${getRagBaseUrl(settings)}/health`)
  if (!res.ok) {
    throw new Error(`连接失败：${res.status}`)
  }
  return true
}
