// ---------------------------------------------------------------------------
// 连接与模型设置（Zustand + localStorage 持久化）
// 三模式：direct（TokenHub）/ proxy（实训二 :11434）/ rag（实训四 :14052）
// 供 api.ts、ragApi.ts、SettingsPanel、HomePage 读取
// ---------------------------------------------------------------------------
import { create } from 'zustand'
import { persist, devtools, createJSONStorage } from 'zustand/middleware'

export type ConnectionMode = 'direct' | 'proxy' | 'rag'

export interface Settings {
  connectionMode: ConnectionMode
  apiBaseUrl: string
  proxyUrl: string
  ragUrl: string
  model: string
  customModel: string
  apiKey: string
  stream: boolean
  maxTokens: number
  temperature: number
  topP: number
}

interface SettingStore {
  settings: Settings
}

export const DEFAULT_PROXY_URL = 'http://localhost:11434'
export const DEFAULT_RAG_URL = 'http://127.0.0.1:14052'
/** 开发环境通过 Vite 代理访问，避免浏览器 CORS */
export const DEFAULT_API_BASE_URL = '/tokenhub/v1'
export const DEFAULT_HUNYUAN_MODEL = 'hy3'
export const CUSTOM_MODEL_VALUE = '__custom__'

// 默认设置与本地持久化迁移（旧版 DeepSeek/混元 URL 会洗成 TokenHub 直连）
const defaultSettings: Settings = {
  connectionMode: 'direct',
  apiBaseUrl: DEFAULT_API_BASE_URL,
  proxyUrl: DEFAULT_PROXY_URL,
  ragUrl: DEFAULT_RAG_URL,
  model: DEFAULT_HUNYUAN_MODEL,
  customModel: '',
  apiKey: '',
  stream: false,
  maxTokens: 4096,
  temperature: 0.7,
  topP: 0.7,
}

const SETTINGS_STORAGE_VERSION = 6

const LEGACY_API_URLS = new Set([
  'https://api.deepseek.com/v1',
  'https://api.deepseek.com',
  'https://api.hunyuan.cloud.tencent.com/v1',
  'https://api.hunyuan.cloud.tencent.com',
  'https://tokenhub-intl.tencentmaas.com/v1',
  'https://tokenhub-intl.tencentmaas.com',
  'https://tokenhub.tencentmaas.com/v1',
  'https://tokenhub.tencentmaas.com',
  'https://tokenhub-intl.tencentcloudapi.com/v1',
  'https://tokenhub-intl.tencentcloudapi.com',
])

const LEGACY_MODELS = new Set([
  'deepseek-chat',
  'deepseek-reasoner',
  'hunyuan-turbos-latest',
  'hunyuan-a13b',
  'hunyuan-turbo',
])

const normalizeApiBaseUrl = (url: string) => url.trim().replace(/\/+$/, '')

const migrateSettings = (settings: Settings, fromVersion: number): Settings => {
  if (fromVersion >= SETTINGS_STORAGE_VERSION) {
    return settings
  }

  const next = { ...settings }
  const apiBase = normalizeApiBaseUrl(next.apiBaseUrl)

  if (fromVersion < 5 || !apiBase || LEGACY_API_URLS.has(apiBase) || apiBase.startsWith('http')) {
    next.apiBaseUrl = DEFAULT_API_BASE_URL
  }

  if (fromVersion < 6 && (next.apiBaseUrl.startsWith('/tokenhub') || /tokenhub/i.test(next.apiBaseUrl))) {
    next.stream = false
  }

  if (LEGACY_MODELS.has(next.model)) {
    next.model = DEFAULT_HUNYUAN_MODEL
  }

  return next
}

export const useSettingStore = create<SettingStore>()(
  devtools(
    persist(
      () => ({ settings: defaultSettings }),
      {
        name: 'llm-setting-storage',
        version: SETTINGS_STORAGE_VERSION,
        storage: createJSONStorage(() => localStorage),
        migrate: (persisted, fromVersion) => {
          const saved = (persisted as Partial<SettingStore> | undefined)?.settings ?? {}
          return {
            settings: migrateSettings(
              {
                ...defaultSettings,
                ...saved,
              },
              fromVersion
            ),
          }
        },
      }
    ),
    { name: 'SettingStore' }
  )
)

export interface ModelOption {
  label: string
  value: string
  maxTokens: number
}

// 直连模式下拉选项；代理模式列表由 fetchProxyModels 动态拉取
export const modelOptions: ModelOption[] = [
  {
    label: 'Hy3（推荐）',
    value: 'hy3',
    maxTokens: 8192,
  },
  {
    label: 'Hy3 Preview',
    value: 'hy3-preview',
    maxTokens: 8192,
  },
  {
    label: 'Hy-Role',
    value: 'hunyuan-role-latest',
    maxTokens: 8192,
  },
  {
    label: '自定义模型',
    value: CUSTOM_MODEL_VALUE,
    maxTokens: 16384,
  },
]

export const getEffectiveModel = (settings: Settings) =>
  settings.model === CUSTOM_MODEL_VALUE ? settings.customModel.trim() : settings.model
