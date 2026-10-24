// A2 阶段2补充用例（Chrome CDP）：F8 默认模式 / F3 附件进对话
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
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  };
  const goto = async (url) => {
    await send('Page.navigate', { url });
    await delay(4000);
  };
  const typeAndSend = async (text) => {
    await evalJS(`(() => {
      const ta = document.querySelector('.chat-widget textarea') || document.querySelector('textarea');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${JSON.stringify(text)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return !!ta;
    })()`);
    await delay(300);
    await evalJS("document.querySelector('.send-btn').click()");
  };
  const waitReply = async (marker, timeoutMs) => {
    let text = '';
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      await delay(2000);
      text = await evalJS("document.querySelector('.chat-widget-body')?.innerText || ''");
      if (marker(text)) break;
    }
    return { text, secs: ((Date.now() - t0) / 1000).toFixed(1) };
  };

  // ---- X1（F8）：全新用户（清空 localStorage）默认 proxy，直接发消息即可成功 ----
  await evalJS(`localStorage.clear(); 'ok'`);
  await goto('http://localhost:3098/');
  await evalJS("document.querySelector('.fab-chat').click()");
  await delay(1200);
  const mode = await evalJS(
    `(JSON.parse(localStorage.getItem('llm-setting-storage') || '{}').state?.settings?.connectionMode) || '(未持久化)'`
  );
  await typeAndSend('请只回复两个字：收到');
  const x1 = await waitReply((t) => t.includes('收到') && t.length > 30, 120000);
  await shot('05-F8默认代理模式.png');
  rec('X1 F8 默认模式=proxy 且免配置可聊', mode === 'proxy' && x1.text.includes('收到'),
    `mode=${mode} ${x1.secs}s reply=${x1.text.slice(0, 100)}`);

  // ---- X2（F3）：.txt 附件内容进入对话（回答须含附件中的口令） ----
  await evalJS(`(() => {
    const input = document.querySelector('input[type=file][accept=".txt,.md,.csv"]');
    if (!input) return 'NO_INPUT';
    const dt = new DataTransfer();
    dt.items.add(new File(['内部工单：重置密码口令是 ZX-9527，请勿外传。'], '工单.txt', { type: 'text/plain' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.files.length;
  })()`);
  await delay(1000); // 等 file.text() 读完
  const hasCard = await evalJS("!!document.querySelector('.file-preview, .preview-item')");
  await typeAndSend('附件里的重置密码口令是什么？只回答口令本身。');
  const x2 = await waitReply((t) => t.includes('ZX-9527'), 120000);
  await shot('06-F3附件进对话.png');
  rec('X2 F3 文本附件内容进入模型对话', x2.text.includes('ZX-9527'),
    `附件卡片=${hasCard} ${x2.secs}s 含口令=${x2.text.includes('ZX-9527')} reply=${x2.text.slice(0, 120)}`);

  ws.close();
  console.log('\n==== 汇总 ====');
  console.log(`通过 ${results.filter((r) => r.ok).length}/${results.length}`);
  fs.writeFileSync(path.join(OUT, 'ui_extra_result.json'), JSON.stringify(results, null, 2));
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((e) => {
  console.error('ERROR', e.message);
  process.exit(1);
});
