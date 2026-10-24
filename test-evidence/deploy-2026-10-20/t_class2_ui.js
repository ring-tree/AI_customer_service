// A2 客服工作台 UI 冒烟测试（Chrome CDP）
// 覆盖：首页渲染 / 客服窗打开 / 代理模式对话 / RAG 模式对话与引用来源
const fs = require('fs');
const path = require('path');
const CDP = 'http://127.0.0.1:9445';
const OUT = __dirname;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const rec = (name, ok, detail) => {
  results.push({ name, ok });
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + ' | ' + String(detail).replace(/\s+/g, ' ').slice(0, 240));
};

async function getPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const t = await (await fetch(CDP + '/json/list')).json();
      const p = t.find((x) => x.type === 'page');
      if (p) return p;
    } catch {}
    await delay(500);
  }
  throw new Error('CDP 未就绪');
}

async function main() {
  const page = await getPage();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let idc = 0;
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++idc;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
      pending.delete(m.id);
    }
  };
  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Runtime.enable');

  const evalJS = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 200));
    return r.result.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  };
  const goto = async (url) => {
    await send('Page.navigate', { url });
    await delay(4000);
  };
  const setMode = async (mode) => {
    await evalJS(`(() => {
      const settings = {
        connectionMode: '${mode}',
        apiBaseUrl: '/tokenhub/v1',
        proxyUrl: 'http://localhost:11434',
        ragUrl: 'http://127.0.0.1:14052',
        model: 'hy3', customModel: '', apiKey: '', stream: true,
        maxTokens: 4096, temperature: 0.7, topP: 0.7,
      };
      localStorage.setItem('llm-setting-storage', JSON.stringify({ state: { settings }, version: 6 }));
      localStorage.removeItem('llm-chat-storage');
      return 'ok';
    })()`);
  };

  // 1 首页渲染
  await goto('http://localhost:3098/');
  const title = await evalJS('document.title');
  const bodyLen = await evalJS('document.body.innerText.length');
  const hasFab = await evalJS("!!document.querySelector('.fab-chat')");
  await shot('01-首页.png');
  rec('U1 首页渲染 + 悬浮球', title.includes('客服') && hasFab && bodyLen > 100, `title=${title} textLen=${bodyLen} fab=${hasFab}`);

  // 2 代理模式对话（A2 → A1 → TokenHub）
  await setMode('proxy');
  await goto('http://localhost:3098/');
  await evalJS("document.querySelector('.fab-chat').click()");
  await delay(1500);
  const widgetOpen = await evalJS("!!document.querySelector('.chat-widget')");
  rec('U2 客服窗打开', widgetOpen, `chatWidget=${widgetOpen}`);

  await evalJS(`(() => {
    const ta = document.querySelector('.chat-widget textarea') || document.querySelector('textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '用一句话介绍你自己');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return !!ta;
  })()`);
  await delay(300);
  await evalJS("document.querySelector('.send-btn').click()");
  let reply = '';
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    await delay(2000);
    reply = await evalJS("document.querySelector('.chat-widget-body')?.innerText || ''");
    if (reply.includes('混元') || reply.length > 80) break;
  }
  await shot('02-代理模式对话.png');
  rec('U3 代理模式端到端对话', reply.length > 20, `${((Date.now() - t0) / 1000).toFixed(1)}s reply=${reply.slice(0, 120)}`);

  // 3 RAG 模式对话 + 引用来源
  await setMode('rag');
  await goto('http://localhost:3098/');
  await evalJS("document.querySelector('.fab-chat').click()");
  await delay(1500);
  const badge = await evalJS("document.querySelector('.chat-widget-badge')?.innerText || ''");
  await evalJS(`(() => {
    const ta = document.querySelector('.chat-widget textarea') || document.querySelector('textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '企业微信如何获取 access_token？');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return !!ta;
  })()`);
  await delay(300);
  await evalJS("document.querySelector('.send-btn').click()");
  let ragText = '';
  const t1 = Date.now();
  while (Date.now() - t1 < 300000) {
    await delay(3000);
    ragText = await evalJS("document.querySelector('.chat-widget-body')?.innerText || ''");
    if (ragText.includes('引用来源')) break;
  }
  await shot('03-RAG模式对话.png');
  rec('U4 RAG 模式端到端 + 引用来源', ragText.includes('引用来源'),
    `${((Date.now() - t1) / 1000).toFixed(1)}s badge=${badge} 含引用来源=${ragText.includes('引用来源')} text=${ragText.slice(0, 150)}`);

  // 控制台错误收集
  ws.close();
  console.log('\n==== 汇总 ====');
  console.log(`通过 ${results.filter((r) => r.ok).length}/${results.length}`);
  fs.writeFileSync(path.join(OUT, 'ui_result.json'), JSON.stringify(results, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR', e.message);
  process.exit(1);
});
