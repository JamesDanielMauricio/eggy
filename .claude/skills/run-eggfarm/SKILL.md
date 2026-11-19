---
name: run-eggfarm
description: Run, build, screenshot, smoke-test and time the Egg Farm Ledger (eggfarm) PWA in a headless browser against a mock API. Use when asked to start or launch the app, take screenshots of its UI, check a UI change in a real browser, run the end-to-end smoke test, or measure how fast the dashboard loads. Never start the real server for this — server/.env points at the production database.
---

The Egg Farm Ledger is a React + Vite PWA (`client/`) backed by an Express API
(`server/`). Agents drive the **built client** in headless Edge/Chrome through
`.claude/skills/run-eggfarm/driver.mjs` (commands on stdin), against
`mock-api.mjs` — a fake of the API with seeded sample data. All paths below
are relative to the repo root.

**Do not run `server/` (`npm run dev`, `npm start`, `db:*`) to test UI work:
`server/.env`'s `DATABASE_URL` is the live Neon database.** The mock replaces it.

## Prerequisites

Verified on Windows 11 (Git Bash for the heredocs) with Node 24.14 and the
preinstalled Microsoft Edge 157. Needs Node 22+ (global `WebSocket`/`fetch`)
and any Chromium-based browser — no Playwright, Chrome or chromium-cli. The
driver finds Edge/Chrome in their standard locations; otherwise set
`EGGY_BROWSER=/path/to/browser`.

## Setup

```bash
npm install          # root postinstall also installs server/ and client/
```

## Build

```bash
npm run build --prefix client      # → client/dist (what the mock serves)
```

Rebuild after every client change; the scripts below serve `client/dist`.
For hot reload instead, see "Iterating with hot reload".

## Run (agent path)

**Full regression check** — signs in, records a sale/expense/harvest, edits,
deletes, filters, pages, logs out and back in; 30 checks, exit 0 on success,
screenshots of each screen (~1 min):

```bash
node .claude/skills/run-eggfarm/smoke.mjs
```

**Ad-hoc driving** — pipe commands; the driver starts the mock API on port
3000, runs them in a 390×844 phone viewport, then shuts everything down. It
stops at the first failing command and saves `failure.png`.

```bash
node .claude/skills/run-eggfarm/driver.mjs <<'EOF'
nav /
login
sleep 1200
screenshot dashboard
click text=Records
wait-for input[aria-label="Search sales by description"]
type input[aria-label="Search sales by description"] aling
sleep 600
eval document.querySelectorAll('.eggy-card-flush').length
screenshot records-search
errors
EOF
```

Screenshots land in `<tmp>/eggfarm-run/` (the driver prints the full path;
`smoke.mjs` uses `<tmp>/eggfarm-run/smoke/`); `--out DIR` overrides. **Look at
them** — a passing run can still render wrong.

| command | does |
|---|---|
| `nav [/path]` | load the app (default `/`) |
| `login [user pass]` | fill the sign-in form (default `demo demo`), wait for the dashboard, move the mouse away |
| `login-cookie` | set the session cookie instead (then `nav /` lands signed in) |
| `wait-for <css>` / `wait-for text=<text>` | wait up to 15s; text match is case-insensitive |
| `click <css>` / `click text=<label>` / `click text^=<prefix>` | click by selector, exact visible text or aria-label (`text=Add Sale` = tab), or prefix (`text^=Unpaid` for "Unpaid (3)") |
| `type <css> <text>` / `type-nth <css> <n> <text>` | replace a field's value (React-safe) |
| `scroll <y>` / `scroll-to <css>` · `sleep <ms>` · `viewport <w> <h>` · `mouse-away` | as named |
| `screenshot <name>` | viewport PNG → `<out>/<name>.png` |
| `eval <js>` · `text` · `errors` | print a JS result / the visible text / console errors |

Options: `--app URL` (default `http://localhost:3000`), `--no-mock`,
`--latency MS` (delay every API call), `--width`/`--height`, `--out DIR`.

**Load-time measurement** — throttled phone profile (4× CPU, slow 4G, 250 ms
per API call); prints medians for a first and a repeat visit (~2 min):

```bash
node .claude/skills/run-eggfarm/timing.mjs --runs 3
```

To compare versions, build each with `npx vite build --outDir <dir>` (run in
`client/`) and pass `--dist <dir>`. Reference (Nov 2026 build): first visit
figures ≈3.6 s, repeat visit ≈0.67 s.

**Pure logic, no browser** — `client/src/lib/{format,periods,rows,salePricing}.js`
import cleanly in Node:

```bash
node -e "import('./client/src/lib/format.js').then((m) => console.log(m.formatTrays(331)))"
```

### Iterating with hot reload

Run Vite in the background (port 5173), then point the driver at it — the
driver's mock still serves the API on 3000 and allows the cross-origin calls:

```bash
npm run dev --prefix client        # background; ready when :5173 answers
node .claude/skills/run-eggfarm/driver.mjs --app http://localhost:5173 <<'EOF'
nav /
login
screenshot dev-dashboard
EOF
```

Stop Vite afterwards (PowerShell; it listens on IPv6 `localhost`, which port
lookups miss, so match the command line):

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*vite*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

## Run (human path)

```bash
node .claude/skills/run-eggfarm/mock-api.mjs   # → open http://localhost:3000, log in demo / demo. Ctrl-C to stop.
```

## Test

```bash
npm test --prefix client    # 34 pass — node --test, pure logic
npm test --prefix server    # 16 pass — runs tsc first; the DB module is mocked
```

## Gotchas

- **`client/.env` sets `VITE_API_URL=http://localhost:3000`, and Vite bakes it
  into production builds too**, so a locally built `client/dist` always calls
  port 3000. That's why the mock serves both the files and the API on 3000.
  (Vercel has no `.env`, so the live build uses relative `/api`.)
- **Clicks only land once the target is still, uncovered and the page isn't
  wider than its layout.** `cdp.mjs` waits for all three. Two app bugs (fixed
  Nov 2026; `smoke.mjs` fails if either comes back) made clicks silently miss:
  rows gliding into place were drawn over a just-opened editor's Save/Cancel
  for ~0.5 s, and the login ↔ dashboard slide-in (`x: 14px → 0`) stuck out
  past the screen, so the mobile viewport widened (innerHeight 844 → 875) and
  a click aimed by CSS position hit the form beside the button. To detect
  overflow compare `scrollWidth` with `clientWidth`: `innerWidth` grows along
  with the page, so `scrollWidth > innerWidth` never fires. Moving elements
  can still cover targets — replicate the wait if you write your own clicks.
- **`innerText` applies CSS `text-transform`**: "Net profit" reads
  "NET PROFIT", hence case-insensitive text waits.
- **React inputs ignore `el.value = …`** — use `type` (CDP `Input.insertText`).
- **Never full-page screenshot**: `captureBeyondViewport` restarts the chart's
  grow-in animation (the plot comes out empty) and paints the fixed tab bar
  mid-page. Scroll, then take viewport shots. (Real window resizes don't
  restart the animation — verified.)
- **The virtual mouse stays where it last clicked**; after signing in that is
  over the chart, so screenshots show an open tooltip. `login` moves it away.
- **Edge lists hidden internal pages (a sync dialog) as `page` targets** — the
  driver opens its own tab rather than taking the first one.
- **Sample data ends yesterday on purpose**: Records sort by entry time
  (`createdAt`), so a sample row stamped later than "now" would sit above a
  sale you just added.
- **Egg-size chips are visually hidden radios** — click the visible label:
  `X-Small`/`X-Large` at phone width, `Extra Small`/`Extra Large` from 640 px.
- **The service worker caches only what it fetched while active**, so the true
  "repeat visit" in `timing.mjs` is the third load.

## Troubleshooting

- **`Error: listen EADDRINUSE: address already in use :::3000`** — a previous
  mock (or the real dev server) still holds port 3000. Find it by command
  line, not by port (`netstat`/`Get-NetTCPConnection` missed it):
  `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*mock-api.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
- **A step "passes" but nothing happened** (form still open, still on sign-in)
  — the click hit something else mid-animation. Use `click` from `cdp.mjs`, or
  `wait-for` the settled state before acting.
