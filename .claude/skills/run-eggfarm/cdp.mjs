// Minimal Chrome DevTools Protocol client for driving the Egg Farm Ledger in
// a headless Chromium-based browser (Edge or Chrome) — no Playwright needed.
// Requires Node 22+ (global WebSocket and fetch).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BROWSER_CANDIDATES = [
  process.env.EGGY_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

export function findBrowser() {
  const found = BROWSER_CANDIDATES.find((candidate) => candidate && fs.existsSync(candidate));
  if (!found) throw new Error('No Edge/Chrome/Chromium found. Set EGGY_BROWSER to the browser executable.');
  return found;
}

// Launches a fresh headless browser (throwaway profile) and returns a page
// handle. Defaults to an iPhone-sized viewport, since the app is phone-first.
export async function launch({ width = 390, height = 844, dpr = 2, mobile = true } = {}) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eggfarm-browser-'));
  const args = [
    '--headless=new',
    // Port 0 = the browser picks a free port and writes it to
    // DevToolsActivePort in the profile, so parallel runs never collide.
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', '--force-color-profile=srgb',
  ];
  // Untested here: Chromium usually refuses to start as root in a Linux
  // container without this.
  if (process.platform === 'linux') args.push('--no-sandbox');
  const proc = spawn(findBrowser(), [...args, 'about:blank'], { stdio: 'ignore' });

  let port;
  for (let i = 0; i < 300 && !port; i++) {
    try {
      port = Number(fs.readFileSync(path.join(profileDir, 'DevToolsActivePort'), 'utf8').split('\n')[0]) || undefined;
    } catch { /* not written yet */ }
    if (!port) await sleep(100);
  }
  if (!port) { proc.kill(); throw new Error('Browser did not start (no DevToolsActivePort after 30s)'); }

  // Edge lists hidden internal pages (e.g. edge://sync-confirmation-dialog)
  // as "page" targets too, so open a dedicated tab instead of picking one.
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
      if (res.ok) target = await res.json();
    } catch { /* endpoint not ready */ }
    if (!target) await sleep(100);
  }
  if (!target) { proc.kill(); throw new Error('Could not open a browser tab over DevTools'); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const pending = new Map();
  const consoleErrors = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data || ''}`.trim()));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      consoleErrors.push(d.exception?.description || d.text);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  let viewport = { width, height };

  // `what` is a CSS selector, { text } (exact visible text or aria-label of a
  // button/link/label/input) or { textStartsWith } (e.g. "Unpaid" for the
  // "Unpaid (3)" filter).
  const finder = (what) => {
    if (typeof what === 'string') return `document.querySelector(${JSON.stringify(what)})`;
    const pool = `[...document.querySelectorAll('button, a, label, summary, [role=button], input, select')]`;
    if (what.textStartsWith) return `${pool}.find((el) => el.innerText?.trim().startsWith(${JSON.stringify(what.textStartsWith)}))`;
    return `${pool}.find((el) => el.innerText?.trim() === ${JSON.stringify(what.text)} || el.getAttribute('aria-label') === ${JSON.stringify(what.text)})`;
  };

  return {
    send,
    evaluate,
    consoleErrors,
    sleep,
    get viewport() { return viewport; },
    async goto(url) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 200; i++) {
        if ((await evaluate('document.readyState').catch(() => '')) === 'complete') return;
        await sleep(50);
      }
    },
    async setViewport(w, h) {
      viewport = { width: w, height: h };
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
    },
    // Skips the sign-in form: the mock API treats `token=demo` as logged in.
    async setLoginCookie() {
      await send('Network.setCookie', { name: 'token', value: 'demo', domain: 'localhost', path: '/' });
    },
    // A selector, or { text } matched case-insensitively against the page's
    // visible text — innerText applies CSS text-transform, so "Net profit"
    // styled uppercase reads as "NET PROFIT".
    async waitFor(what, timeout = 15000) {
      const check = typeof what === 'string'
        ? `!!document.querySelector(${JSON.stringify(what)})`
        : `!!document.body && document.body.innerText.toLowerCase().includes(${JSON.stringify(what.text.toLowerCase())})`;
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await evaluate(check).catch(() => false)) return;
        await sleep(50);
      }
      throw new Error(`timed out after ${timeout}ms waiting for ${JSON.stringify(what)}`);
    },
    // Real mouse events at the element's centre (after scrolling it into
    // view), so React handlers, :active styles and motion's tap logic all fire.
    //
    // Waits first until the target is (a) still — same position on two
    // checks 50ms apart, (b) not covered at its centre, and (c) the page is
    // no wider than its layout width. All three bit us: rows gliding into
    // place were drawn over a just-opened editor's Save button for ~0.5s; and
    // a slide-in that sticks out past the screen edge widens the mobile
    // viewport (innerWidth AND scrollWidth both jump, so compare scrollWidth
    // with clientWidth, which stays put), and a click aimed by CSS position
    // lands beside the button instead.
    async click(what, timeout = 5000) {
      const probe = `(() => {
        const el = ${finder(what)};
        if (!el) return null;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        const x = r.x + r.width / 2, y = r.y + r.height / 2;
        const top = document.elementFromPoint(x, y);
        const root = document.documentElement;
        return { x, y, covered: !(top === el || el.contains(top)), overflow: root.scrollWidth > root.clientWidth };
      })()`;
      const start = Date.now();
      let last = null;
      while (Date.now() - start < timeout) {
        const box = await evaluate(probe);
        if (box && last && !box.covered && !box.overflow && Math.abs(box.x - last.x) < 0.5 && Math.abs(box.y - last.y) < 0.5) {
          for (const type of ['mousePressed', 'mouseReleased']) {
            await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
          }
          return;
        }
        last = box;
        await sleep(50);
      }
      throw new Error(last ? `${JSON.stringify(what)} never settled (covered: ${last.covered}, page too wide: ${last.overflow})` : `nothing to click for ${JSON.stringify(what)}`);
    },
    // Focuses the nth match, selects its content and types over it.
    // Input.insertText goes through the browser's input pipeline, so React's
    // onChange fires — assigning `el.value` would not.
    async type(selector, text, index = 0) {
      const found = await evaluate(`(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); el.focus(); el.select?.(); return true; })()`);
      if (!found) throw new Error(`no element #${index} for ${selector}`);
      await send('Input.insertText', { text });
    },
    async scrollTo(y) { await evaluate(`window.scrollTo({ top: ${Number(y)}, behavior: 'instant' })`); },
    // The virtual mouse stays where it last clicked. After signing in, that
    // spot is over the chart, so screenshots catch an open tooltip unless the
    // pointer is moved off first.
    async mouseAway() { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 }); },
    // Viewport only. Full-page capture resizes the page, which restarts the
    // chart's grow-in animation and leaves the plot empty in the image.
    async screenshot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    async close() {
      ws.close();
      try {
        const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        const browserWs = new WebSocket(webSocketDebuggerUrl);
        await new Promise((resolve) => { browserWs.onopen = resolve; browserWs.onerror = resolve; });
        browserWs.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
        await sleep(400);
      } catch { /* already gone */ }
      proc.kill();
      // The browser can hold profile files for a moment after exit.
      for (let i = 0; i < 10; i++) {
        try { fs.rmSync(profileDir, { recursive: true, force: true }); break; } catch { await sleep(200); }
      }
    },
  };
}
