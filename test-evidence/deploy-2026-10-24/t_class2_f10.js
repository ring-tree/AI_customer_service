// X3（F10）：后端挂起（接受连接不响应）→ 测连应 10s 超时并显示中文可读错误
const fs = require('fs');
const path = require('path');
const CDP = 'http://127.0.0.1:9445';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const t = await (await fetch(CDP + '/json/list')).json();
  const page = t.find((x) => x.type === 'page');
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
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result.value;
  };

  await evalJS(`(() => {
    const settings = {
      connectionMode: 'rag',
      apiBaseUrl: '/tokenhub/v1', proxyUrl: 'http://localhost:11434',
      ragUrl: 'http://127.0.0.1:14052', model: 'hy3', customModel: '', apiKey: '', stream: true,
      maxTokens: 4096, temperature: 0.7, topP: 0.7,
    };
    localStorage.setItem('llm-setting-storage', JSON.stringify({ state: { settings }, version: 6 }));
    localStorage.removeItem('llm-chat-storage');
    return 'ok';
  })()`);
  await send('Page.navigate', { url: 'http://localhost:3098/' });
  await delay(4000);
  await evalJS("document.querySelector('.settings-trigger')?.click()");
  await delay(1500);

  const t0 = Date.now();
  await evalJS(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find((b) => b.innerText.includes('测试连接'));
    if (!btn) return 'NO_BTN';
    btn.click(); return 'clicked';
  })()`);
  let errText = '';
  while (Date.now() - t0 < 30000) {
    await delay(1000);
    errText = await evalJS(`document.body.innerText || ''`);
    if (errText.includes('请求超时') || errText.includes('超时')) break;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, '07-F10超时提示.png'), Buffer.from(shot.data, 'base64'));
  const ok = errText.includes('请求超时');
  console.log(`${secs}s | 含「请求超时」=${ok}`);
  console.log((ok ? '[PASS]' : '[FAIL]') + ' X3 F10 后端挂起 → 10s 超时中文提示（面板文本片段: ' +
    (errText.match(/.{0,40}超时.{0,40}/s) || ['(未捕获)'])[0].replace(/\s+/g, ' ') + ')');
  ws.close();
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
