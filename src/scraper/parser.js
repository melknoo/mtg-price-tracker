import * as cheerio from 'cheerio';

/**
 * Parse a German-formatted price string to a Number.
 * "139,00 €" -> 139.00
 * "1.299,50 €" -> 1299.50
 */
export function parsePriceText(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/[^\d,.\-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract article rows from a Cardmarket product page.
 *
 * NOTE: Cardmarket occasionally reshuffles their HTML structure. If this
 * returns 0 results on a page that clearly has listings, run
 * `npm run test:dump` to save the HTML and re-tune the selectors below.
 *
 * Each row lives under `.article-row` in a container like
 * `.table-body` / `#table > .table-body`. Prices are in a `.price-container`
 * descendant, typically with class `color-primary` on the number.
 */
export function parsePrices(html) {
  const $ = cheerio.load(html);
  const prices = [];

  const rows = $('.article-row, [id^="articleRow"]');

  rows.each((_, el) => {
    const $row = $(el);

    // Try several selector fallbacks for the price
    const priceCandidates = [
      $row.find('.price-container .color-primary').first(),
      $row.find('.price-container').first(),
      $row.find('[class*="price"]').first(),
    ];

    let price = null;
    for (const $cand of priceCandidates) {
      const text = $cand.text().trim();
      const parsed = parsePriceText(text);
      if (parsed !== null) {
        price = parsed;
        break;
      }
    }

    if (price === null) return;

    const seller =
      $row.find('.seller-info .seller-name a').text().trim() ||
      $row.find('[class*="seller"] a').first().text().trim() ||
      null;

    const country =
      $row.find('.seller-info [class*="icon-flag"]').attr('data-original-title') ||
      $row.find('[class*="icon-flag"]').attr('title') ||
      null;

    const condition =
      $row.find('.article-condition').text().trim() ||
      $row.find('[class*="badge"]').first().text().trim() ||
      null;

    const language =
      $row.find('.article-language').attr('data-original-title') ||
      $row.find('[class*="language"]').attr('title') ||
      null;

    prices.push({ price, seller, country, condition, language });
  });

  // Sort ascending by price
  prices.sort((a, b) => a.price - b.price);
  return prices;
}

/**
 * Quick diagnostic: what listing-ish elements does this page contain?
 * Useful when selectors break.
 */
export function diagnose(html) {
  const $ = cheerio.load(html);
  return {
    title: $('title').text().trim(),
    articleRows: $('.article-row').length,
    rowsByIdPattern: $('[id^="articleRow"]').length,
    priceContainers: $('.price-container').length,
    tableBody: $('.table-body').length,
    bodyLength: html?.length ?? 0,
  };
}
