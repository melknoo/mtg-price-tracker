import { getPendingAlerts, markAlertNotified } from '../detector/alerts.js';
import { sendAlert } from './ntfy.js';

/**
 * Process all pending alerts (notified = 0), send ntfy, mark as notified.
 *
 * @param {{
 *   topic?: string,
 *   dryRun?: boolean,
 * }} [options]
 * @returns {Promise<{
 *   processed: number,
 *   sent: number,
 *   failed: Array<{ alertId: number, error: string }>,
 * }>}
 */
export async function dispatchPendingAlerts(options = {}) {
  const pendingAlerts = getPendingAlerts();

  if (pendingAlerts.length === 0) {
    return { processed: 0, sent: 0, failed: [] };
  }

  const results = { processed: pendingAlerts.length, sent: 0, failed: [] };

  for (const alert of pendingAlerts) {
    const result = await sendAlert(alert, options);

    if (result.success) {
      if (!options.dryRun) {
        markAlertNotified(alert.id);
      }
      results.sent++;
    } else {
      results.failed.push({ alertId: alert.id, error: result.error });
    }
  }

  return results;
}
