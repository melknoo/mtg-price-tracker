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
  let warnedAboutMissingFields = false;

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

    // Skip non-tournament-legal sets (gold border, collector novelties)
    const expansionHref = $row.find('a.expansion-symbol').attr('href') || '';
    const expansionLabel = $row.find('a.expansion-symbol').attr('aria-label') || '';
    if (
      expansionHref.includes('30th-Anniversary') ||
      expansionLabel.includes('30th Anniversary') ||
      expansionHref.includes('/WCD-') ||
      expansionLabel.includes('World Championship')
    ) {
      return;
    }

    const seller =
      $row.find('.seller-info .seller-name a').text().trim() ||
      $row.find('[class*="seller"] a').first().text().trim() ||
      null;

    // Country: sprite icon with aria-label="Item location: Germany"
    const countryRaw =
      $row.find('span[aria-label^="Item location"]').first().attr('aria-label') ||
      $row.find('.seller-info span[aria-label]').first().attr('aria-label') ||
      null;
    const country = countryRaw ? countryRaw.replace(/^Item location:\s*/i, '').trim() : null;

    const condition =
      $row.find('.article-condition').text().trim() ||
      $row.find('[class*="badge"]').first().text().trim() ||
      null;

    // Language: sprite icon with data-original-title="English" inside .product-attributes
    const language =
      $row.find('.product-attributes span[data-original-title]').first().attr('data-original-title') ||
      $row.find('span[data-original-title]').first().attr('data-original-title') ||
      $row.find('span.icon[aria-label]:not([aria-label^="Item location"])').first().attr('aria-label') ||
      null;

    if (!language || !country) {
      if (!warnedAboutMissingFields) {
        console.warn('[parser] Missing language/country in some rows. Sample HTML:');
        console.warn($row.html()?.slice(0, 200));
        warnedAboutMissingFields = true;
      }
    }

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
