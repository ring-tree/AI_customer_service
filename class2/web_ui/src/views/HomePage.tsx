import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import SettingsPanel from '../components/SettingsPanel'
import SearchDialog from '../components/SearchDialog'
import ChatMessage from '../components/ChatMessage'
import ChatInput from '../components/ChatInput'
import PopupMenu from '../components/PopupMenu'
import { messageHandler } from '../utils/messageHandler'
import { createChatCompletion } from '../utils/api'
import { createRagChat, resetRagSession } from '../utils/ragApi'
import { useSettingStore } from '../stores/setting'
import { useChatStore, type FileItem, type Message } from '../stores/chat'
import logoImg from '@/assets/photo/logo.png'
import bgImg from '@/assets/photo/bg-img.png'
import chatIcon from '@/assets/photo/chat-icon.png'
import './HomePage.scss'

// ---------------------------------------------------------------------------
// 首页：落地页 UI + 客服聊天窗编排
// 核心业务在下方 handleSend（TODO-5）；其余多为窗口状态与展示
// ---------------------------------------------------------------------------

const WELCOME_TEXT = '您好，请描述您想咨询的问题。'
const HUMAN_TRANSFER_REPLY =
  '已为您登记转接人工客服需求。当前为演示模式，暂无真实坐席接入；工作时间（工作日 9:00–18:00）将有专员回电，请保持手机畅通。如需继续咨询，也可直接在下方输入问题。'

const WELCOME_MESSAGE: Message = {
  id: -1,
  role: 'assistant',
  content: WELCOME_TEXT,
}

const QUICK_ACTIONS = [
  { id: 'product', label: '咨询产品功能', prompt: '请介绍一下企业智能客服系统的主要产品功能。' },
  { id: 'source', label: '查询答案来源', prompt: '你们的回答依据来自哪里？如何查看答案来源？' },
  { id: 'human', label: '转接人工客服', prompt: '__HUMAN_TRANSFER__' },
] as const

const FEATURES = [
  {
    title: '智能问答',
    desc: '结合企业知识库准确作答',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />
        <circle cx="8.5" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="12" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    title: '知识库检索',
    desc: '快速定位相关内容',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <path d="M8 7h8M8 11h6" />
      </svg>
    ),
  },
  {
    title: '来源引用',
    desc: '答案依据清晰可查',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    ),
  },
  {
    title: '人工转接',
    desc: '复杂问题无缝衔接',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
        <path d="M21 16v2a2 2 0 0 1-2 2h-1" />
        <path d="M3 16v2a2 2 0 0 0 2 2h1" />
        <rect x="2" y="12" width="4" height="6" rx="1" />
        <rect x="18" y="12" width="4" height="6" rx="1" />
        <path d="M12 19v2M9 21h6" />
      </svg>
    ),
  },
] as const

const HomePage = () => {
  // ---- 状态：设置 / 会话 store + 聊天窗、设置面板等 UI 开关 ----
  const settings = useSettingStore((state) => state.settings)
  const isRagMode = settings.connectionMode === 'rag'

  const conversations = useChatStore((state) => state.conversations)
  const currentConversationId = useChatStore((state) => state.currentConversationId)
  const isLoading = useChatStore((state) => state.isLoading)
  const createConversation = useChatStore((state) => state.createConversation)
  const addMessage = useChatStore((state) => state.addMessage)
  const setIsLoading = useChatStore((state) => state.setIsLoading)
  const updateLastMessage = useChatStore((state) => state.updateLastMessage)
  const setRagSessionId = useChatStore((state) => state.setRagSessionId)
  const updateConversationTitle = useChatStore((state) => state.updateConversationTitle)

  const currentConversation = useMemo(
    () => conversations.find((conv) => conv.id === currentConversationId),
    [conversations, currentConversationId]
  )
  const currentMessages = useMemo(
    () => currentConversation?.messages || [],
    [currentConversation]
  )

  const [showSearchDialog, setShowSearchDialog] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMinimized, setChatMinimized] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const isEmptySession = currentMessages.length === 0
  const visibleMessages = isEmptySession ? [WELCOME_MESSAGE] : currentMessages
  const sessionTitle = currentConversation?.title || '在线客服'

  // ---- 副作用：保证至少有一个会话；Esc/Ctrl+K；消息区自动滚到底 ----
  useEffect(() => {
    if (conversations.length === 0) {
      createConversation()
    }
  }, [conversations.length, createConversation])

  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSearchDialog(false)
        setDetailOpen(false)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearchDialog(true)
      }
    }
    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [])

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [currentMessages, chatOpen, isEmptySession])

  // ---- 聊天窗开关 / 新会话 / 首条消息改标题（已实现） ----
  const openChat = () => {
    setChatOpen(true)
    setChatMinimized(false)
  }

  const closeChat = () => {
    setChatOpen(false)
    setChatMinimized(false)
  }

  const minimizeChat = () => {
    setChatOpen(false)
    setChatMinimized(true)
  }

  const handleNewChat = () => {
    createConversation()
  }

  const maybeRenameSession = (text: string) => {
    const state = useChatStore.getState()
    const conv = state.conversations.find((c) => c.id === state.currentConversationId)
    if (!conv) return
    if (conv.messages.length > 0) return
    if (conv.title && conv.title !== '日常问候') return
    const title = text.trim().slice(0, 20) || '新对话'
    updateConversationTitle(conv.id, title)
  }

  /**
   * TODO(学生)-5：发送闭环（企业前端编排层）
   * 流程：
   * 1. 校验空输入 / loading
   * 2. 人工转接快捷文案可直接本地回复（已给出示例分支，可保留）
   * 3. addMessage(user) → addMessage(assistant 占位) → updateLastMessage(..., loading=true)
   * 4. LLM 模式：取历史 messages（去掉最后一条空 assistant）→ createChatCompletion（TODO-3）
   *    → messageHandler.handleResponse（TODO-4）→ updateLastMessage 增量更新
   * 5. RAG 模式：createRagChat（TODO-6）→ 写入 answer/sources/steps + setRagSessionId
   * 6. catch 把错误写到助手气泡；finally setIsLoading(false)
   * 课上先打通 LLM；RAG 分支等 TODO-6 完成后再接
   */
  const handleSend = async (messageContent: { text: string; files: FileItem[] }) => {
    const text = messageContent.text.trim()
    if ((!text && messageContent.files.length === 0) || isLoading) return

    if (text === '__HUMAN_TRANSFER__' || text === '转接人工客服') {
      maybeRenameSession('转接人工客服')
      addMessage(messageHandler.formatMessage('user', '转接人工客服', '', messageContent.files))
      addMessage(messageHandler.formatMessage('assistant', HUMAN_TRANSFER_REPLY))
      return
    }

    try {
      // TODO(学生)-5：补全 LLM（必做）/ RAG（依赖 TODO-6）发送与流式更新
      // 1) 先改标题（此时会话还没有消息），再依次写入 user 消息与 assistant 占位气泡
      // F3：文本附件内容拼入用户消息（进入 LLM 历史与 RAG 问句）；标题仍用纯文本
      const fileCtx = messageContent.files
        .map((f) => (f.content ? `\n\n【附件 ${f.name}】\n${f.content}` : ''))
        .join('')
      const fullText = text + fileCtx
      maybeRenameSession(text)
      addMessage(messageHandler.formatMessage('user', fullText, '', messageContent.files))
      addMessage(messageHandler.formatMessage('assistant', ''))
      // 占位气泡进入 loading，流式增量会不断覆写它
      updateLastMessage('', '', 0, 0, true)
      setIsLoading(true)

      // 2) RAG 分支：多轮由服务端 session 维护，非流式
      if (isRagMode) {
        const state = useChatStore.getState()
        const conv = state.conversations.find((c) => c.id === state.currentConversationId)
        const result = await createRagChat(fullText, conv?.ragSessionId)

        setRagSessionId(state.currentConversationId, result.session_id)
        updateLastMessage(result.answer, '', 0, 0, false, {
          sources: result.sources,
          steps: result.steps,
        })
        return
      }

      // 3) LLM 分支：取当前会话历史，剔除刚插入的空助手占位
      const state = useChatStore.getState()
      const conv = state.conversations.find((c) => c.id === state.currentConversationId)
      const history = (conv?.messages || [])
        .slice(0, -1)
        .map(({ role, content }) => ({ role, content }))

      const res = await createChatCompletion(history)
      await messageHandler.handleResponse(res, settings.stream, (content, think, tokens, speed) => {
        updateLastMessage(content, think, tokens, Number(speed) || 0, false)
      })
    } catch (error) {
      console.error('Failed to send message:', error)
      const message = error instanceof Error ? error.message : '抱歉，发生了一些错误，请稍后重试。'
      // 若尚未插入助手气泡，这里可能无效；实现 TODO-5 时应先插入再请求
      updateLastMessage(message, '', 0, 0, false)
    } finally {
      setIsLoading(false)
    }
  }

  // ---- 已实现：删掉最后一轮后再次走 handleSend（RAG 会先 reset 会话） ----
  const handleRegenerate = async () => {
    if (currentMessages.length < 2 || isLoading) return

    const lastUserMessage = currentMessages[currentMessages.length - 2]
    if (!lastUserMessage || lastUserMessage.role !== 'user') return

    const truncated = currentMessages.slice(0, -2)

    if (isRagMode && currentConversation?.ragSessionId) {
      try {
        await resetRagSession(currentConversation.ragSessionId)
      } catch (error) {
        console.warn('Failed to reset RAG session:', error)
      }
    }

    useChatStore.setState((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === state.currentConversationId
          ? { ...conv, messages: truncated, ragSessionId: undefined }
          : conv
      ),
    }))

    await handleSend({
      text: lastUserMessage.content,
      files: lastUserMessage.files || [],
    })
  }

  const handleQuickAction = (action: (typeof QUICK_ACTIONS)[number]) => {
    if (!chatOpen) openChat()
    void handleSend({ text: action.prompt, files: [] })
  }

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).classList.contains('search-dialog-overlay')) {
      setShowSearchDialog(false)
    }
  }

  const formatTitle = (title: string) => (title.length > 10 ? `${title.slice(0, 10)}...` : title)

  // ---- 以下为页面 JSX（落地页 + 聊天窗），与挖空无关，可略读 ----
  return (
    <div
      className="home-page"
      style={{ ['--page-bg-image' as string]: `url(${bgImg})` }}
    >
      <header className="home-header">
        <div className="header-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <img src={logoImg} alt="企业智能客服" className="brand-logo" />
          <span className="brand-text">企业智能客服</span>
        </div>

        <div className="header-actions">
          <button type="button" className="search-trigger" onClick={() => setShowSearchDialog(true)}>
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span>搜索</span>
          </button>

          <button
            type="button"
            className="settings-trigger"
            onClick={() => setSettingsOpen(true)}
            aria-label="设置"
            title="设置"
          >
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="home-main">
        <section className="hero">
          <div className="hero-copy">
            <h1>企业智能客服系统</h1>
            <p>
              基于企业知识库与大模型能力，为客户提供准确、可追溯、可转人工的智能问答服务。
            </p>
            <button type="button" className="cta-btn" onClick={() => setDetailOpen(true)}>
              了解详情
            </button>
          </div>
        </section>

        <section className="feature-bar">
          {FEATURES.map((item) => (
            <div key={item.title} className="feature-item">
              <div className="feature-icon">{item.icon}</div>
              <div className="feature-text">
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
            </div>
          ))}
        </section>
      </main>

      {createPortal(
        <>
          {chatOpen && !chatMinimized && (
            <div className="chat-widget" role="dialog" aria-label="在线客服">
              <div className="chat-widget-header">
                <div className="chat-widget-header-main">
                  <div className="chat-widget-session">
                    <PopupMenu />
                    <button type="button" className="chat-widget-new" onClick={handleNewChat} title="新对话">
                      <span>+</span>
                      新对话
                    </button>
                    <div className="chat-widget-title-row">
                      <div className="chat-widget-title" title={sessionTitle}>
                        {formatTitle(sessionTitle)}
                      </div>
                      {isRagMode && <span className="chat-widget-badge">RAG</span>}
                    </div>
                  </div>
                  <div className="chat-widget-status">智能助手在线</div>
                </div>
                <div className="chat-widget-controls">
                  <button type="button" onClick={minimizeChat} aria-label="最小化" title="最小化">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                  <button type="button" onClick={closeChat} aria-label="关闭" title="关闭">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="chat-widget-body" ref={messagesContainerRef}>
                {visibleMessages.map((message, index) => (
                  <ChatMessage
                    key={`${currentConversationId}-${message.id}-${index}`}
                    message={message}
                    hideActions={isEmptySession}
                    isLastAssistantMessage={
                      !isEmptySession &&
                      index === visibleMessages.length - 1 &&
                      message.role === 'assistant'
                    }
                    onRegenerate={handleRegenerate}
                    isRagMode={isRagMode}
                  />
                ))}

                {isEmptySession && (
                  <div className="quick-actions">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className="quick-action"
                        onClick={() => handleQuickAction(action)}
                        disabled={isLoading}
                      >
                        <span>{action.label}</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="chat-widget-input">
                <ChatInput loading={isLoading} onSend={handleSend} />
              </div>
              <div className="chat-widget-footer">回答由企业知识库生成</div>
            </div>
          )}

          <button
            type="button"
            className={`fab-chat ${chatOpen && !chatMinimized ? 'is-open' : ''}`}
            onClick={() => {
              if (chatOpen && !chatMinimized) {
                minimizeChat()
              } else {
                openChat()
              }
            }}
            aria-label={chatOpen && !chatMinimized ? '收起客服' : '打开在线客服'}
          >
            <img src={chatIcon} alt="" />
          </button>
        </>,
        document.body,
      )}

      {detailOpen && (
        <div className="detail-overlay" onClick={() => setDetailOpen(false)}>
          <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="detail-header">
              <h2>关于企业智能客服系统</h2>
              <button type="button" className="detail-close" onClick={() => setDetailOpen(false)} aria-label="关闭">
                ×
              </button>
            </div>
            <div className="detail-body">
              <p>
                企业智能客服系统基于企业知识库与大模型能力，面向客户与业务人员提供智能问答服务。系统支持知识检索、答案来源引用，并在复杂场景下可演示转接人工流程。
              </p>
              <ul>
                <li>
                  <strong>智能问答：</strong>结合企业知识准确作答，支持多轮对话。
                </li>
                <li>
                  <strong>知识库检索：</strong>快速定位政策、产品与业务相关内容。
                </li>
                <li>
                  <strong>来源引用：</strong>关键回答可追溯至知识库文档片段。
                </li>
                <li>
                  <strong>人工转接：</strong>当前为演示占位，登记需求后提示后续联系方式。
                </li>
              </ul>
              <p className="detail-tip">
                可通过右上角设置切换「直连 API / 实训二代理 / 实训四 RAG」，客服窗将按当前模式发起对话。点击右下角悬浮球即可开始咨询。
              </p>
            </div>
            <div className="detail-footer">
              <button type="button" className="cta-btn" onClick={() => { setDetailOpen(false); openChat() }}>
                立即咨询
              </button>
            </div>
          </div>
        </div>
      )}

      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {showSearchDialog && (
        <div className="search-dialog-overlay fade-enter-active" onClick={handleOverlayClick}>
          <div className="search-dialog-container" onClick={(e) => e.stopPropagation()}>
            <SearchDialog />
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePage
