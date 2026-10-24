// X1 复检（F8）：全新用户打开设置面板，默认勾选应为「模型网关」(proxy)
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

  await evalJS(`localStorage.clear(); 'ok'`);
  await send('Page.navigate', { url: 'http://localhost:3098/' });
  await delay(4000);
  await evalJS("document.querySelector('.settings-trigger')?.click()");
  await delay(1200);
  const labels = await evalJS(`(() => {
    return Array.from(document.querySelectorAll('.mode-btn')).map((b) => ({
      text: b.innerText.replace(/\\s+/g, ' ').trim(),
      active: b.className.includes('active'),
    }));
  })()`);
  const checked = (labels || []).find((r) => r.active);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, '05-F8默认模式-设置面板.png'), Buffer.from(shot.data, 'base64'));
  console.log('mode-btns:', JSON.stringify(labels), '| active =', checked ? checked.text : '(none)');
  const ok = !!checked && /网关|proxy/i.test(String(checked.text));
  console.log((ok ? '[PASS]' : '[FAIL]') + ' X1 F8 默认连接模式 = proxy（模型网关）');
  ws.close();
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
