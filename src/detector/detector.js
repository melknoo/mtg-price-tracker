import { getDb } from '../storage/db.js';
import { insertAlert, getLastAlert } from './alerts.js';

export const DEFAULT_THRESHOLD_PERCENT = 15;
export const WARMUP_HOURS = 48;
export const COOLDOWN_HOURS = 12;
export const COOLDOWN_PRICE_DELTA_PCT = 5;
export const BASELINE_DAYS = 30;

/**
 * Run drop detection for a single just-persisted scan.
 *
 * @param {number} scanId            - id of the scan to check
 * @param {object} [options]
 * @param {number} [options.thresholdPercent]  - override default 15%
 * @returns {object} - rich result object describing what happened
 */
export function detectDrop(scanId, options = {}) {
  const db = getDb();
  const threshold = options.thresholdPercent ?? DEFAULT_THRESHOLD_PERCENT;

  // 1. Load current scan
  const scan = db.prepare(`
    SELECT id, card_slug, card_name, scraped_at, lowest_price, third_lowest_price
    FROM scans WHERE id = ?
  `).get(scanId);

  if (!scan) {
    return { error: 'scan_not_found', scanId };
  }

  // 2. Determine "current" (3rd lowest, fallback lowest, fallback skip)
  const current = scan.third_lowest_price ?? scan.lowest_price ?? null;
  if (current === null) {
    return { skipped: 'no_listings', cardSlug: scan.card_slug };
  }

  // 3. Load history for last 30 days (excluding current scan)
  const since = new Date(Date.now() - BASELINE_DAYS * 86400_000).toISOString();
  const historyRows = db.prepare(`
    SELECT scraped_at, third_lowest_price
    FROM scans
    WHERE card_slug = ? AND scraped_at >= ? AND id != ?
    ORDER BY scraped_at ASC
  `).all(scan.card_slug, since, scanId);

  if (historyRows.length === 0) {
    return { skipped: 'no_history', cardSlug: scan.card_slug };
  }

  // 4. Warmup check: oldest scan must be older than 48h
  const oldestAt = new Date(historyRows[0].scraped_at).getTime();
  const ageHours = (Date.now() - oldestAt) / 3_600_000;
  if (ageHours < WARMUP_HOURS) {
    return {
      skipped: 'warmup',
      cardSlug: scan.card_slug,
      ageHours: Math.round(ageHours * 10) / 10,
      neededHours: WARMUP_HOURS,
    };
  }

  // 5. Baseline = MIN(third_lowest_price) over history, ignore NULLs
  const baseline = Math.min(
    ...historyRows
      .map((r) => r.third_lowest_price)
      .filter((p) => p !== null && p !== undefined),
  );
  if (!Number.isFinite(baseline)) {
    return { skipped: 'no_baseline', cardSlug: scan.card_slug };
  }

  // 6. Calculate drop
  const dropPct = ((baseline - current) / baseline) * 100;

  if (dropPct < threshold) {
    return {
      triggered: false,
      cardSlug: scan.card_slug,
      baseline,
      current,
      dropPct: Math.round(dropPct * 100) / 100,
      threshold,
    };
  }

  // 7. Cooldown check
  const lastAlert = getLastAlert(scan.card_slug);
  if (lastAlert) {
    const hoursSince = (Date.now() - new Date(lastAlert.createdAt).getTime()) / 3_600_000;
    const priceDeltaPct = Math.abs(
      ((lastAlert.currentPrice - current) / lastAlert.currentPrice) * 100,
    );
    if (hoursSince < COOLDOWN_HOURS && priceDeltaPct < COOLDOWN_PRICE_DELTA_PCT) {
      return {
        suppressed: 'cooldown',
        cardSlug: scan.card_slug,
        baseline,
        current,
        dropPct: Math.round(dropPct * 100) / 100,
        lastAlertAt: lastAlert.createdAt,
        hoursSinceLastAlert: Math.round(hoursSince * 10) / 10,
        priceDeltaPct: Math.round(priceDeltaPct * 100) / 100,
      };
    }
  }

  // 8. Fire alert
  const { alertId } = insertAlert({
    cardSlug: scan.card_slug,
    cardName: scan.card_name,
    scanId: scan.id,
    baselinePrice: baseline,
    currentPrice: current,
    dropPercent: dropPct,
    thresholdPercent: threshold,
  });

  return {
    triggered: true,
    alertId,
    cardSlug: scan.card_slug,
    cardName: scan.card_name,
    baseline,
    current,
    dropPct: Math.round(dropPct * 100) / 100,
    threshold,
  };
}
