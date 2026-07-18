# MTG Price Tracker

Cardmarket price tracker with ntfy push notifications. Runs on a home Linux laptop, scrapes a user-defined card watchlist hourly, and pushes an alert to the phone (ntfy app) when a card's current price drops meaningfully below its rolling 30-day baseline.

## How it works

```
hourly systemd timer
  → puppeteer-stealth fetch (Cloudflare pass)
  → cheerio parser (price list, fallback selectors)
  → SQLite (scans, alerts)
  → detector (30-day MIN baseline, 3rd-lowest price, cooldown)
  → ntfy.sh push → phone
```

A separate web UI (`web-ui.js`, port 3000) manages the watchlist (`config.json`) and shows price history from SQLite.

## Setup

```bash
npm install          # downloads Chromium (~/.cache/puppeteer), compiles better-sqlite3
npm run test:scraper # verify Cloudflare pass + parser
npm run test:notify  # test push to the configured ntfy topic
```

Requires Node ≥ 20 and Chromium's system libraries (present by default on Linux Mint 22.2 / Ubuntu 24.04 desktop; see CLAUDE.md for the package list).

## Deployment (systemd user units)

```bash
deploy/install.sh                   # symlinks units to ~/.config/systemd/user, enables timer + web UI
sudo loginctl enable-linger $USER   # once: units run at boot without a login session
```

- `mtg-tracker.timer` — hourly scrape+detect+notify run (`Persistent=true`: missed runs are caught up after suspend/poweroff).
- `mtg-web-ui.service` — web UI on `http://0.0.0.0:3000`, auto-restart.

Logs: `journalctl --user -u mtg-tracker` / `-u mtg-web-ui`.

## Web UI access

- Home LAN: `http://<laptop-ip>:3000`
- Remote via Tailscale: `http://<tailscale-ip>:3000` from any device in the tailnet — works out of the box because the server binds `0.0.0.0`.

**Security note**: the web UI has no authentication and the ntfy topic is only as private as its name. Keep the UI inside LAN/tailnet; don't port-forward it.

## Configuration

`config.json` (versioned): ntfy topic, default Cardmarket filters, alert threshold/cooldown, and the card list. Edit via the web UI or by hand. Each hourly run starts a fresh process, so changes are picked up automatically.

## Commands

See CLAUDE.md for the full command reference (`test:*`, `cron*`, `history`, `cards:web`, deployment ops).

## Troubleshooting

- **`cf_challenge` / `cf_block`**: Cloudflare flagged the fetch. Usually transient — the next hourly run retries. Persistent blocks: run `WARMUP_HEADFUL=1 npm run test:scraper` and inspect.
- **0 listings but HTML looks fine**: Cardmarket changed their DOM. `npm run test:dump`, open `data/last-response.html`, add a matching selector to the candidate list in `src/scraper/parser.js`.
- **No pushes arriving**: `npm run test:notify` — if that arrives, check `journalctl --user -u mtg-tracker` for detector output (warmup window, cooldown, threshold).
