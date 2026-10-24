import { useState, useEffect, useRef } from 'react'
import { Message } from '../stores/chat'
import { renderMarkdown } from '../utils/markdown'
import darkIcon from '@/assets/photo/暗黑模式.png'
import lightIcon from '@/assets/photo/明亮模式.png'
import './ChatMessage.scss'

// ---------------------------------------------------------------------------
// 单条消息展示：Markdown、思考过程、RAG sources/steps；「重新生成」回调给 HomePage
// ---------------------------------------------------------------------------

interface ChatMessageProps {
  message: Message
  isLastAssistantMessage: boolean
  onRegenerate: () => void
  isRagMode?: boolean
  /** 为 true 时不展示复制/赞踩等操作栏（如客服欢迎语） */
  hideActions?: boolean
}

const STEP_LABELS: Record<string, string> = {
  transform_query: '查询改写',
  retrieve: '向量检索',
  grade_documents: '文档评分',
  generate: '答案生成',
  generate_conv_reply: '闲聊回复',
}

const formatStepLabel = (node: string) => STEP_LABELS[node] || node

const RagIcon = ({ name }: { name: 'sources' | 'steps' | 'doc' }) => {
  if (name === 'doc') {
    return (
      <svg className="reasoning-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    )
  }

  if (name === 'sources') {
    return (
      <svg className="reasoning-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    )
  }

  return (
    <svg className="reasoning-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4l1.4-1.4M17 7l1.4-1.4" />
    </svg>
  )
}

const ToggleChevron = ({ expanded }: { expanded: boolean }) => (
  <svg
    className={`toggle-icon ${expanded ? 'is-expanded' : ''}`}
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
)

const ChatMessage = ({
  message,
  isLastAssistantMessage,
  onRegenerate,
  isRagMode = false,
  hideActions = false,
}: ChatMessageProps) => {
  const [isLiked, setIsLiked] = useState(false)
  const [isDisliked, setIsDisliked] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(false)
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(false)
  const [isStepsExpanded, setIsStepsExpanded] = useState(false)
  const [isCodeDarkTheme, setIsCodeDarkTheme] = useState(false)
  const messageRef = useRef<HTMLDivElement>(null)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2500)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  const handleLike = () => {
    if (isDisliked) setIsDisliked(false)
    setIsLiked(!isLiked)
  }

  const handleDislike = () => {
    if (isLiked) setIsLiked(false)
    setIsDisliked(!isDisliked)
  }

  const handleCodeCopy = async (event: MouseEvent) => {
    const target = event.target as HTMLElement
    const codeBlock = target.closest('.code-block')
    if (!codeBlock) return

    const code = codeBlock.querySelector('code')?.textContent
    if (!code) return

    try {
      await navigator.clipboard.writeText(code)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  const handleThemeToggle = () => {
    setIsCodeDarkTheme(!isCodeDarkTheme)
  }

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.getAttribute('data-action') === 'copy') {
        handleCodeCopy(e)
      }
    }

    document.addEventListener('click', handleClick)
    return () => {
      document.removeEventListener('click', handleClick)
    }
  }, [])

  const renderedContent = renderMarkdown(message.content)
  const renderedReasoning = message.reasoning_content ? renderMarkdown(message.reasoning_content) : ''

  return (
    <div className={`message-item ${message.role === 'user' ? 'is-mine' : ''}`} ref={messageRef}>
      <div className="content">
        {message.files && message.files.length > 0 && (
          <div className="files-container">
            {message.files.map((file) => (
              <div key={file.url} className="file-item">
                {file.type === 'image' ? (
                  <div className="image-preview">
                    <img src={file.url} alt={file.name} />
                  </div>
                ) : (
                  <div className="file-preview">
                    <span className="file-icon">📄</span>
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{(file.size / 1024).toFixed(1)}KB</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {message.loading && message.role === 'assistant' && (
          <div className="thinking-text">
            <img src="/src/assets/photo/加载中.png" alt="loading" className="loading-icon" />
            <span>{isRagMode ? '知识检索中...' : '内容生成中...'}</span>
          </div>
        )}

        {message.reasoning_content && (
          <>
            <div className="reasoning-toggle" onClick={() => setIsReasoningExpanded(!isReasoningExpanded)}>
              <svg
                className="reasoning-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3c-1.2 0-2.4.6-3 1.7A4 4 0 0 0 5 9c0 2.2 1.8 4.3 4 5.2V18a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-3.8c2.2-.9 4-3 4-5.2a4 4 0 0 0-4-4.3 3.5 3.5 0 0 0-3-1.7Z" />
                <path d="M9 18v1a3 3 0 0 0 6 0v-1" />
              </svg>
              <span>深度思考</span>
              <svg
                className={`toggle-icon ${isReasoningExpanded ? 'is-expanded' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
            {isReasoningExpanded && (
              <div className="reasoning markdown-body" dangerouslySetInnerHTML={{ __html: renderedReasoning }} />
            )}
          </>
        )}
        {/*具体的对话内容：无正文时不渲染空气泡（流式深度思考阶段常见）*/}
        {message.content.trim().length > 0 && (
          <div
            className={`bubble markdown-body ${isCodeDarkTheme ? 'code-dark-theme' : ''}`}
            dangerouslySetInnerHTML={{ __html: renderedContent }}
          />
        )}

        {(message.sources?.length || message.steps?.length) ? (
          <div className="rag-meta-panel">
            {message.sources && message.sources.length > 0 && (
              <>
                <button
                  type="button"
                  className="reasoning-toggle rag-toggle"
                  onClick={() => setIsSourcesExpanded(!isSourcesExpanded)}
                >
                  <RagIcon name="sources" />
                  <span>引用来源</span>
                  <span className="rag-meta-count">{message.sources.length}</span>
                  <ToggleChevron expanded={isSourcesExpanded} />
                </button>
                {isSourcesExpanded && (
                  <div className="rag-meta-body">
                    {message.sources.map((source, index) => (
                      <div key={`${source.source || 'source'}-${index}`} className="rag-source-item">
                        <div className="rag-source-head">
                          <RagIcon name="doc" />
                          <span className="rag-source-name">{source.source || `文档 ${index + 1}`}</span>
                        </div>
                        {source.preview && <p className="rag-source-preview">{source.preview}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {message.steps && message.steps.length > 0 && (
              <>
                <button
                  type="button"
                  className="reasoning-toggle rag-toggle"
                  onClick={() => setIsStepsExpanded(!isStepsExpanded)}
                >
                  <RagIcon name="steps" />
                  <span>推理步骤</span>
                  <span className="rag-meta-count">{message.steps.length}</span>
                  <ToggleChevron expanded={isStepsExpanded} />
                </button>
                {isStepsExpanded && (
                  <div className="rag-meta-body">
                    <ol className="rag-step-list">
                      {message.steps.map((step, index) => (
                        <li key={`${step.node}-${index}`} className="rag-step-item">
                          <span className="rag-step-marker">{index + 1}</span>
                          <div className="rag-step-content">
                            <span className="rag-step-label">{formatStepLabel(step.node)}</span>
                            {(step.regeneration !== undefined || step.retrieval !== undefined) && (
                              <div className="rag-step-tags">
                                {step.regeneration !== undefined && (
                                  <span className="rag-step-tag">重生成 {step.regeneration}</span>
                                )}
                                {step.retrieval !== undefined && (
                                  <span className="rag-step-tag">检索 {step.retrieval}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}

        {message.role === 'assistant' &&
          !message.loading &&
          !hideActions &&
          message.content.trim().length > 0 && (
          <div className="message-actions">
            {isLastAssistantMessage && (
              <button className="action-btn" onClick={onRegenerate} data-tooltip="重新生成">
                <img src="/src/assets/photo/重新生成.png" alt="regenerate" />
              </button>
            )}
            <button className="action-btn" onClick={handleCopy} data-tooltip="复制">
              <img src={isCopied ? '/src/assets/photo/成功.png' : '/src/assets/photo/复制.png'} alt="copy" />
            </button>
            <button className="action-btn" onClick={handleLike} data-tooltip="喜欢">
              <img src={isLiked ? '/src/assets/photo/赞2.png' : '/src/assets/photo/赞.png'} alt="like" />
            </button>
            <button className="action-btn" onClick={handleDislike} data-tooltip="不喜欢">
              <img
                src={isDisliked ? '/src/assets/photo/踩2.png' : '/src/assets/photo/踩.png'}
                alt="dislike"
              />
            </button>
            <button className="action-btn" onClick={handleThemeToggle} data-tooltip={isCodeDarkTheme ? '切换代码亮色' : '切换代码暗色'}>
              <img src={isCodeDarkTheme ? lightIcon : darkIcon} alt="theme" />
            </button>
            {typeof message.completion_tokens === 'number' && message.completion_tokens > 0 && (
              <span className="tokens-info">
                tokens: {message.completion_tokens}, speed: {message.speed} tokens/s
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ChatMessage




