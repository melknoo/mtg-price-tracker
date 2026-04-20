# CLAUDE.md

Context for Claude Code sessions on this project. Read this **first** every session.

## Project

**MTG Price Tracker for Cardmarket.** Watches a user-defined list of Magic: The Gathering cards on cardmarket.com under specific filters (seller country, reputation, language, condition, etc.) and sends push notifications to the user's phone via **ntfy** when a card's current lowest price drops meaningfully below its rolling 30-day baseline.

## Deployment Target

- **Tracker host**: Samsung Galaxy S9+ (Snapdragon 845, 6 GB RAM, Android) running **Termux** with Node.js
- **Notification receiver**: User's primary Android phone, ntfy app subscribed to a private topic
- **Network model**: Tracker makes only outbound HTTPS calls (Cardmarket + ntfy.sh). No port forwarding, no dynamic DNS, no VPN. Both Android devices can be behind CGNAT.

## Architecture

```
[S9+ @ Home, hourly cron]
    │
    ├─▶ browser.js (puppeteer-extra-stealth → HTML)
    │
    ├─▶ parser.js (cheerio → price[], defensive fallback selectors)
    │
    ├─▶ storage (SQLite: scans, alerts)                 [iteration 2]
    │
    ├─▶ detector.js (30-day baseline, robust "current", cooldown)  [iteration 3]
    │
    └─▶ notifier.js (HTTP POST to ntfy.sh/{topic})      [iteration 4]
                │
                └─▶ [User's phone, anywhere on the planet]
```

## Tech Stack

- **Runtime**: Node.js ≥20, pure ESM (`"type": "module"`). No TypeScript (keep it lean for Termux).
- **Browser fetch**: `puppeteer-extra` + `puppeteer-extra-plugin-stealth` — jede Anfrage läuft direkt über Chromium (kein got/cookie-layer mehr)
- **HTML parsing**: `cheerio`
- **Storage**: `better-sqlite3`
- **Push**: `ntfy.sh`, single HTTP POST per alert via native `fetch` (Node 18+)

## Iteration Plan

| # | Phase                                            | Status                        |
| - | ------------------------------------------------ | ----------------------------- |
| 1 | Scraper + Parser                                 | ✅ done                        |
| 2 | SQLite storage + `npm run history` CLI           | ✅ done                        |
| 3 | Detector: baseline + drop detection + cooldown   | ✅ done                        |
| 4 | ntfy notifier                                    | ✅ done                        |
| 5 | Cron orchestration + `config.json` loader        | not started                   |
| 6 | Termux deployment automation                     | not started                   |

**Rule**: do not start iteration N+1 before N runs end-to-end on the user's dev machine.

## Status Iteration 1 + 2 + 3 + 4

Iteration 1 abgeschlossen: `browser.js` ruft URLs direkt über Puppeteer-Stealth ab. Cloudflare-Pass bestätigt auf Dev-Rechner und S9+.

Iteration 2 abgeschlossen: SQLite-Storage + `npm run history` CLI funktionieren end-to-end auf Dev-Rechner.

Iteration 3 abgeschlossen: Detector + alerts-Tabelle + `npm run test:detector` (5/5 Tests grün) auf Dev-Rechner validiert.

Iteration 4 abgeschlossen: ntfy-Notifier implementiert. `npm run test:notify` sendet Test-Push via `fetch` (native Node 18+). `dispatchPendingAlerts()` verarbeitet alle offenen DB-Alerts und setzt `notified = 1`. Kein neuer Dependency nötig.

## Code Conventions

- **Language**: communicate with the user **in German**. Code, comments, commit messages, READMEs, variable names, file names: **English**.
- **Style**: ESM imports, `async/await`, no classes where a module of functions suffices.
- **Defensive parsing**: HTML selectors use a **candidate fallback array** — Cardmarket reshuffles DOM occasionally. The parser returns `diagnose()` metadata (title, row counts per selector) so regressions are obvious.
- **Error shape**: Low-level functions (`fetchPage`) return normalized `{ ok, reason, ... }` objects for *expected* failures (403, challenge, http_error). Only *unexpected* failures (network error, missing binary) throw.
- **Persistence**: All runtime state lives under `data/` (gitignored). Source under `src/`. No state in the repo root.
- **Dependencies**: Keep the list short. Every `npm install` on Termux is painful — think twice before adding anything.

## Key Files

```
src/scraper/
  browser.js    puppeteer-extra-stealth fetch → { ok, html, ... }
  parser.js     cheerio → price[] with fallback selectors + diagnose()
  index.js      orchestrator: scrapeCard(card) → { name, cardSlug, prices, scrapedAt, raw }
                slugFromUrl(url) → "set-name/card-name" slug
src/storage/
  schema.sql    idempotent CREATE TABLE IF NOT EXISTS (scans, scan_listings, alerts)
  db.js         getDb(), initDb(), closeDb(), _setTestDb() — better-sqlite3 singleton
  scans.js      insertScan(), getRecentScans(cardSlug, limit), listCardSlugs()
src/detector/
  detector.js   detectDrop(scanId, options) → rich result object
                Constants (exported): DEFAULT_THRESHOLD_PERCENT=15, WARMUP_HOURS=48,
                COOLDOWN_HOURS=12, COOLDOWN_PRICE_DELTA_PCT=5, BASELINE_DAYS=30
  alerts.js     insertAlert(), getLastAlert(cardSlug), getPendingAlerts(), markAlertNotified()
src/notifier/
  ntfy.js       sendAlert(alert, options) → { success, error? } — HTTP POST to ntfy.sh
  dispatcher.js dispatchPendingAlerts(options) → { processed, sent, failed[] }
                reads DB alerts (notified=0), sends via ntfy, marks notified=1
test-scraper.js CLI for iteration 1+2+3+4. Flags: --dump-html, --persist
test-detector.js Simulation CLI: in-memory DB, 5 test cases, no real scraping
test-notifier.js CLI: manual ntfy test. Args: [topic] [--dry-run]
history.js      CLI: npm run history [slug] [limit]

ntfy Topic für Production: kryptisch-zufällig wählen, z.B. mtg-tracker-k8m3p9x2
(wird in iteration 5 in config.json konfigurierbar)
```

## Commands

```bash
npm install                       # Puppeteer downloads ~/.cache/puppeteer/chromium; better-sqlite3 compiles natively
npm run test:scraper              # full pipeline against hardcoded test card (Mox Opal)
npm run test:dump                 # save raw HTML to data/last-response.html
npm run test:persist              # scrape + persist + run detector
npm run test:detector             # 5 in-memory detector test cases (no scraping needed)
npm run test:notify               # send fake alert to ntfy topic 'mtg-tracker-dev'
npm run test:notify my-topic      # send to custom topic
npm run test:notify my-topic --dry-run  # show params, don't send
npm run history                   # overview: last 3 scans per card
npm run history modern-masters-2015/mox-opal        # last 10 scans for card
npm run history modern-masters-2015/mox-opal 20     # last 20 scans
WARMUP_HEADFUL=1 npm run test:scraper  # sichtbares Chromium via WSLg
```

### System deps on WSL/Ubuntu

Puppeteer's bundled Chromium needs these, not present by default:

```
libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2
libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2
libgbm1 libpango-1.0-0 libcairo2 libasound2t64
```

Use `libasound2` instead of `libasound2t64` on Ubuntu < 24.04.

### Termux (S9+) — for iteration 6

```bash
pkg install tur-repo
pkg install chromium
# in ~/.bashrc:
export PUPPETEER_EXECUTABLE_PATH=$(which chromium)
export PUPPETEER_SKIP_DOWNLOAD=true
```

Plus Samsung-specific: exclude Termux from battery optimization AND add to "Apps that never go to sleep" in Device Care.

## Card Config Schema *(planned, iteration 5)*

```json
{
  "defaults": {
    "filters": "sellerCountry=7&sellerReputation=1&language=1,3&minCondition=4&isSigned=N&isAltered=N",
    "alertThresholdPercent": 10,
    "alertCooldownHours": 12
  },
  "cards": [
    {
      "name": "Mox Opal",
      "url": "https://www.cardmarket.com/en/Magic/Products/Singles/Modern-Masters-2015/Mox-Opal",
      "alertThresholdPercent": 15
    }
  ]
}
```

Per-card fields override `defaults`. User pastes the product URL directly from their browser; filters appended as query string.

## Detector Logic *(iteration 3, done)*

```
baseline = MIN( third_lowest_price_per_scan ) over last 30 days
current  = third_lowest_price of most recent scan (fallback: lowest_price)
drop_pct = (baseline - current) / baseline * 100

skipped conditions (no alert):
  - no_history:  zero prior scans for this slug
  - warmup:      oldest history scan < 48h ago (WARMUP_HOURS=48)
  - no_baseline: all history scans have NULL third_lowest_price
  - no_listings: current scan has no prices at all

alert fires if:
  drop_pct >= threshold (DEFAULT_THRESHOLD_PERCENT=15)
  AND NOT (last alert < COOLDOWN_HOURS=12 ago AND price delta < COOLDOWN_PRICE_DELTA_PCT=5%)
```

**Cooldown kombiniert zwei Bedingungen:** Unterdrückung nur wenn BEIDE erfüllt: < 12h seit letztem Alert UND Preis hat sich um < 5% verändert. Bei > 5% Preisdelta oder nach 12h wird erneut alertiert.

**Wichtig:** MIN-Baseline. Sobald ein günstiger Scan in den 30-Tage-Window kommt, sinkt die Baseline. Ein Scan außerhalb des Fensters beeinflusst die Baseline nicht (wird in den Cooldown-Tests ausgenutzt).

**Why 3rd-lowest, not lowest?** Filters out single mispriced listings (wrong expansion, misclicked price) and one-off sniper listings that will be gone by the time the push arrives.

**Why a 48h warmup window?** Before then, we don't have enough baseline data; every normal market swing would fire a false alert on day 1.

## User Context

User is a German-speaking web developer based in Berlin (Laravel/WinterCMS background, strong with Docker, Node, Android tinkering). Has an existing MTG React game project — this tracker is a complementary personal tool. Prefers concrete, iterative progress over big upfront designs. Values honest tradeoff discussion over cheerleading. Will push back if something feels wrong — that's a feature, not a bug.

## Working Agreement

- Iterative only. Finish iteration N on the user's machine before starting N+1.
- Surface risks and unknowns before coding around them. If a library choice is an arms-race bet, say so.
- Prefer reducing surface area over adding it. Fewer dependencies, fewer files, fewer abstractions.
- When the user reports an error, reproduce the reasoning first: what does the error *really* mean, not what does it literally say.