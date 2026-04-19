import { fetchViaBrowser } from './browser.js';
import { parsePrices, diagnose } from './parser.js';

export function slugFromUrl(url) {
  // Set-specific: /Products/Singles/{Set}/{Card}
  const mSet = url.match(/\/Products\/Singles\/([^/]+)\/([^/?#]+)/i);
  if (mSet) return `${mSet[1]}/${mSet[2]}`.toLowerCase();

  // Set-independent: /Cards/{Card}
  const mCard = url.match(/\/Cards\/([^/?#]+)/i);
  if (mCard) return mCard[1].toLowerCase();

  throw new Error(`Could not derive slug from URL: ${url}`);
}

/**
 * Scrape a single card's Cardmarket product page.
 *
 * @param {{
 *   name: string,
 *   url: string,
 *   filters?: string,
 * }} card
 */
export async function scrapeCard(card) {
  const fullUrl = card.filters ? `${card.url}?${card.filters}` : card.url;
  const result = await fetchViaBrowser(fullUrl);

  if (!result.ok) {
    const detail = result.statusCode
      ? `${result.reason} (HTTP ${result.statusCode})`
      : result.reason;
    throw new Error(`[${card.name}] Scrape failed: ${detail}`);
  }

  const prices = parsePrices(result.html);

  return {
    name: card.name,
    cardSlug: slugFromUrl(card.url),
    url: fullUrl,
    prices,
    scrapedAt: new Date().toISOString(),
    raw: {
      statusCode: result.statusCode,
      htmlLength: result.html?.length ?? 0,
      diagnostics: diagnose(result.html),
    },
  };
}

export { fetchViaBrowser, parsePrices, diagnose };
