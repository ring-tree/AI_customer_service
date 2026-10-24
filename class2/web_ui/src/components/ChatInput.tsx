import { useState, useRef } from 'react'
import { FileItem } from '../stores/chat'
import './ChatInput.scss'

// ---------------------------------------------------------------------------
// 输入区：收集文本/附件，调用 props.onSend → HomePage.handleSend（TODO-5）
// ---------------------------------------------------------------------------

interface ChatInputProps {
  loading: boolean
  onSend: (messageContent: { text: string; files: FileItem[] }) => void
}

const ChatInput = ({ loading, onSend }: ChatInputProps) => {
  const [inputValue, setInputValue] = useState('')
  const [fileList, setFileList] = useState<FileItem[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const handleSend = () => {
    if ((!inputValue.trim() && fileList.length === 0) || loading) return
    onSend({ text: inputValue.trim(), files: fileList })
    setInputValue('')
    setFileList([])
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'file' | 'image') => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    const fileItem: FileItem = {
      name: file.name,
      url: URL.createObjectURL(file),
      type: type === 'image' ? 'image' : 'file',
      size: file.size,
    }

    setFileList([...fileList, fileItem])
    e.target.value = ''
  }

  const handleFileRemove = (file: FileItem) => {
    URL.revokeObjectURL(file.url)
    setFileList(fileList.filter((item) => item.url !== file.url))
  }

  return (
    <div className="chat-input-wrapper">
      {/**文件预渲染 */}
      {fileList.length > 0 && (
        <div className="preview-area">
          {fileList.map((file) => (
            <div key={file.url} className="preview-item">
              {file.type === 'image' ? (
                <div className="image-preview">
                  <img src={file.url} alt={file.name} />
                  <div className="remove-btn" onClick={() => handleFileRemove(file)}>
                    <span>×</span>
                  </div>
                </div>
              ) : (
                <div className="file-preview">
                  <span className="file-icon">📄</span>
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{(file.size / 1024).toFixed(1)}KB</span>
                  <div className="remove-btn" onClick={() => handleFileRemove(file)}>
                    <span>×</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {/**输入框*/}
      <textarea
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息，Enter 发送，Shift + Enter 换行"
        rows={4}
        style={{
          minHeight: '24px',
          maxHeight: '144px',
          resize: 'none',
          overflow: 'auto',
        }}
      />

      {/**功能按钮 */}
      <div className="button-group">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          style={{ display: 'none' }}
          onChange={(e) => handleFileChange(e, 'file')}
        />
        <button className="action-btn" onClick={() => fileInputRef.current?.click()}>
          <img src="/src/assets/photo/附件.png" alt="link" />
        </button>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFileChange(e, 'image')}
        />
        <button className="action-btn" onClick={() => imageInputRef.current?.click()}>
          <img src="/src/assets/photo/图片.png" alt="picture" />
        </button>

        <div className="divider"></div>
        <button className="action-btn send-btn" disabled={loading} onClick={handleSend}>
          <img src="/src/assets/photo/发送.png" alt="send" />
        </button>
      </div>
    </div>
  )
}

export default ChatInput




