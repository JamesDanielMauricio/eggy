// Drives the Egg Farm Ledger in a headless browser from a script on stdin,
// one command per line. Starts the mock API (port 3000) itself unless
// --no-mock, and stops everything at the end. Stops at the first failing
// command, saving failure.png.
//
//   node .claude/skills/run-eggfarm/driver.mjs [options] <<'EOF'
//   nav /
//   login
//   screenshot dashboard
//   EOF
//
// Options: --out DIR (screenshots; default <tmp>/eggfarm-run)  --app URL (default http://localhost:3000)
//          --no-mock  --latency MS  --width 390  --height 844
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './cdp.mjs';
import { startMockApi } from './mock-api.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i === -1 ? fallback : argv[i + 1]; };
const outDir = path.resolve(flag('out', path.join(os.tmpdir(), 'eggfarm-run')));
const app = flag('app', 'http://localhost:3000').replace(/\/$/, '');
const script = fs.readFileSync(0, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

// `text=Foo` → exact visible text / aria-label, `text^=Foo` → starts with,
// anything else → CSS selector.
const target = (arg) => (arg.startsWith('text^=') ? { textStartsWith: arg.slice(6) } : arg.startsWith('text=') ? { text: arg.slice(5) } : arg);

// Splits off the first token without breaking a selector like
// input[aria-label="Search sales"] at its spaces.
function splitFirst(str) {
  let depth = 0;
  let quote = null;
  let i = 0;
  for (; i < str.length; i++) {
    const c = str[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') depth--;
    else if (/\s/.test(c) && depth === 0) break;
  }
  return [str.slice(0, i), str.slice(i).trim()];
}

const mock = argv.includes('--no-mock') ? null : await startMockApi({ latency: Number(flag('latency', 0)) });
const page = await launch({ width: Number(flag('width', 390)), height: Number(flag('height', 844)) });
if (mock) console.log(`mock API ${mock.url} · ${mock.counts.sales} sales · screenshots → ${outDir}`);

// Each command gets the rest of its line as one raw string.
const commands = {
  nav: async (rest) => page.goto(`${app}${rest.startsWith('/') ? rest : `/${rest}`}`),
  login: async (rest) => {
    const [user = 'demo', pass = 'demo'] = rest ? rest.split(/\s+/) : [];
    await page.waitFor('input[autocomplete="username"]');
    await page.type('input[autocomplete="username"]', user);
    await page.type('input[autocomplete="current-password"]', pass);
    await page.click('button[type="submit"]');
    await page.waitFor('.eggy-number'); // animated figures only render once data has loaded
    await page.mouseAway();
  },
  'login-cookie': async () => page.setLoginCookie(),
  'mouse-away': async () => page.mouseAway(),
  'wait-for': async (rest) => page.waitFor(rest.startsWith('text=') ? { text: rest.slice(5) } : rest),
  click: async (rest) => page.click(target(rest)),
  type: async (rest) => { const [selector, text] = splitFirst(rest); await page.type(selector, text); },
  'type-nth': async (rest) => {
    const [selector, more] = splitFirst(rest);
    const [n, text] = splitFirst(more);
    await page.type(selector, text, Number(n));
  },
  scroll: async (rest) => page.scrollTo(rest),
  'scroll-to': async (rest) => page.evaluate(`document.querySelector(${JSON.stringify(rest)}).scrollIntoView({ block: 'center', behavior: 'instant' })`),
  sleep: async (rest) => page.sleep(Number(rest)),
  viewport: async (rest) => { const [w, h] = rest.split(/\s+/).map(Number); await page.setViewport(w, h); },
  screenshot: async (rest) => console.log(`  saved ${await page.screenshot(path.join(outDir, `${rest || 'screenshot'}.png`))}`),
  eval: async (rest) => console.log(`  ${JSON.stringify(await page.evaluate(rest))}`),
  text: async () => console.log((await page.evaluate('document.body.innerText')).slice(0, 2000).replace(/^/gm, '  ')),
  errors: async () => console.log(`  console errors: ${page.consoleErrors.length ? page.consoleErrors.join(' | ') : 'none'}`),
};

let failed = false;
try {
  for (const line of script) {
    const [name, rest] = splitFirst(line);
    const command = commands[name];
    console.log(`> ${line}`);
    if (!command) throw new Error(`unknown command "${name}" (known: ${Object.keys(commands).join(', ')})`);
    await command(rest);
  }
} catch (err) {
  failed = true;
  console.log(`FAIL: ${err.message}`);
  console.log(`  saved ${await page.screenshot(path.join(outDir, 'failure.png')).catch(() => '(no screenshot)')}`);
} finally {
  if (page.consoleErrors.length) console.log(`console errors: ${page.consoleErrors.join(' | ')}`);
  await page.close();
  await mock?.close();
}
process.exitCode = failed ? 1 : 0;
