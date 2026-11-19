// How long a signed-in user waits for the dashboard, on a throttled
// phone-like profile: 4x CPU slowdown, "slow 4G" network, and extra latency
// on every API call (default 250ms ≈ the Philippines → US server hop).
// Reports the median of several runs, for a first visit (nothing cached) and
// a repeat visit (service worker has cached the app).
//
//   node .claude/skills/run-eggfarm/timing.mjs [--dist client/dist] [--runs 3] [--latency 250]
//
// To compare two versions, build each into its own folder
// (npx vite build --outDir <dir>, run inside client/) and pass --dist.
import { launch } from './cdp.mjs';
import { DEFAULT_DIST, startMockApi } from './mock-api.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i === -1 ? fallback : argv[i + 1]; };
const runs = Number(flag('runs', 3));
const dist = flag('dist', DEFAULT_DIST);

// Records (from navigation start) when the first animated figure appears —
// those only render once data has arrived — and when the chart is drawn.
const OBSERVER = `
  window.__marks = {};
  new MutationObserver(() => {
    const m = window.__marks;
    if (!m.figures && document.querySelector('.eggy-number')) m.figures = performance.now();
    if (!m.chart && document.querySelector('.recharts-surface')) m.chart = performance.now();
  }).observe(document, { childList: true, subtree: true });
`;

const mock = await startMockApi({ staticDir: dist, latency: Number(flag('latency', 250)) });
const results = { first: [], repeat: [] };

async function visit(page) {
  await page.send('Page.navigate', { url: `${mock.url}/` });
  const start = Date.now();
  while (Date.now() - start < 40000) {
    const marks = await page.evaluate('window.__marks || {}').catch(() => ({}));
    if (marks.figures && marks.chart) return marks;
    await page.sleep(50);
  }
  throw new Error('dashboard did not finish loading within 40s');
}

try {
  for (let i = 0; i < runs; i++) {
    const page = await launch();
    try {
      await page.setLoginCookie();
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVER });
      await page.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.send('Network.emulateNetworkConditions', {
        offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
      });
      results.first.push(await visit(page));
      // The service worker only caches what it fetched while active, so the
      // second visit fills its cache and the third is the true repeat visit.
      await page.sleep(1500);
      await visit(page);
      await page.sleep(1500);
      results.repeat.push(await visit(page));
    } finally {
      await page.close();
    }
  }
} finally {
  await mock.close();
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const kind of ['first', 'repeat']) {
  const figures = Math.round(median(results[kind].map((m) => m.figures)));
  const chart = Math.round(median(results[kind].map((m) => m.chart)));
  console.log(`${kind === 'first' ? 'first visit ' : 'repeat visit'} → figures ${figures}ms, chart ${chart}ms (median of ${runs})`);
}
