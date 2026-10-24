import { useState, useRef, useEffect } from 'react'
import ChatMessage from './ChatMessage'
import { messageHandler } from '../utils/messageHandler'
import { createChatCompletion } from '../utils/api'
import { useSettingStore } from '../stores/setting'
import { Message } from '../stores/chat'
import './SearchDialog.scss'

const SearchDialog = () => {
  const [searchText, setSearchText] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const settings = useSettingStore((state) => state.settings)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const suggestedPrompts = [
    '如何快速上手Vue3框架',
    '入职腾讯难吗？',
    '前端如何实现弹性布局',
    '喝酒脸红是会喝酒的表现吗？',
  ]

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!searchText.trim() || isLoading) return

    try {
      setIsLoading(true)

      const userMessage = messageHandler.formatMessage('user', searchText.trim())
      const assistantMessage = messageHandler.formatMessage('assistant', '', '')

      setMessages([...messages, userMessage, { ...assistantMessage, loading: true }])
      setSearchText('')

      const messagesForAPI = [...messages, userMessage].map(({ role, content }) => ({ role, content }))
      const response = await createChatCompletion(messagesForAPI)

      const lastIndex = messages.length + 1
      await messageHandler.handleResponse(
        response,
        settings.stream,
        (content, reasoning_content, tokens, speed) => {
          setMessages((prev) => {
            const newMessages = [...prev]
            if (newMessages[lastIndex]) {
              newMessages[lastIndex] = {
                ...newMessages[lastIndex],
                content,
                reasoning_content,
                completion_tokens: tokens,
                speed: parseFloat(speed),
                loading: false,
              }
            }
            return newMessages
          })
        }
      )
    } catch (error) {
      console.error('Failed to send message:', error)
      setMessages((prev) => {
        const newMessages = [...prev]
        const lastIndex = newMessages.length - 1
        if (newMessages[lastIndex]) {
          newMessages[lastIndex] = {
            ...newMessages[lastIndex],
            content: '抱歉，发生了一些错误，请稍后重试。',
            loading: false,
          }
        }
        return newMessages
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegenerate = async () => {
    try {
      const lastUserMessage = messages[messages.length - 2]
      const newMessages = messages.slice(0, -2)
      setMessages(newMessages)

      const userMessage = messageHandler.formatMessage('user', lastUserMessage.content)
      const assistantMessage = messageHandler.formatMessage('assistant', '', '')

      setMessages([...newMessages, userMessage, { ...assistantMessage, loading: true }])

      const messagesForAPI = [...newMessages, userMessage].map(({ role, content }) => ({ role, content }))
      const response = await createChatCompletion(messagesForAPI)

      const lastIndex = newMessages.length + 1
      await messageHandler.handleResponse(
        response,
        settings.stream,
        (content, reasoning_content, tokens, speed) => {
          setMessages((prev) => {
            const newMessages = [...prev]
            if (newMessages[lastIndex]) {
              newMessages[lastIndex] = {
                ...newMessages[lastIndex],
                content,
                reasoning_content,
                completion_tokens: tokens,
                speed: parseFloat(speed),
                loading: false,
              }
            }
            return newMessages
          })
        }
      )
    } catch (error) {
      console.error('Failed to regenerate message:', error)
    }
  }

  return (
    <div className="search-dialog">
      <div className="search-header">
        <div className="search-input">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="提问"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <button className="action-btn" onClick={handleSend} disabled={isLoading}>
            <img src="/src/assets/photo/回车.png" alt="enter" />
          </button>
        </div>
      </div>

      <div className="dialog-content" ref={messagesContainerRef}>
        {messages.length === 0 ? (
          <>
            <div className="initial-message">Hi, 我是你的AI小助手，有什么问题都可以问我！</div>
            <div className="suggested-prompts">
              <div className="prompt-title">建议提示词</div>
              <div className="prompt-list">
                {suggestedPrompts.map((prompt) => (
                  <button key={prompt} className="prompt-item" onClick={() => setSearchText(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          messages.map((message, index) => (
            <ChatMessage
              key={message.id}
              message={message}
              isLastAssistantMessage={index === messages.length - 1 && message.role === 'assistant'}
              onRegenerate={handleRegenerate}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default SearchDialog

