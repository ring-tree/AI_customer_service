import { useState, useImperativeHandle, forwardRef } from 'react'
import { useChatStore } from '../stores/chat'
import './DialogEdit.scss'

export interface DialogEditRef {
  openDialog: (conversationId: string, type: 'edit' | 'delete') => void
}

const DialogEdit = forwardRef<DialogEditRef>((_props, ref) => {
  const [dialogVisible, setDialogVisible] = useState(false)
  const [inputTitle, setInputTitle] = useState('')
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [dialogType, setDialogType] = useState<'edit' | 'delete'>('edit')
  const { conversations, updateConversationTitle, deleteConversation } = useChatStore()

  useImperativeHandle(ref, () => ({
    openDialog: (conversationId: string, type: 'edit' | 'delete') => {
      setCurrentConversationId(conversationId)
      setDialogType(type)

      if (type === 'edit') {
        const conversation = conversations.find((c) => c.id === conversationId)
        setInputTitle(conversation?.title || '')
      }

      setDialogVisible(true)
    },
  }))

  const handleConfirm = () => {
    if (!currentConversationId) return

    if (dialogType === 'edit') {
      updateConversationTitle(currentConversationId, inputTitle.trim())
    } else {
      deleteConversation(currentConversationId)
    }

    setDialogVisible(false)
    setInputTitle('')
  }

  const handleCancel = () => {
    setDialogVisible(false)
    setInputTitle('')
  }

  if (!dialogVisible) return null

  return (
    <div className="dialog-overlay" onClick={handleCancel}>
      <div className="dialog-container" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{dialogType === 'edit' ? '编辑对话名称' : '确定删除对话?'}</h3>
        </div>
        <div className="dialog-body">
          {dialogType === 'edit' ? (
            <input
              type="text"
              className="dialog-input"
              value={inputTitle}
              onChange={(e) => setInputTitle(e.target.value)}
              placeholder="请输入对话名称"
              maxLength={50}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirm()
                }
              }}
            />
          ) : (
            <div className="delete-warning">
              <span className="warning-icon">⚠</span>
              <span>删除后，聊天记录将不可恢复。</span>
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <button className="dialog-btn cancel-btn" onClick={handleCancel}>
            取消
          </button>
          <button
            className={`dialog-btn ${dialogType === 'edit' ? 'primary-btn' : 'danger-btn'}`}
            onClick={handleConfirm}
          >
            {dialogType === 'edit' ? '确定' : '删除'}
          </button>
        </div>
      </div>
    </div>
  )
})

DialogEdit.displayName = 'DialogEdit'

export default DialogEdit




