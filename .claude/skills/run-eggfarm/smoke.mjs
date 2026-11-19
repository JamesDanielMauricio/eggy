// End-to-end smoke test of the Egg Farm Ledger: drives every main flow in a
// headless phone-sized browser against the mock API, asserts on the result
// and screenshots each screen. Exit code 0 = every check passed.
//
//   node .claude/skills/run-eggfarm/smoke.mjs [--out DIR] [--dist client/dist]
import os from 'node:os';
import path from 'node:path';
import { launch } from './cdp.mjs';
import { DEFAULT_DIST, startMockApi } from './mock-api.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i === -1 ? fallback : argv[i + 1]; };
const outDir = path.resolve(flag('out', path.join(os.tmpdir(), 'eggfarm-run', 'smoke')));

const mock = await startMockApi({ staticDir: flag('dist', DEFAULT_DIST) });
const page = await launch();
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};
const shot = (name) => page.screenshot(path.join(outDir, `${name}.png`));
const bodyText = () => page.evaluate('document.body.innerText');
const rows = () => page.evaluate('document.querySelectorAll(".eggy-card-flush").length');
// The number in a segmented-control button such as "Unpaid (3)".
const countIn = async (label) => Number(await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim().startsWith(${JSON.stringify(label)}))?.innerText.match(/\\((\\d+)\\)/)?.[1]`));
const inputValue = (selector, i = 0) => page.evaluate(`document.querySelectorAll(${JSON.stringify(selector)})[${i}]?.value`);

try {
  // Sign in: wrong password first, then the right one.
  await page.goto(`${mock.url}/`);
  await page.waitFor({ text: 'Sign in' });
  await shot('01-login');
  await page.type('input[autocomplete="username"]', 'demo');
  await page.type('input[autocomplete="current-password"]', 'wrong');
  await page.click('button[aria-label="Show password"]');
  check('show-password reveals the password', (await page.evaluate('document.querySelector("input[autocomplete=current-password]").type')) === 'text');
  await page.click('button[type="submit"]');
  await page.waitFor({ text: 'Wrong username or password' });
  check('a wrong password is rejected', true);
  await page.type('input[autocomplete="current-password"]', 'demo');
  await page.click('button[type="submit"]');
  await page.waitFor('.eggy-number');
  check('signing in opens the dashboard', true);
  await page.waitFor('.recharts-surface');
  check('the trend chart loads (separate recharts chunk)', true);
  await page.mouseAway();
  await page.sleep(1200);
  await shot('02-dashboard');

  // Dashboard controls.
  await page.click({ text: 'Week' });
  await page.sleep(600);
  check('the chart switches to weekly', await page.evaluate(`[...document.querySelectorAll('button[aria-pressed="true"]')].some((b) => b.innerText.trim() === 'Week')`));
  const today = await inputValue('input[aria-label="Selected day"]');
  check('"next day" is disabled on today', await page.evaluate('document.querySelector("button[aria-label=\\"Next day\\"]").disabled'));
  await page.click('button[aria-label="Previous day"]');
  await page.sleep(300);
  const [y, m, d] = today.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  check('"previous day" steps back one day', (await inputValue('input[aria-label="Selected day"]')) === yesterday);

  // Record a sale: 10 trays of Large at ₱230 a tray.
  await page.click({ text: 'Add Sale' });
  await page.waitFor({ text: 'Record a Sale' });
  await page.click({ text: 'Large' });
  await page.type('input[inputmode="numeric"]', '10', 0);
  await page.type('input[inputmode="decimal"]', '230', 1);
  await page.sleep(300);
  check('the egg count shows beside Quantity', (await bodyText()).includes('= 300 eggs'));
  const submitLabel = await page.evaluate('document.querySelector("button[type=submit]").innerText');
  check('the submit button shows the total', submitLabel.includes('₱2,300.00'), submitLabel.trim());
  await shot('03-add-sale');
  await page.click('button[type="submit"]');
  await page.waitFor({ text: 'Sale recorded.' });
  check('saving a sale confirms it', true);
  check('the form clears for the next sale', (await inputValue('input[inputmode="numeric"]')) === '');

  // Records: newest first, paging, filters, mark paid, search.
  await page.click({ text: 'Records' });
  await page.waitFor('input[aria-label="Search sales by description"]');
  await page.sleep(900);
  await shot('04-records');
  const first = await page.evaluate('document.querySelector(".eggy-card-flush").innerText');
  check('the new sale is listed first', first.includes('Large · 10 trays') && first.includes('₱2,300.00'), first.split('\n')[0]);
  check('records show 30 rows at a time', (await rows()) === 30, `${await rows()} rows`);
  await page.click({ textStartsWith: 'Show 30 more' });
  await page.sleep(800);
  check('"Show more" adds the next 30', (await rows()) === 60, `${await rows()} rows`);
  await page.scrollTo(0);
  const unpaid = await countIn('Unpaid');
  await page.click({ textStartsWith: 'Unpaid' });
  await page.sleep(600);
  check('the Unpaid filter lists only unpaid sales', (await rows()) === unpaid, `${await rows()} rows, filter says ${unpaid}`);
  if (unpaid > 0) {
    await page.click({ text: 'Mark as paid' });
    await page.sleep(1000);
    check('"Mark as paid" settles a sale', (await countIn('Unpaid')) === unpaid - 1);
  }
  await page.click({ textStartsWith: 'All' });
  await page.sleep(500);
  await page.type('input[aria-label="Search sales by description"]', 'aling');
  await page.sleep(600);
  const matches = await page.evaluate('[...document.querySelectorAll(".eggy-card-flush")].map((r) => r.innerText.toLowerCase())');
  check('search keeps only matching sales', matches.length > 0 && matches.every((r) => r.includes('aling')), `${matches.length} matches`);
  await page.click('button[aria-label="Clear search"]');
  await page.sleep(500);

  // Edit the new sale, then delete it. Watches every frame of the editor's
  // first second: the rows below glide down into place, and they used to be
  // drawn over its Save button while they did (taps landed on a row).
  await page.evaluate(`(() => {
    window.__covered = 0; window.__sampled = 0;
    const until = performance.now() + 1200;
    let scrolled = false;
    const tick = () => {
      const save = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Save Changes');
      if (save) {
        if (!scrolled) { save.scrollIntoView({ block: 'center', behavior: 'instant' }); scrolled = true; }
        const r = save.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        window.__sampled++;
        if (hit && !save.contains(hit)) window.__covered++;
      }
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  await page.click('button[aria-label="Edit entry"]');
  await page.waitFor({ text: 'Edit Sale' });
  await page.sleep(1300); // let the frame sampler finish
  const cover = await page.evaluate('({ covered: window.__covered, sampled: window.__sampled })');
  check('rows sliding into place never cover the editor\'s Save button', cover.sampled > 0 && cover.covered === 0, `${cover.covered} of ${cover.sampled} frames covered`);
  await page.type('input[maxlength="500"]', 'Edited by smoke test');
  await page.click({ text: 'Save Changes' });
  await page.waitFor({ text: 'Edited by smoke test' });
  await page.sleep(500);
  check('editing saves and closes the editor', !(await bodyText()).includes('Edit Sale'));
  const salesBefore = await countIn('Sales');
  await page.click('button[aria-label="Delete entry"]');
  await page.waitFor({ text: 'Delete this entry?' });
  await shot('05-confirm-delete');
  await page.click({ text: 'Delete' });
  await page.sleep(1200);
  const salesAfter = await countIn('Sales');
  check('confirming delete removes the sale', salesAfter === salesBefore - 1 && !(await bodyText()).includes('Edited by smoke test'), `${salesBefore} → ${salesAfter}`);
  for (const tab of ['Expenses', 'Harvests']) {
    await page.click({ textStartsWith: tab });
    await page.sleep(800);
    check(`the ${tab.toLowerCase()} list renders`, (await rows()) > 0);
  }

  // Record an expense and a harvest.
  await page.click({ text: 'Add Expense' });
  await page.waitFor({ text: 'Record an Expense' });
  await page.click({ text: 'Fly Trap' });
  await page.type('input[inputmode="numeric"]', '2', 0);
  await page.type('input[inputmode="decimal"]', '150', 0);
  await page.sleep(200);
  check('the expense total follows the unit price', (await inputValue('input[inputmode="decimal"]', 1)) === '300.00');
  await shot('06-add-expense');
  await page.click('button[type="submit"]');
  await page.waitFor({ text: 'Expense recorded.' });
  check('saving an expense confirms it', true);
  await page.click({ text: 'Add Harvest' });
  await page.waitFor({ text: 'Record a Harvest' });
  await page.type('input[inputmode="numeric"]', '34', 0);
  await page.type('input[inputmode="numeric"]', '12', 3);
  await page.sleep(200);
  const harvestLabel = await page.evaluate('document.querySelector("button[type=submit]").innerText');
  check('the harvest button shows the good-egg count', harvestLabel.includes('1,008 good'), harvestLabel.trim());
  await shot('07-add-harvest');
  await page.click('button[type="submit"]');
  await page.waitFor({ text: 'Harvest recorded.' });
  check('saving a harvest confirms it', true);

  // Log out and back in: the dashboard must load fresh data. Watches every
  // frame for the page growing wider than the screen — the login ↔
  // dashboard slide-in used to stick out 14px, which zooms phones out.
  await page.evaluate(`(() => {
    window.__overflow = 0;
    const until = performance.now() + 4000;
    const tick = () => {
      const root = document.documentElement;
      window.__overflow = Math.max(window.__overflow, root.scrollWidth - root.clientWidth);
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  await page.click({ text: 'Log out' });
  await page.waitFor({ text: 'Sign in' });
  check('logging out returns to sign-in', true);
  await page.type('input[autocomplete="username"]', 'demo');
  await page.type('input[autocomplete="current-password"]', 'demo');
  await page.click('button[type="submit"]');
  await page.waitFor('.eggy-number');
  await page.sleep(600); // let the dashboard's slide-in finish inside the sampling window
  const overflow = await page.evaluate('window.__overflow');
  check('logging out and in never makes the page wider than the screen', overflow === 0, `${overflow}px too wide at worst`);
  await page.click({ text: 'Records' });
  await page.waitFor('input[aria-label="Search sales by description"]');
  await page.sleep(600);
  check('signing back in loads current data', (await countIn('Sales')) === salesAfter);
  check('no console errors', page.consoleErrors.length === 0, page.consoleErrors.join(' | '));
} catch (err) {
  failures++;
  console.log(`FAIL  ${err.message}`);
  await shot('zz-failure').catch(() => {});
} finally {
  await page.close();
  await mock.close();
}
console.log(`\n${failures ? `${failures} check(s) failed` : 'all checks passed'} · screenshots in ${outDir}`);
process.exitCode = failures ? 1 : 0;
