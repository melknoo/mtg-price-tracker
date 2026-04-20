import { getDb } from '../storage/db.js';

/**
 * Insert a fresh alert row, returns the new alert id.
 *
 * @param {{
 *   cardSlug: string,
 *   cardName: string,
 *   scanId: number,
 *   baselinePrice: number,
 *   currentPrice: number,
 *   dropPercent: number,
 *   thresholdPercent: number,
 * }} alert
 * @returns {{ alertId: number }}
 */
export function insertAlert({ cardSlug, cardName, scanId, baselinePrice, currentPrice, dropPercent, thresholdPercent }) {
  const db = getDb();
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO alerts (card_slug, card_name, scan_id, created_at, baseline_price, current_price, drop_percent, threshold_percent, notified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(cardSlug, cardName, scanId, new Date().toISOString(), baselinePrice, currentPrice, dropPercent, thresholdPercent);
  return { alertId: Number(lastInsertRowid) };
}

/**
 * Returns the most recent alert for a card, or null if none exists.
 * @param {string} cardSlug
 * @returns {{ id: number, createdAt: string, currentPrice: number, baselinePrice: number, dropPercent: number } | null}
 */
export function getLastAlert(cardSlug) {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, created_at, current_price, baseline_price, drop_percent
    FROM alerts
    WHERE card_slug = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(cardSlug);
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    currentPrice: row.current_price,
    baselinePrice: row.baseline_price,
    dropPercent: row.drop_percent,
  };
}

/**
 * Return all alerts where notified = 0, oldest first.
 * Iteration 4 will use this to dispatch ntfy pushes.
 * @returns {Array<{ id: number, cardSlug: string, cardName: string, scanId: number, createdAt: string, baselinePrice: number, currentPrice: number, dropPercent: number, thresholdPercent: number }>}
 */
export function getPendingAlerts() {
  const db = getDb();
  return db.prepare(`
    SELECT id, card_slug, card_name, scan_id, created_at, baseline_price, current_price, drop_percent, threshold_percent
    FROM alerts
    WHERE notified = 0
    ORDER BY created_at ASC
  `).all().map((r) => ({
    id: r.id,
    cardSlug: r.card_slug,
    cardName: r.card_name,
    scanId: r.scan_id,
    createdAt: r.created_at,
    baselinePrice: r.baseline_price,
    currentPrice: r.current_price,
    dropPercent: r.drop_percent,
    thresholdPercent: r.threshold_percent,
  }));
}

/**
 * Mark an alert as notified. Iteration 4 will use this.
 * @param {number} alertId
 */
export function markAlertNotified(alertId) {
  const db = getDb();
  db.prepare(`UPDATE alerts SET notified = 1 WHERE id = ?`).run(alertId);
}
