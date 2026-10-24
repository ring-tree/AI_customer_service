import { useState, useEffect, useRef } from 'react'
import { useChatStore } from '../stores/chat'
import DialogEdit from './DialogEdit'
import './PopupMenu.scss'

const PopupMenu = () => {
  const [isVisible, setIsVisible] = useState(false)
  const conversations = useChatStore((state) => state.conversations)
  const currentConversationId = useChatStore((state) => state.currentConversationId)
  const createConversation = useChatStore((state) => state.createConversation)
  const switchConversation = useChatStore((state) => state.switchConversation)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const dialogEditRef = useRef<{ openDialog: (id: string, type: string) => void }>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsVisible(false)
      }
    }

    if (isVisible) {
      document.addEventListener('click', handleClickOutside)
    }

    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isVisible])

  const toggle = () => {
    setIsVisible(!isVisible)
  }

  const handleNewChat = () => {
    createConversation()
    setIsVisible(false)
  }

  const handleSwitchChat = (conversationId: string) => {
    switchConversation(conversationId)
    setIsVisible(false)
  }

  const formatTitle = (title: string) => {
    return title.length > 4 ? title.slice(0, 4) + '...' : title
  }

  return (
    <div className="popup-wrapper" ref={wrapperRef}>
      <button className="action-btn" onClick={toggle}>
        <img src="/src/assets/photo/弹出框.png" alt="" />
      </button>
      {isVisible && (
        <div className={`popup-menu ${isVisible ? 'animate__animated animate__fadeInLeft' : ''}`}>
          <div className="menu-section">
            <button className="new-chat-btn" onClick={handleNewChat}>
              <span>+</span>
              新对话
            </button>
          </div>
          <div className="menu-divider"></div>
          <div className="menu-section">
            <div className="section-title">历史对话</div>
            <div className="history-list">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`menu-item ${conversation.id === currentConversationId ? 'active' : ''}`}
                  onClick={() => handleSwitchChat(conversation.id)}
                >
                  <div className="item-content">
                    <img src="/src/assets/photo/对话.png" alt="" />
                    <span title={conversation.title}>{formatTitle(conversation.title)}</span>
                  </div>
                  <div className="item-actions">
                    <button
                      className="action-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        dialogEditRef.current?.openDialog(conversation.id, 'edit')
                      }}
                    >
                      <img src="/src/assets/photo/编辑.png" alt="edit" />
                    </button>
                    <button
                      className="action-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        dialogEditRef.current?.openDialog(conversation.id, 'delete')
                      }}
                    >
                      <img src="/src/assets/photo/删除.png" alt="delete" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <DialogEdit ref={dialogEditRef} />
    </div>
  )
}

export default PopupMenu

