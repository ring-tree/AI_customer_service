// ---------------------------------------------------------------------------
// 上游地址与 OpenAI 兼容请求（客服工作台核心）
// 职责：按连接模式选基址 → 拼 /v1 路径 → 测连/拉模型 → 发起对话
// 对接：直连 TokenHub（Vite /tokenhub 代理）或模型网关（默认 :11434）
// ---------------------------------------------------------------------------
import {
  useSettingStore,
  DEFAULT_API_BASE_URL,
  DEFAULT_PROXY_URL,
  DEFAULT_RAG_URL,
  getEffectiveModel,
  type ModelOption,
  type Settings,
} from '../stores/setting'
import { testRagConnection } from './ragApi'

const normalizeBaseUrl = (url: string) => url.trim().replace(/\/+$/, '')

// ---------------------------------------------------------------------------
// F10：统一超时与中止封装——服务不可达/卡住时抛可读错误，替代全部裸 fetch
// 用法：fetchWithTimeout(url, options, ms)；超时抛「请求超时（Ns）」
// ---------------------------------------------------------------------------
export const fetchWithTimeout = (url: string, options: RequestInit = {}, ms = 60000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return fetch(url, { ...options, signal: controller.signal })
    .catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`请求超时（${Math.round(ms / 1000)}s），请检查服务是否正常运行`)
      }
      // 连接被拒/重置时浏览器统一抛 TypeError: Failed to fetch —— 映射为中文可读提示
      if (err instanceof TypeError && /fetch/i.test(err.message)) {
        throw new Error('无法连接服务：请确认对应服务已启动且地址正确')
      }
      throw err
    })
    .finally(() => clearTimeout(timer))
}

// ---------------------------------------------------------------------------
// [已实现] / [已实现]路径拼接 + 按 connectionMode 选择上游基址
// 供下方 getChatCompletionsUrl / getModelsUrl / getHealthUrl 以及 [已实现] 使用
// ---------------------------------------------------------------------------
/**
 * [已实现]把 base 拼成 OpenAI 风格路径
 * - 若 base 已以 /v1 结尾 → `${base}/${resource}`
 * - 否则 → `${base}/v1/${resource}`
 */
const appendOpenAIPath = (base: string, resource: string): string => {
  const normalized = normalizeBaseUrl(base)
  // [已实现]
  if (normalized.endsWith('/v1')) return `${normalized}/${resource}`
  return `${normalized}/v1/${resource}`
}

/**
 * [已实现]按 connectionMode 选择上游基址
 * - rag → ragUrl
 * - proxy → proxyUrl || DEFAULT_PROXY_URL
 * - direct → apiBaseUrl || DEFAULT_API_BASE_URL
 */
export const getServiceBaseUrl = (settings: Settings): string => {
  // [已实现]
  if (settings.connectionMode === 'rag') {
    return normalizeBaseUrl(settings.ragUrl || DEFAULT_RAG_URL)
  }
  const base =
    settings.connectionMode === 'proxy'
      ? settings.proxyUrl || DEFAULT_PROXY_URL
      : settings.apiBaseUrl || DEFAULT_API_BASE_URL
  return normalizeBaseUrl(base)
}

// ---------------------------------------------------------------------------
// 已实现：在 [已实现]/2 之上组装 completions / models / health 地址，并带上 Bearer
// 供测连、拉代理模型列表、[已实现] 发对话使用
// ---------------------------------------------------------------------------
export const getChatCompletionsUrl = (settings: Settings) => {
  const base = getServiceBaseUrl(settings)
  if (base.endsWith('/chat/completions')) return base
  return appendOpenAIPath(base, 'chat/completions')
}

export const getModelsUrl = (settings: Settings) => appendOpenAIPath(getServiceBaseUrl(settings), 'models')

export const getHealthUrl = (settings: Settings) => `${getServiceBaseUrl(settings)}/health`

const isTokenHubBase = (settings: Settings) => {
  const base = getServiceBaseUrl(settings)
  return base.startsWith('/tokenhub') || /tokenhub\.tencentmaas\.(com|cn)/i.test(base)
}

const buildHeaders = (settings: Settings) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (settings.apiKey.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey.trim()}`
  }
  return headers
}

// ---------------------------------------------------------------------------
// 已实现：设置面板用的「拉代理模型」与「测试连接」
// 依赖 [已实现]/2；RAG 模式转调 ragApi.testRagConnection
// ---------------------------------------------------------------------------
export const fetchProxyModels = async (proxyUrl?: string): Promise<ModelOption[]> => {
  const settings = useSettingStore.getState().settings
  const probeSettings: Settings = {
    ...settings,
    connectionMode: 'proxy',
    proxyUrl: proxyUrl || settings.proxyUrl || DEFAULT_PROXY_URL,
  }

  const res = await fetchWithTimeout(getModelsUrl(probeSettings), {}, 15000)
  if (!res.ok) {
    throw new Error(`获取模型列表失败：${res.status}`)
  }

  const data = await res.json()
  const models = Array.isArray(data?.data) ? data.data : []

  if (models.length === 0) {
    throw new Error('代理服务未返回可用模型，请确认模型网关已启动并配置了 API Key')
  }

  return models.map((item: { id: string }) => ({
    label: item.id,
    value: item.id,
    maxTokens: 16384,
  }))
}

export const testConnection = async (settings: Settings) => {
  if (settings.connectionMode === 'rag') {
    return testRagConnection(settings)
  }

  if (!isTokenHubBase(settings)) {
    const healthUrl = getHealthUrl(settings)
    const res = await fetchWithTimeout(healthUrl, {}, 15000)
    if (res.ok) return true
  }

  const modelsUrl = getModelsUrl(settings)
  const modelsRes = await fetchWithTimeout(
    modelsUrl,
    { headers: buildHeaders(settings) },
    15000
  )
  if (!modelsRes.ok) {
    let detail = ''
    try {
      const errBody = await modelsRes.json()
      detail =
        errBody?.error?.message_zh ||
        errBody?.error?.message ||
        errBody?.message ||
        errBody?.detail ||
        ''
    } catch {
      // ignore parse error
    }
    throw new Error(detail ? `连接失败：${modelsRes.status}（${detail}）` : `连接失败：${modelsRes.status}`)
  }
  return true
}

// ---------------------------------------------------------------------------
// [已实现]发起 OpenAI 兼容对话（POST chat/completions）
// 供 HomePage [已实现] 的 LLM 分支调用；流式时返回 Response 交给 messageHandler
// ---------------------------------------------------------------------------
/**
 * [已实现]发起 OpenAI 兼容对话请求
 * 要点：
 * 1. 用 getEffectiveModel 取模型名；直连模式必须有 apiKey
 * 2. body：model / messages / stream / max_tokens / temperature / top_p
 * 3. stream 时附加 stream_options: { include_usage: true }
 * 4. POST getChatCompletionsUrl(setting)；失败抛出可读错误
 * 5. stream=true 返回 Response；否则返回 json
 */
export const createChatCompletion = async (
  messages: Array<{ role: string; content: string }>
) => {
  const setting = useSettingStore.getState().settings
  // [已实现]
  const model = getEffectiveModel(setting)

  if (!model) {
    throw new Error('请先选择或填写模型名称')
  }
  if (setting.connectionMode === 'direct' && !setting.apiKey.trim()) {
    throw new Error('直连模式需要填写 API Key')
  }

  const payload: Record<string, unknown> = {
    model,
    messages,
    stream: setting.stream,
    max_tokens: setting.maxTokens,
    temperature: setting.temperature,
    top_p: setting.topP,
  }
  if (setting.stream) {
    payload.stream_options = { include_usage: true }
  }

  const res = await fetchWithTimeout(
    getChatCompletionsUrl(setting),
    {
      method: 'POST',
      headers: buildHeaders(setting),
      body: JSON.stringify(payload),
    },
    60000
  )

  if (!res.ok) {
    let detail = ''
    try {
      const errBody = await res.json()
      detail =
        errBody?.error?.message_zh ||
        errBody?.error?.message ||
        errBody?.message ||
        errBody?.detail ||
        ''
    } catch {
      // 错误体不是 JSON 时忽略
    }
    throw new Error(detail ? `请求错误：${res.status}（${detail}）` : `请求错误：${res.status}`)
  }

  return setting.stream ? res : await res.json()
}
