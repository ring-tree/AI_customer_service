// V4: class2 三模式 UI 与集成验证（RAG 端到端 / 代理端到端 / 测试连接 成功与失败边界）
const fs = require('fs');
const CDP_BASE = 'http://127.0.0.1:9444';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = 'E:/csk_project/class3/.tmp_verify';
const results = [];
const rec = (name, ok, detail) => {
  results.push({ name, ok });
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + ' | ' + String(detail).slice(0, 220));
};

async function getPageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(CDP_BASE + '/json/list');
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await delay(500);
  }
  throw new Error('CDP target not found');
}

async function main() {
  const page = await getPageTarget();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let idc = 0;
  const consoleMsgs = [];
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++idc;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
      consoleMsgs.push(msg.params.type + ': ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 160));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleMsgs.push('EXCEPTION: ' + msg.params.exceptionDetails.text);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      consoleMsgs.push('LOG.ERROR: ' + msg.params.entry.text.slice(0, 160));
    }
  };
  await new Promise((r) => (ws.onopen = r));
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');

  const baseSettings = {
    connectionMode: 'rag',
    apiBaseUrl: '/tokenhub/v1',
    proxyUrl: 'http://localhost:11434',
    ragUrl: 'http://127.0.0.1:14052',
    model: 'hy3',
    customModel: '',
    apiKey: '',
    stream: false,
    maxTokens: 4096,
    temperature: 0.7,
    topP: 0.7,
  };
  async function inject(settings) {
    const payload = { state: { settings }, version: 6 };
    await send('Runtime.evaluate', {
      expression: `localStorage.setItem('llm-setting-storage', ${JSON.stringify(JSON.stringify(payload))})`,
    });
    await send('Page.reload');
    await delay(4500);
  }
  const readLastBubble = `(() => {
    const items = [...document.querySelectorAll('.chat-widget .message-item')];
    const last = items[items.length - 1];
    return JSON.stringify({
      count: items.length,
      content: (last?.querySelector('.bubble')?.textContent || '').slice(0, 220),
      loading: !!last?.querySelector('.thinking-text'),
    });
  })()`;
  const readTestStatus = `document.querySelector('.test-connection-btn')?.parentElement?.querySelector('.setting-hint')?.textContent || '(无状态)'`;

  // ========== Phase A：RAG 模式端到端 ==========
  await send('Page.navigate', { url: 'http://localhost:3098/' });
  await delay(4500);
  await inject(baseSettings);
  await send('Runtime.evaluate', { expression: 'document.querySelector(".fab-chat").click()' });
  await delay(1200);
  let r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({badge: document.querySelector('.chat-widget-badge')?.textContent || ''})`,
    returnByValue: true,
  });
  rec('A1. RAG 徽标显示', JSON.parse(r.result.value).badge === 'RAG', r.result.value);

  await send('Runtime.evaluate', {
    expression: `(() => { const ta = document.querySelector('.chat-widget textarea');
      const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      s.call(ta, '什么情况下建议转人工？'); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  });
  await delay(300);
  await send('Runtime.evaluate', { expression: 'document.querySelector(".chat-widget .send-btn").click()' });

  let answer = '';
  let waited = 0;
  for (let i = 0; i < 90; i++) {
    await delay(2000);
    waited += 2;
    r = await send('Runtime.evaluate', { expression: readLastBubble, returnByValue: true });
    const st = JSON.parse(r.result.value);
    if (st.count >= 2 && st.content && !st.loading) {
      answer = st.content;
      break;
    }
  }
  rec('A2. RAG 问答回答渲染（等待 ' + waited + 's）', answer.length > 20, answer.slice(0, 100));

  await send('Runtime.evaluate', { expression: `[...document.querySelectorAll('.chat-widget .rag-toggle')].forEach((b) => b.click())` });
  await delay(1000);
  r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({src: document.querySelectorAll('.chat-widget .rag-source-item').length, step: document.querySelectorAll('.chat-widget .rag-step-item').length, labels: [...document.querySelectorAll('.chat-widget .rag-step-label')].map((e) => e.textContent)})`,
    returnByValue: true,
  });
  const meta = JSON.parse(r.result.value);
  rec('A3. 引用来源条目渲染', meta.src > 0, 'src=' + meta.src);
  rec('A4. 推理步骤条目渲染（中文标签）', meta.step > 0 && meta.labels.length > 0, 'steps=' + meta.step + ' labels=' + JSON.stringify(meta.labels));
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT + '/ui_rag.png', Buffer.from(shot.data, 'base64'));

  // ========== Phase B：代理模式端到端（经 class1） ==========
  await inject({ ...baseSettings, connectionMode: 'proxy' });
  await send('Runtime.evaluate', { expression: 'document.querySelector(".fab-chat").click()' });
  await delay(1200);
  await send('Runtime.evaluate', {
    expression: `(() => { const ta = document.querySelector('.chat-widget textarea');
      const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      s.call(ta, '用一句话向我打个招呼'); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  });
  await delay(300);
  await send('Runtime.evaluate', { expression: 'document.querySelector(".chat-widget .send-btn").click()' });
  answer = '';
  waited = 0;
  for (let i = 0; i < 60; i++) {
    await delay(2000);
    waited += 2;
    r = await send('Runtime.evaluate', { expression: readLastBubble, returnByValue: true });
    const st = JSON.parse(r.result.value);
    if (st.count >= 2 && st.content && !st.loading) {
      answer = st.content;
      break;
    }
  }
  rec('B1. 代理模式问答（经 class1，等待 ' + waited + 's）', answer.length > 2, answer.slice(0, 100));
  rec('B2. 回答无错误字样', !/错误|失败|Error/i.test(answer), answer.slice(0, 60));

  // ========== Phase C：测试连接（成功 / 失败边界） ==========
  const clickTest = async () => {
    await send('Runtime.evaluate', { expression: 'document.querySelector(".settings-trigger").click()' });
    await delay(1200);
    await send('Runtime.evaluate', { expression: 'document.querySelector(".test-connection-btn").click()' });
    await delay(4000);
    const rr = await send('Runtime.evaluate', { expression: readTestStatus, returnByValue: true });
    await send('Runtime.evaluate', { expression: 'document.querySelector(".settings-overlay")?.click()' });
    await delay(600);
    return String(rr.result.value);
  };

  let st = await clickTest(); // 当前为 proxy 模式
  rec('C1. 代理模式测试连接（成功）', st.includes('连接成功'), st);

  await inject(baseSettings); // rag 模式
  st = await clickTest();
  rec('C2. RAG 模式测试连接（成功）', st.includes('连接成功'), st);

  await inject({ ...baseSettings, connectionMode: 'proxy', proxyUrl: 'http://localhost:11499' });
  st = await clickTest();
  rec('C3. 代理死端口 → 失败提示', st.length > 1 && !st.includes('连接成功'), st);

  await inject({ ...baseSettings, ragUrl: 'http://127.0.0.1:14999' });
  st = await clickTest();
  rec('C4. RAG 死端口 → 失败提示', st.length > 1 && !st.includes('连接成功'), st);

  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT + '/ui_settings.png', Buffer.from(shot.data, 'base64'));

  console.log('==== 控制台消息（错误/警告，死端口用例的网络错误属预期） ====');
  console.log(JSON.stringify(consoleMsgs.slice(0, 20), null, 1));
  const fails = results.filter((x) => !x.ok);
  console.log(`==== class2 UI 汇总: PASS ${results.length - fails.length} / FAIL ${fails.length} ====`);
  if (fails.length) console.log('FAILED:', JSON.stringify(fails));
  console.log('UI-TEST-DONE');
  ws.close();
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message);
  process.exit(1);
});
