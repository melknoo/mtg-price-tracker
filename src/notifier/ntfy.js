/**
 * Send a single alert via ntfy push notification.
 *
 * @param {{
 *   id: number,
 *   cardName: string,
 *   cardSlug: string,
 *   currentPrice: number,
 *   baselinePrice: number,
 *   dropPercent: number,
 *   createdAt: string,
 * }} alert
 * @param {{
 *   topic?: string,
 *   baseUrl?: string,
 *   dryRun?: boolean,
 * }} [options]
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function sendAlert(alert, options = {}) {
  const topic = options.topic || 'mtg-tracker-dev';
  const baseUrl = options.baseUrl || 'https://ntfy.sh';
  const dryRun = options.dryRun || false;

  const title = `${alert.cardName} dropped ${alert.dropPercent.toFixed(1)}%`;
  const body =
    `${alert.cardName}\n` +
    `${alert.currentPrice.toFixed(2)}€ (was ${alert.baselinePrice.toFixed(2)}€)\n` +
    `Drop: ${alert.dropPercent.toFixed(1)}%`;

  const url = `${baseUrl}/${topic}`;
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Title': title,
    'Priority': '4',
    'Tags': 'moneybag,chart_with_downwards_trend',
  };

  if (dryRun) {
    console.log('[ntfy] DRY RUN:');
    console.log(`  URL: ${url}`);
    console.log(`  Headers:`, headers);
    console.log(`  Body: ${JSON.stringify(body)}`);
    return { success: true };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `ntfy responded ${response.status}: ${response.statusText}`,
      };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
