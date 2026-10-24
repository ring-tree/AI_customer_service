// ---------------------------------------------------------------------------
// 会话与消息状态（Zustand + localStorage）
// 职责：多会话、增删消息、流式时 updateLastMessage 改最后一条助手气泡
// 供 HomePage TODO-5、ChatMessage / 侧栏会话列表使用
// ---------------------------------------------------------------------------
import { create } from 'zustand'
import { persist, devtools, createJSONStorage } from 'zustand/middleware'

export interface FileItem {
  name: string
  url: string
  type: 'image' | 'file'
  size: number
}

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

export interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  reasoning_content?: string
  files?: FileItem[]
  completion_tokens?: number
  speed?: number
  loading?: boolean
  timestamp?: string
  sources?: RagSource[]
  steps?: RagStep[]
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  ragSessionId?: string
}

interface ChatStore {
  conversations: Conversation[]
  currentConversationId: string
  isLoading: boolean
  createConversation: () => void
  switchConversation: (conversationId: string) => void
  addMessage: (message: Message) => void
  setIsLoading: (value: boolean) => void
  updateLastMessage: (
    content: string,
    reasoning_content?: string,
    completion_tokens?: number,
    speed?: number,
    loading?: boolean,
    extras?: {
      sources?: RagSource[]
      steps?: RagStep[]
    }
  ) => void
  setRagSessionId: (conversationId: string, sessionId: string | undefined) => void
  updateConversationTitle: (conversationId: string, newTitle: string) => void
  deleteConversation: (conversationId: string) => void
}

const createEmptyConversation = (): Conversation => ({
  id: Date.now().toString(),
  title: '日常问候',
  messages: [],
  createdAt: Date.now(),
})

// addMessage / updateLastMessage / setRagSessionId 是发送闭环最常用的三个动作
export const useChatStore = create<ChatStore>()(
  devtools(
    persist(
      (set, get) => ({
        conversations: [
          {
            id: '1',
            title: '日常问候',
            messages: [],
            createdAt: Date.now(),
          },
        ],
        currentConversationId: '1',
        isLoading: false,

        createConversation: () => {
          const newConversation = createEmptyConversation()
          set((state) => ({
            conversations: [newConversation, ...state.conversations],
            currentConversationId: newConversation.id,
          }))
        },

        switchConversation: (conversationId: string) => {
          set({ currentConversationId: conversationId })
        },

        addMessage: (message: Message) => {
          set((state) => ({
            conversations: state.conversations.map((conv) =>
              conv.id === state.currentConversationId
                ? {
                    ...conv,
                    messages: [
                      ...conv.messages,
                      {
                        ...message,
                        id: message.id || Date.now(),
                        timestamp: message.timestamp || new Date().toISOString(),
                      },
                    ],
                  }
                : conv
            ),
          }))
        },

        setIsLoading: (value: boolean) => {
          set({ isLoading: value })
        },

        updateLastMessage: (
          content: string,
          reasoning_content?: string,
          completion_tokens?: number,
          speed?: number,
          loading?: boolean,
          extras?: {
            sources?: RagSource[]
            steps?: RagStep[]
          }
        ) => {
          set((state) => ({
            conversations: state.conversations.map((conv) => {
              if (conv.id !== state.currentConversationId || conv.messages.length === 0) {
                return conv
              }
              const newMessages = [...conv.messages]
              const lastMessage = newMessages[newMessages.length - 1]
              newMessages[newMessages.length - 1] = {
                ...lastMessage,
                content,
                reasoning_content,
                completion_tokens,
                speed,
                loading,
                sources: extras?.sources,
                steps: extras?.steps,
              }
              return { ...conv, messages: newMessages }
            }),
          }))
        },

        setRagSessionId: (conversationId: string, sessionId: string | undefined) => {
          set((state) => ({
            conversations: state.conversations.map((conv) =>
              conv.id === conversationId ? { ...conv, ragSessionId: sessionId } : conv
            ),
          }))
        },

        updateConversationTitle: (conversationId: string, newTitle: string) => {
          set((state) => ({
            conversations: state.conversations.map((conv) =>
              conv.id === conversationId ? { ...conv, title: newTitle } : conv
            ),
          }))
        },

        deleteConversation: (conversationId: string) => {
          const state = get()
          let list = state.conversations.filter((conv) => conv.id !== conversationId)
          if (list.length === 0) {
            list = [createEmptyConversation()]
          }
          const stillCurrent = list.some((conv) => conv.id === state.currentConversationId)
          set({
            conversations: list,
            currentConversationId: stillCurrent ? state.currentConversationId : list[0].id,
          })
        },
      }),
      {
        name: 'llm-chat-storage',
        storage: createJSONStorage(() => localStorage),
      }
    ),
    { name: 'ChatStore' }
  )
)
