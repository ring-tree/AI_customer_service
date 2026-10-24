// A2 前端异常路径测试：代理/RAG 后端不可达时的错误提示与 loading 收敛
const fs = require('fs');
const path = require('path');
const CDP = 'http://127.0.0.1:9445';
const OUT = __dirname;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const rec = (name, ok, detail) => {
  results.push({ name, ok });
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + ' | ' + String(detail).replace(/\s+/g, ' ').slice(0, 220));
};

async function main() {
  let page;
  for (let i = 0; i < 40; i++) {
    try {
      const t = await (await fetch(CDP + '/json/list')).json();
      page = t.find((x) => x.type === 'page');
      if (page) break;
    } catch {}
    await delay(500);
  }
  if (!page) throw new Error('CDP 未就绪');

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
  const goto = async (url) => {
    await send('Page.navigate', { url });
    await delay(3500);
  };
  const setMode = async (mode, patch) => {
    const settings = Object.assign(
      {
        connectionMode: mode,
        apiBaseUrl: '/tokenhub/v1',
        proxyUrl: 'http://localhost:11434',
        ragUrl: 'http://127.0.0.1:14052',
        model: 'hy3', customModel: '', apiKey: '', stream: true,
        maxTokens: 4096, temperature: 0.7, topP: 0.7,
      },
      patch || {}
    );
    await evalJS(`localStorage.setItem('llm-setting-storage', ${JSON.stringify(
      JSON.stringify({ state: { settings }, version: 6 })
    )}); localStorage.removeItem('llm-chat-storage'); 'ok'`);
  };
  const sendMessage = async (text) => {
    await evalJS("document.querySelector('.fab-chat').click()");
    await delay(1200);
    await evalJS(`(() => {
      const ta = document.querySelector('.chat-widget textarea');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${JSON.stringify(text)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await delay(300);
    await evalJS("document.querySelector('.send-btn').click()");
  };
  const waitText = async (ms) => {
    const t0 = Date.now();
    let txt = '';
    while (Date.now() - t0 < ms) {
      await delay(1000);
      txt = await evalJS("document.querySelector('.chat-widget-body')?.innerText || ''");
      const loading = await evalJS("!!document.querySelector('.thinking-text')");
      if (!loading && txt.length > 20) break;
    }
    return { txt, loading: await evalJS("!!document.querySelector('.thinking-text')"), elapsed: (Date.now() - t0) / 1000 };
  };

  await goto('http://localhost:3098/');

  // 1 代理后端不可达
  await setMode('proxy', { proxyUrl: 'http://127.0.0.1:19999' });
  await goto('http://localhost:3098/');
  await sendMessage('测试后端不可达');
  let r = await waitText(30000);
  const proxyErr = /Failed to fetch|NetworkError|请求错误|连接失败|错误/i.test(r.txt);
  rec('X1 代理不可达：有错误提示且 loading 结束', proxyErr && !r.loading,
    `${r.elapsed}s loading=${r.loading} text=${r.txt.slice(-120)}`);

  // 2 RAG 后端不可达
  await setMode('rag', { ragUrl: 'http://127.0.0.1:19998' });
  await goto('http://localhost:3098/');
  await sendMessage('测试知识服务不可达');
  r = await waitText(30000);
  const ragErr = /Failed to fetch|NetworkError|RAG 请求错误|连接失败|错误/i.test(r.txt);
  rec('X2 RAG 不可达：有错误提示且 loading 结束', ragErr && !r.loading,
    `${r.elapsed}s loading=${r.loading} text=${r.txt.slice(-120)}`);

  // 3 直连模式空 Key：应在前端拦截（不发请求）
  await setMode('direct', { apiKey: '' });
  await goto('http://localhost:3098/');
  await sendMessage('测试空 Key');
  r = await waitText(15000);
  const keyErr = /API Key/.test(r.txt);
  rec('X3 直连空 Key：给出明确提示', keyErr && !r.loading,
    `${r.elapsed}s loading=${r.loading} text=${r.txt.slice(-120)}`);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, '04-异常提示.png'), Buffer.from(shot.data, 'base64'));
  ws.close();
  console.log('\n==== 汇总 ====');
  console.log(`通过 ${results.filter((x) => x.ok).length}/${results.length}`);
  fs.writeFileSync(path.join(OUT, 'ui_error_result.json'), JSON.stringify(results, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR', e.message);
  process.exit(1);
});
