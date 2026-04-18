# MTG Price Tracker

Cardmarket price tracker with ntfy push notifications. Runs on a Samsung Galaxy S9+ under Termux, pushes alerts to any device with the ntfy app installed.

## Status: Iteration 1 — Scraper + Parser

Current goal: prove we can reliably fetch a Cardmarket product page, pass Cloudflare, and extract a clean sorted price list.

Not yet built:
- Persistent price history (SQLite)
- Drop-detection logic + 30-day baseline
- ntfy push notifier
- Cron orchestration
- Termux setup automation

## Setup (dev machine first, not Termux yet)

```bash
cd mtg-price-tracker
npm install
```

Puppeteer will download its own Chromium on first install. On the S9+ later, we'll override this to use the system-installed Chromium from `tur-repo`.

## Testing

### 1. Normal scrape (tries light fetch, falls back to Puppeteer warmup)

```bash
npm run test:scraper
```

Expected output on success: a table of the 10 cheapest Mox Opal listings matching the default filters, plus the 3rd-lowest price (the value the detector will later use as "current").

### 2. Dump raw HTML for selector debugging

```bash
npm run test:dump
```

Saves `data/last-response.html`. Open it in a browser and inspect the actual DOM — if `parser.js` returns 0 listings while the HTML clearly has them, the selectors in `parsePrices()` need tuning.

### 3. Force a warmup

```bash
npm run warmup
```

Runs only the Puppeteer stealth phase to refresh Cloudflare cookies. Call this if you've been getting `cf_block` or `cf_challenge` errors repeatedly.

## Troubleshooting

**`cf_challenge` or `cf_block`:** Cloudflare flagged the light fetch. The warmup should normally run automatically, but if it fails too: `npm run warmup` manually, then retry `test:scraper`.

**0 listings found but HTML looks fine:** Cardmarket changed their DOM. Open `data/last-response.html`, find a listing, copy its surrounding selector, and update `parser.js`. The parser has fallback selectors — add yours to the candidate list.

**Puppeteer fails to launch on Termux:** You need system Chromium:
```bash
pkg install tur-repo
pkg install chromium
export PUPPETEER_EXECUTABLE_PATH=$(which chromium)
export PUPPETEER_SKIP_DOWNLOAD=true
```
Add those exports to `~/.bashrc`.

## Project layout

```
src/scraper/
  cookies.js   # tough-cookie persistence to data/cookies.json
  fetcher.js   # got + browser headers + CF challenge detection
  warmup.js    # puppeteer-extra-stealth → captures CF cookies
  parser.js    # cheerio → price[] with fallback selectors
  index.js     # orchestrator: light fetch → warmup on fail → parse
test-scraper.js
```

## Next iteration

Once the scraper reliably returns sensible prices for a handful of real cards, we add:
- SQLite schema for `scans` and `alerts`
- `detector.js` with 30-day-baseline + 3rd-lowest-price + warmup window logic
- Per-card `alertThresholdPercent` override
