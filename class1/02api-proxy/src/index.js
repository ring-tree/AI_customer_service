#!/usr/bin/env node
/**
 * 模型网关：OpenAI 兼容多厂商 LLM 代理
 *
 * 已给出的工具函数 / HTTP 骨架请直接使用，无需改动。
 */

// ---------------------------------------------------------------------------
// 启动准备：引入 HTTP / 文件 / 环境变量 / AI SDK，并换成彩色日志
// 为 [已实现] 读取 Key、为最后 listen(PORT) 启动代理做准备
// ---------------------------------------------------------------------------
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { ColorConsole } from './console.js';

global.console = new ColorConsole({
    stdout: process.stdout,
    stderr: process.stderr,
    timestamp: process.env.NODE_ENV !== 'production',
});

dotenv.config();

const PORT = process.env.PORT || 11434;

// ============================================================================
// [已实现]按环境变量注册四个 Provider（hunyuan / deepseek / zhipu / kimi）
// 作用：把已配置 Key 的厂商装进 providers；一个都没有则退出
// 供 /health、[已实现] 模型列表、validateModel、以及后续真正调模型使用
// 提示：
// - 有 Key 才注册；无 Key 则跳过
// - 混元 Key：HUNYUAN_API_KEY 或 TOKENHUB_API_KEY
// - 混元默认 baseURL：https://tokenhub-intl.tencentmaas.com/v1
// - DeepSeek / 智谱 / Kimi 默认地址见 .env.example
// - 使用 createOpenAI({ apiKey, baseURL, compatibility: 'compatible', name })
// ============================================================================
const providers = {};

// [已实现]a：注册 hunyuan（课上必通）
const hunyuanApiKey = process.env.HUNYUAN_API_KEY || process.env.TOKENHUB_API_KEY;
if (hunyuanApiKey) {
    providers.hunyuan = createOpenAI({
        apiKey: hunyuanApiKey,
        baseURL: process.env.HUNYUAN_API_URL || process.env.TOKENHUB_API_URL
            || 'https://tokenhub-intl.tencentmaas.com/v1',
        compatibility: 'compatible',
        name: 'hunyuan',
    });
}

// [已实现]b：注册 deepseek（有 Key 时）
if (process.env.DEEPSEEK_API_KEY) {
    providers.deepseek = createOpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1',
        compatibility: 'compatible',
        name: 'deepseek',
    });
}

// [已实现]c：注册 zhipu（有 Key 时）
if (process.env.ZHIPU_API_KEY) {
    providers.zhipu = createOpenAI({
        apiKey: process.env.ZHIPU_API_KEY,
        baseURL: process.env.ZHIPU_API_URL || 'https://open.bigmodel.cn/api/paas/v4',
        compatibility: 'compatible',
        name: 'zhipu',
    });
}

// [已实现]d：注册 kimi（有 Key 时）
if (process.env.KIMI_API_KEY) {
    providers.kimi = createOpenAI({
        apiKey: process.env.KIMI_API_KEY,
        baseURL: process.env.KIMI_API_URL || 'https://api.moonshot.cn/v1',
        compatibility: 'compatible',
        name: 'kimi',
    });
}

if (Object.keys(providers).length === 0) {
    console.error('❌ No API keys found. Set HUNYUAN_API_KEY (TokenHub) or other provider keys');
    process.exit(1);
}

// ---------------------------------------------------------------------------
// [已实现]加载模型别名表（如 hy3 → { provider: 'hunyuan', model: 'hy3' }）
// 有 models.json 则读取；缺失时补内置回退表
// 供 [已实现] 列出可用模型、[已实现] 校验请求里的 model 字段
// ---------------------------------------------------------------------------
const DEFAULT_MODELS_PATH = path.join(process.cwd(), 'models.json');

let models = {};
try {
    if (fs.existsSync(DEFAULT_MODELS_PATH)) {
        models = JSON.parse(fs.readFileSync(DEFAULT_MODELS_PATH, 'utf8'));
        console.log(`✅ Loaded models from ${DEFAULT_MODELS_PATH}`);
    } else {
        // [已实现]models.json 缺失时的内置回退表（至少含 hy3 / deepseek-chat / glm-4-flash / kimi-k2）
        models = {
            'hy3': { provider: 'hunyuan', model: 'hy3' },
            'hy3-preview': { provider: 'hunyuan', model: 'hy3-preview' },
            'hunyuan-role-latest': { provider: 'hunyuan', model: 'hunyuan-role-latest' },
            'deepseek-chat': { provider: 'deepseek', model: 'deepseek-chat' },
            'deepseek-reasoner': { provider: 'deepseek', model: 'deepseek-reasoner' },
            'glm-4-flash': { provider: 'zhipu', model: 'glm-4-flash' },
            'kimi-k2': { provider: 'kimi', model: 'moonshot-v1-8k' },
        };
        console.log('ℹ️ Using built-in models. Create a models.json file to customize.');
    }
} catch (error) {
    console.error(`❌ Error loading models.json: ${error.message}`);
    process.exit(1);
}

// ---------------------------------------------------------------------------
// 工具层 A（已实现）：读 POST JSON、CORS、统一 JSON / OpenAI 错误响应
// 供 [已实现] 列表、[已实现] 非流式返回和错误处理使用
// ---------------------------------------------------------------------------
const getBody = (request) => new Promise((resolve, reject) => {
  let raw = '';
  request.on('data', (chunk) => raw += chunk);
  request.on('end', () => {
    console.debug('[getBody] raw length:', raw.length);
    if (!raw) {
      console.debug('[getBody] empty body, resolving {}');
      return resolve({});
    }
    try {
      const parsed = JSON.parse(raw);
      console.debug('[getBody] parsed keys:', Object.keys(parsed));
      resolve(parsed);
    } catch (e) {
      console.error('[getBody] JSON parse error:', e.message);
      console.debug('[getBody] raw payload:', raw.slice(0, 500));
      reject(e);
    }
  });
});

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const sendJSON = (response, data, status = 200) =>
    response.writeHead(status, {
        'Content-Type': 'application/json',
        'charset': 'utf-8',
        ...CORS_HEADERS,
    }).end(JSON.stringify(data));

const sendOpenAIError = (response, message, status = 500, type = 'server_error') =>
    sendJSON(response, {
        error: { message, type, code: null },
    }, status);

// ---------------------------------------------------------------------------
// 工具层 B（已实现）：生成 chatcmpl- id、写 SSE data: 行、组 chunk / usage
// 并把 promptTokens 等字段收成 OpenAI usage，供 [已实现] / [已实现] 流式输出使用
// ---------------------------------------------------------------------------
const newChatCompletionId = () => `chatcmpl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const writeOpenAISSE = (response, payload) => {
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const openAIChunk = (id, created, model, delta, finishReason = null) => ({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{
        index: 0,
        delta,
        finish_reason: finishReason,
    }],
});

const openAIUsageChunk = (id, created, model, usage) => ({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [],
    usage,
});

const normalizeOpenAIUsage = (usage) => {
    if (!usage) return null;
    const promptTokens = usage.prompt_tokens ?? usage.promptTokens ?? 0;
    const completionTokens = usage.completion_tokens ?? usage.completionTokens ?? 0;
    const totalTokens = usage.total_tokens ?? usage.totalTokens ?? (promptTokens + completionTokens);
    return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
    };
};

/**
 * [已实现]分流开关——混元/DeepSeek 走原生 fetch，其余走 AI SDK
 * 混元与 DeepSeek 返回 { apiKey, baseURL }（便于透传 reasoning_content / usage）
 * 智谱 / Kimi 返回 null，后续走 AI SDK
 * 供 [已实现] / 7 / 8 决定调用路径
 */
const getProviderFetchConfig = (providerName) => {
    switch (providerName) {
        // [已实现]a：case 'hunyuan'
        case 'hunyuan':
            return {
                apiKey: process.env.HUNYUAN_API_KEY || process.env.TOKENHUB_API_KEY,
                baseURL: (process.env.HUNYUAN_API_URL || process.env.TOKENHUB_API_URL
                    || 'https://tokenhub-intl.tencentmaas.com/v1').replace(/\/+$/, ''),
            };
        // [已实现]b：case 'deepseek'
        case 'deepseek':
            return {
                apiKey: process.env.DEEPSEEK_API_KEY,
                baseURL: (process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
            };
        // default: return null
        default:
            return null;
    }
};

// ---------------------------------------------------------------------------
// 上游协议辅助（已实现）：组请求体、抽出思考内容、校验模型、清洗 messages
// 供 [已实现] 非流式 fetch 与 [已实现] SSE 组包 / 解析使用
// ---------------------------------------------------------------------------
const buildOpenAIChatBody = (modelConfig, messages, options = {}, stream = false) => {
    const modelName = modelConfig.model;
    const isReasoner = modelConfig.provider === 'deepseek' && /reasoner/i.test(modelName);
    const body = {
        model: modelName,
        messages: prepareMessages(messages).map((m) => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : '',
        })),
        stream,
    };

    if (!isReasoner) {
        if (typeof options.temperature === 'number') body.temperature = options.temperature;
        if (typeof options.top_p === 'number') body.top_p = options.top_p;
    }
    if (typeof options.num_predict === 'number') body.max_tokens = options.num_predict;

    if (stream) {
        body.stream_options = options.stream_options ?? { include_usage: true };
    }

    // F1：结构化输出与工具调用字段透传（下游 LangChain with_structured_output 依赖）
    if (options.response_format && typeof options.response_format === 'object') body.response_format = options.response_format;
    if (Array.isArray(options.tools)) body.tools = options.tools;
    if (options.tool_choice) body.tool_choice = options.tool_choice;

    return body;
};

const parseAssistantMessage = (message = {}) => ({
    text: typeof message.content === 'string' ? message.content : '',
    reasoning: typeof message.reasoning_content === 'string' ? message.reasoning_content : null,
});

const validateModel = name => {
    const config = models[name];
    if (!config) {
        throw new Error(`Model ${name} not supported`);
    }
    if (!providers[config.provider]) {
        throw new Error(`Provider ${config.provider} not available`);
    }
    return config;
};

const prepareMessages = (messages = []) => {
  console.debug('[prepareMessages] incoming messages count:', messages.length);

  const out = messages.map((msg, idx) => {
    const role = msg.role === 'assistant' || msg.role === 'system' ? msg.role : 'user';
    const c = msg.content;

    if (Array.isArray(c)) {
      console.debug(`[prepareMessages] msg[${idx}] has ${c.length} content blocks`);
      return { role, content: c };
    }

    if (typeof c === 'string') {
      const trimmed = c.trim();
      if (!trimmed) {
        console.debug(`[prepareMessages] msg[${idx}] is empty string; dropping`);
        return null;
      }
      return { role, content: trimmed };
    }

    console.debug(`[prepareMessages] msg[${idx}] has unsupported content type`, typeof c);
    return null;
  }).filter(Boolean);

  console.debug('[prepareMessages] valid messages count:', out.length);
  return out;
};

/**
 * [已实现]非流式生成
 * 分支 A：getProviderFetchConfig 有值 → 原生 fetch 上游 /chat/completions
 * 分支 B：否则 → AI SDK generateText（智谱 / Kimi）
 * 返回 { text, reasoning, usage }，供 [已实现] 在 stream=false 时组装 chat.completion
 */
const generateResponse = async (modelConfig, messages, options = {}) => {
  // [已实现]a：原生 fetch 分支（hunyuan / deepseek）
  const fetchConfig = getProviderFetchConfig(modelConfig.provider);
  if (fetchConfig) {
    const body = buildOpenAIChatBody(modelConfig, messages, options, false);
    const upstream = await fetch(`${fetchConfig.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${fetchConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      throw new Error(`${modelConfig.provider} HTTP ${upstream.status}: ${await upstream.text()}`);
    }

    const data = await upstream.json();
    const parsed = parseAssistantMessage(data.choices?.[0]?.message || {});
    return { text: parsed.text, reasoning: parsed.reasoning, usage: normalizeOpenAIUsage(data.usage) };
  }

  // [已实现]b：AI SDK 分支（zhipu / kimi）
  const provider = providers[modelConfig.provider];
  const model = provider(modelConfig.model);
  const validMessages = prepareMessages(messages);
  if (validMessages.length === 0) throw new Error('No valid messages found');

  const genArgs = { model, messages: validMessages, temperature: options.temperature, topP: options.top_p };
  if (typeof options.num_predict === 'number') genArgs.maxTokens = options.num_predict;

  const result = await generateText(genArgs);
  return {
    text: typeof result.text === 'string' ? result.text : '',
    reasoning: null,
    usage: normalizeOpenAIUsage(result.usage),
  };
};

/**
 * [已实现]OpenAI 兼容上游 SSE 透传（混元 / DeepSeek）
 * 要点：写 SSE 响应头 → fetch stream:true → 按行解析 data: → writeOpenAISSE → 结尾 data: [DONE]
 * 由 [已实现] 在混元/DeepSeek 流式时调用
 */
const streamOpenAICompatibleFetch = async (response, modelConfig, messages, options = {}, requestedModel) => {
  const fetchConfig = getProviderFetchConfig(modelConfig.provider);
  if (!fetchConfig) {
    throw new Error(`Provider ${modelConfig.provider} does not support native streaming`);
  }

  const modelName = modelConfig.model;
  const id = newChatCompletionId();
  const created = Math.floor(Date.now() / 1000);
  const outModel = requestedModel || modelName;
  const body = buildOpenAIChatBody(modelConfig, messages, options, true);

  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    ...CORS_HEADERS,
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // [已实现]实现上游 SSE 读取与转发（可参考手册 1.2.7）
  // 失败时也要写 error chunk + data: [DONE] 并 end()
  try {
    const upstream = await fetch(`${fetchConfig.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${fetchConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      throw new Error(`${modelConfig.provider} HTTP ${upstream.status}: ${errText}`);
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sentRole = false;
    let finishSent = false; // F9：上游已发过 finish 帧时，收尾不再补发

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        let parsed;
        try { parsed = JSON.parse(data); } catch { continue; }

        const delta = parsed.choices?.[0]?.delta || {};
        const finishReason = parsed.choices?.[0]?.finish_reason ?? null;

        const outDelta = {};
        if (!sentRole && (delta.role || delta.content != null || delta.reasoning_content)) {
          outDelta.role = 'assistant';
          sentRole = true;
        }
        if (typeof delta.content === 'string' && delta.content) outDelta.content = delta.content;
        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
          outDelta.reasoning_content = delta.reasoning_content;
        }

        if (Object.keys(outDelta).length > 0 || finishReason) {
          writeOpenAISSE(response, openAIChunk(id, created, outModel, outDelta, finishReason));
          if (finishReason) finishSent = true;
        }

        const usage = normalizeOpenAIUsage(parsed.usage);
        if (usage) {
          writeOpenAISSE(response, openAIUsageChunk(id, created, outModel, usage));
        }
      }
    }

    // F9：仅当上游未发过 finish 帧时补一条 stop，避免重复
    if (!finishSent) {
      writeOpenAISSE(response, openAIChunk(id, created, outModel, {}, 'stop'));
    }
    response.write('data: [DONE]\n\n');
    response.end();
  } catch (error) {
    writeOpenAISSE(response, {
      id,
      object: 'chat.completion.chunk',
      created,
      model: outModel,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      error: { message: error.message },
    });
    response.write('data: [DONE]\n\n');
    response.end();
  }
};

/**
 * [已实现]流式总入口
 * - 若 getProviderFetchConfig 有值 → 调用 streamOpenAICompatibleFetch（[已实现]）
 * - 否则 → AI SDK streamText，逐段 writeOpenAISSE，结尾 [DONE]
 * 由 [已实现] 在 stream=true 时调用
 */
const streamOpenAIResponse = async (response, modelConfig, messages, options = {}, requestedModel) => {
  // [已实现]a：原生流式分流
  if (getProviderFetchConfig(modelConfig.provider)) {
    return streamOpenAICompatibleFetch(response, modelConfig, messages, options, requestedModel);
  }

  // [已实现]b：AI SDK 流式（zhipu / kimi）
  const provider = providers[modelConfig.provider];
  const model = provider(modelConfig.model);
  const validMessages = prepareMessages(messages);
  if (validMessages.length === 0) throw new Error('No valid messages found');

  const id = newChatCompletionId();
  const created = Math.floor(Date.now() / 1000);
  const outModel = requestedModel || modelConfig.model;

  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    ...CORS_HEADERS,
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const streamArgs = { model, messages: validMessages, temperature: options.temperature, topP: options.top_p };
  if (typeof options.num_predict === 'number') streamArgs.maxTokens = options.num_predict;

  const result = await streamText(streamArgs);

  writeOpenAISSE(response, openAIChunk(id, created, outModel, { role: 'assistant' }));
  for await (const delta of result.textStream) {
    writeOpenAISSE(response, openAIChunk(id, created, outModel, { content: delta }));
  }
  writeOpenAISSE(response, openAIChunk(id, created, outModel, {}, 'stop'));
  response.write('data: [DONE]\n\n');
  response.end();
};

/**
 * [已实现]POST /v1/chat/completions 总处理器
 * 1. getBody → 校验 model / messages
 * 2. validateModel
 * 3. stream=true → streamOpenAIResponse（[已实现]）；否则 generateResponse（[已实现]）并 sendJSON
 * 挂到下方路由 POST /v1/chat/completions；catch 已写好（头未发出走 JSON 错误，已发出补 [DONE]）
 */
const handleOpenAIChatCompletions = async (request, response) => {
  try {
    // [已实现]补全本函数
    const body = await getBody(request);
    // F1：解构补 response_format / tools / tool_choice（结构化输出与工具调用透传）
    const { model, messages = [], stream = false, temperature, top_p, max_tokens, stream_options, response_format, tools, tool_choice } = body;

    if (!model) {
      return sendOpenAIError(response, 'Missing required parameter: model', 400, 'invalid_request_error');
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return sendOpenAIError(response, 'Missing required parameter: messages', 400, 'invalid_request_error');
    }

    const modelConfig = validateModel(model);

    const options = {};
    if (typeof temperature === 'number') options.temperature = temperature;
    if (typeof top_p === 'number') options.top_p = top_p;
    if (typeof max_tokens === 'number') options.num_predict = max_tokens;
    if (stream_options && typeof stream_options === 'object') options.stream_options = stream_options;
    // F1：高级参数原样透传，供 buildOpenAIChatBody 组包
    if (response_format && typeof response_format === 'object') options.response_format = response_format;
    if (Array.isArray(tools)) options.tools = tools;
    if (tool_choice) options.tool_choice = tool_choice;

    if (stream) {
      await streamOpenAIResponse(response, modelConfig, messages, options, model);
      return;
    }

    const result = await generateResponse(modelConfig, messages, options);

    const message = { role: 'assistant', content: result.text || '' };
    if (result.reasoning) message.reasoning_content = result.reasoning;

    sendJSON(response, {
      id: newChatCompletionId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, message, finish_reason: 'stop' }],
      usage: result.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  } catch (error) {
    console.error('[OpenAI /v1/chat/completions] error:', error.message);
    if (!response.headersSent) {
      const status = /not supported|not available/i.test(error.message) ? 404 : 500;
      sendOpenAIError(response, error.message, status);
    } else {
      response.write('data: [DONE]\n\n');
      response.end();
    }
  }
};

// ---------------------------------------------------------------------------
// 路由表：按「方法 + 路径」分发
// GET / 与 GET /health 已实现；[已实现] 补模型列表；POST 接到 [已实现]
// ---------------------------------------------------------------------------
const routes = {
    'GET /': (request, response) => response.end('Multi-provider LLM proxy (OpenAI-compatible).'),
    'GET /health': (request, response) => sendJSON(response, {
        status: 'ok',
        service: 'ollama-api-proxy',
        port: Number(PORT),
        providers: Object.keys(providers),
        models: Object.keys(models).filter(name => providers[models[name]?.provider]),
    }),
    // [已实现]只返回「已配置 Key」的模型列表（OpenAI list 格式）
    // 供客服工作台前端拉模型下拉框；依赖 [已实现] 的 providers 与 [已实现] 的 models 表
    'GET /v1/models': (request, response) => {
        // 提示：Object.entries(models).filter(...).map(...) → { object:'list', data }
        const data = Object.entries(models)
            .filter(([, config]) => providers[config.provider])
            .map(([name, config]) => ({
                id: name,
                object: 'model',
                created: Math.floor(Date.now() / 1000),
                owned_by: config.provider,
            }));
        sendJSON(response, { object: 'list', data });
    },
    'POST /v1/chat/completions': handleOpenAIChatCompletions,
    // F2：/v1/embeddings 透传（走混元原生 fetch 配置，供向量化收敛到网关）
    'POST /v1/embeddings': async (request, response) => {
        try {
            const body = await getBody(request);
            const fetchConfig = getProviderFetchConfig('hunyuan');
            if (!fetchConfig?.apiKey) {
                return sendOpenAIError(response, 'Provider hunyuan not available', 404);
            }
            const upstream = await fetch(`${fetchConfig.baseURL}/embeddings`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${fetchConfig.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            const text = await upstream.text();
            response.writeHead(upstream.status, {
                'Content-Type': 'application/json; charset=utf-8',
                ...CORS_HEADERS,
            }).end(text);
        } catch (error) {
            sendOpenAIError(response, error.message, 500);
        }
    },
};

// ---------------------------------------------------------------------------
// HTTP 骨架（已实现）：CORS 预检、查表分发、监听端口、信号退出
// 把上面整条链路挂到 localhost:PORT（默认 11434）
// ---------------------------------------------------------------------------
const proxyServer = http.createServer(async (request, response) => {
    const routeKey = `${request.method} ${request.url.split('?')[0]}`;
    console.info(routeKey);

    if (request.method === 'OPTIONS') {
        return response.writeHead(200, CORS_HEADERS).end();
    }

    try {
        const handler = routes[routeKey];
        if (handler) {
            await handler(request, response);
        } else {
            sendOpenAIError(response, 'Not found', 404, 'invalid_request_error');
        }
    } catch (error) {
        console.error('Server error:', error.message);
        if (!response.headersSent) {
            sendOpenAIError(response, 'Internal server error', 500);
        }
    }
});

proxyServer.listen(PORT, () => {
    const availableModels = Object.keys(models).filter(name => providers[models[name]?.provider]);

    console.log(`🚀 LLM Proxy running on http://localhost:${PORT}`);
    console.log(`🔑 Providers: ${Object.keys(providers).join(', ') || '(none — 请完成 [已实现])'}`);
    console.log(`📋 Available models: ${availableModels.join(', ') || '(none)'}`);
    if (availableModels.length === 0) {
        console.warn('⚠️ 没有可用模型：请完成 Provider 注册，并确认 models.json 与 Key 对应');
        console.warn('   混元请在 .env 设置 HUNYUAN_API_KEY（TokenHub）');
    }
    console.log(`📡 POST http://localhost:${PORT}/v1/chat/completions`);
    console.log(`📡 GET  http://localhost:${PORT}/v1/models`);
    console.log(`📡 GET  http://localhost:${PORT}/health`);
});

['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
        console.log(`\n🛑 Received ${signal}, shutting down...`);
        proxyServer.close(() => process.exit(0));
    });
});
