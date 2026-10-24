import { useState, useEffect, useRef } from 'react'
import {
  useSettingStore,
  modelOptions,
  CUSTOM_MODEL_VALUE,
  DEFAULT_PROXY_URL,
  DEFAULT_API_BASE_URL,
  DEFAULT_RAG_URL,
  type ConnectionMode,
  type ModelOption,
} from '../stores/setting'
import { fetchProxyModels, testConnection } from '../utils/api'
import './SettingsPanel.scss'

// ---------------------------------------------------------------------------
// 设置面板：改 connectionMode / Key / 地址，并调用 testConnection、fetchProxyModels
// 写回 useSettingStore；不负责发对话（发对话在 HomePage TODO-5）
// ---------------------------------------------------------------------------

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

const SettingsPanel = ({ isOpen, onClose }: SettingsPanelProps) => {
  const settings = useSettingStore((state) => state.settings)
  const [localSettings, setLocalSettings] = useState(settings)
  const [proxyModels, setProxyModels] = useState<ModelOption[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('')
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  useEffect(() => {
    if (isOpen && localSettings.connectionMode === 'proxy') {
      void loadProxyModels(localSettings.proxyUrl)
    }
  }, [isOpen, localSettings.connectionMode])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  const isRagMode = localSettings.connectionMode === 'rag'
  const isLlmMode = !isRagMode

  const availableModels =
    localSettings.connectionMode === 'proxy' ? proxyModels : modelOptions

  const currentMaxTokens =
    availableModels.find((option) => option.value === localSettings.model)?.maxTokens || 16384

  const saveSettings = (next: typeof localSettings) => {
    setLocalSettings(next)
    useSettingStore.setState({ settings: next })
  }

  const handleChange = <K extends keyof typeof localSettings>(key: K, value: (typeof localSettings)[K]) => {
    saveSettings({ ...localSettings, [key]: value })
  }

  const handleModelChange = (model: string) => {
    const selectedModel = availableModels.find((option) => option.value === model)
    const next = {
      ...localSettings,
      model,
      maxTokens: selectedModel
        ? Math.min(localSettings.maxTokens, selectedModel.maxTokens)
        : localSettings.maxTokens,
    }
    saveSettings(next)
  }

  const handleModeChange = (mode: ConnectionMode) => {
    const next = { ...localSettings, connectionMode: mode }
    saveSettings(next)
    if (mode === 'proxy') {
      void loadProxyModels(next.proxyUrl)
    }
  }

  const loadProxyModels = async (proxyUrl?: string) => {
    setModelsLoading(true)
    setModelsError('')
    try {
      const models = await fetchProxyModels(proxyUrl)
      setProxyModels(models)

      const latest = useSettingStore.getState().settings
      const currentModelExists = models.some((item) => item.value === latest.model)
      if (!currentModelExists && models.length > 0) {
        const next = {
          ...latest,
          connectionMode: 'proxy' as const,
          proxyUrl: proxyUrl || latest.proxyUrl,
          model: models[0].value,
          maxTokens: Math.min(latest.maxTokens, models[0].maxTokens),
        }
        saveSettings(next)
      }
    } catch (error) {
      setProxyModels([])
      setModelsError(error instanceof Error ? error.message : '获取模型失败')
    } finally {
      setModelsLoading(false)
    }
  }

  const handleTestConnection = async () => {
    setConnectionStatus('检测中...')
    try {
      await testConnection(localSettings)
      setConnectionStatus('连接成功')
    } catch (error) {
      setConnectionStatus(error instanceof Error ? error.message : '连接失败')
    }
  }

  if (!isOpen) return null

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-drawer" ref={drawerRef} onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="setting-container">
          <div className="setting-item">
            <div className="setting-label">接入模式</div>
            <div className="mode-switch mode-switch-three">
              <button
                type="button"
                className={`mode-btn ${localSettings.connectionMode === 'direct' ? 'active' : ''}`}
                onClick={() => handleModeChange('direct')}
              >
                直连 API
              </button>
              <button
                type="button"
                className={`mode-btn ${localSettings.connectionMode === 'proxy' ? 'active' : ''}`}
                onClick={() => handleModeChange('proxy')}
              >
                实训二代理
              </button>
              <button
                type="button"
                className={`mode-btn ${localSettings.connectionMode === 'rag' ? 'active' : ''}`}
                onClick={() => handleModeChange('rag')}
              >
                实训四 RAG
              </button>
            </div>
          </div>

          {localSettings.connectionMode === 'direct' && (
            <div className="setting-item">
              <div className="setting-label">API Base URL</div>
              <input
                type="text"
                className="api-key-input"
                value={localSettings.apiBaseUrl}
                onChange={(e) => handleChange('apiBaseUrl', e.target.value)}
                placeholder={DEFAULT_API_BASE_URL}
              />
              <p className="setting-hint">
                开发环境默认 /tokenhub/v1（经本地代理转发到 TokenHub 中国站，避免 CORS）
              </p>
              <p className="setting-hint">Hy3 首次调用可能较慢（需启动推理服务），建议关闭流式响应</p>
            </div>
          )}

          {localSettings.connectionMode === 'proxy' && (
            <div className="setting-item">
              <div className="setting-label-row">
                <div className="setting-label">实训二代理地址</div>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => void loadProxyModels(localSettings.proxyUrl)}
                  disabled={modelsLoading}
                >
                  {modelsLoading ? '刷新中...' : '刷新模型'}
                </button>
              </div>
              <input
                type="text"
                className="api-key-input"
                value={localSettings.proxyUrl}
                onChange={(e) => handleChange('proxyUrl', e.target.value)}
                onBlur={() => void loadProxyModels(localSettings.proxyUrl)}
                placeholder={DEFAULT_PROXY_URL}
              />
              <p className="setting-hint">实训二启动后的地址，默认 http://localhost:11434</p>
              {modelsError && <p className="setting-error">{modelsError}</p>}
            </div>
          )}

          {localSettings.connectionMode === 'rag' && (
            <div className="setting-item">
              <div className="setting-label">实训四 RAG 地址</div>
              <input
                type="text"
                className="api-key-input"
                value={localSettings.ragUrl}
                onChange={(e) => handleChange('ragUrl', e.target.value)}
                placeholder={DEFAULT_RAG_URL}
              />
              <p className="setting-hint">实训四启动后的地址，默认 http://127.0.0.1:14052</p>
            </div>
          )}

          {isLlmMode && (
            <>
              <div className="setting-item">
                <div className="setting-label">Model</div>
                <select
                  className="model-select"
                  value={localSettings.model}
                  onChange={(e) => handleModelChange(e.target.value)}
                  disabled={localSettings.connectionMode === 'proxy' && modelsLoading}
                >
                  {availableModels.length > 0 ? (
                    availableModels.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))
                  ) : (
                    <option value="">暂无可用模型</option>
                  )}
                </select>
              </div>

              {localSettings.connectionMode === 'direct' && localSettings.model === CUSTOM_MODEL_VALUE && (
                <div className="setting-item">
                  <div className="setting-label">自定义模型名</div>
                  <input
                    type="text"
                    className="api-key-input"
                    value={localSettings.customModel}
                    onChange={(e) => handleChange('customModel', e.target.value)}
                    placeholder="例如 hy3"
                  />
                </div>
              )}

              <div className="setting-item">
                <div className="setting-label-row">
                  <div className="label-with-tooltip">
                    <span>API Key</span>
                    <span
                      className="tooltip-icon"
                      title={
                        localSettings.connectionMode === 'proxy'
                          ? '实训二代理已在服务端配置 Key，此处可留空'
                          : '直连模式必须填写 API Key'
                      }
                    >
                      ?
                    </span>
                  </div>
                  {localSettings.connectionMode === 'direct' && (
                    <a
                      href="https://console.cloud.tencent.com/tokenhub/api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="get-key-link"
                    >
                      获取 TokenHub API Key
                    </a>
                  )}
                </div>
                <input
                  type="password"
                  className="api-key-input"
                  value={localSettings.apiKey}
                  onChange={(e) => handleChange('apiKey', e.target.value)}
                  placeholder={
                    localSettings.connectionMode === 'proxy'
                      ? '可选，代理模式通常无需填写'
                      : '请输入 TokenHub API Key'
                  }
                />
              </div>

              <div className="setting-item">
                <div className="setting-label-row">
                  <div className="label-with-tooltip">
                    <span>流式响应</span>
                    <span className="tooltip-icon" title="开启后将流式响应 AI 的回复">
                      ?
                    </span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={localSettings.stream}
                      onChange={(e) => handleChange('stream', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  Max Tokens
                  <span className="tooltip-icon" title="生成文本的最大长度">?</span>
                </div>
                <div className="setting-control">
                  <input
                    type="range"
                    min="1"
                    max={currentMaxTokens}
                    step="1"
                    value={localSettings.maxTokens}
                    onChange={(e) => handleChange('maxTokens', Number(e.target.value))}
                    className="setting-slider"
                  />
                  <input
                    type="number"
                    min="1"
                    max={currentMaxTokens}
                    step="1"
                    value={localSettings.maxTokens}
                    onChange={(e) => handleChange('maxTokens', Number(e.target.value))}
                    className="setting-input-number"
                  />
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  Temperature
                  <span className="tooltip-icon" title="值越高，回答越随机">?</span>
                </div>
                <div className="setting-control">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={localSettings.temperature}
                    onChange={(e) => handleChange('temperature', Number(e.target.value))}
                    className="setting-slider"
                  />
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={localSettings.temperature}
                    onChange={(e) => handleChange('temperature', Number(e.target.value))}
                    className="setting-input-number"
                  />
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  Top-P
                  <span className="tooltip-icon" title="核采样阈值">?</span>
                </div>
                <div className="setting-control">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={localSettings.topP}
                    onChange={(e) => handleChange('topP', Number(e.target.value))}
                    className="setting-slider"
                  />
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={localSettings.topP}
                    onChange={(e) => handleChange('topP', Number(e.target.value))}
                    className="setting-input-number"
                  />
                </div>
              </div>
            </>
          )}

          <div className="setting-item">
            <button type="button" className="test-connection-btn" onClick={() => void handleTestConnection()}>
              测试连接
            </button>
            {connectionStatus && <p className="setting-hint">{connectionStatus}</p>}
          </div>

          {isRagMode && (
            <div className="setting-item">
              <p className="setting-hint">
                RAG 模式通过实训四知识库检索回答，不支持流式响应；多轮对话由服务端 session 维护。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
