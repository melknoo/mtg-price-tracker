import { getDb } from './db.js';

export function insertScan({ cardSlug, cardName, url, scrapedAt, prices }) {
  const db = getDb();

  const insert = db.transaction(() => {
    const { lastInsertRowid: scanId } = db.prepare(`
      INSERT INTO scans (card_slug, card_name, scraped_at, url, listings_total, lowest_price, third_lowest_price)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      cardSlug,
      cardName,
      scrapedAt,
      url,
      prices.length,
      prices[0]?.price ?? null,
      prices[2]?.price ?? null,
    );

    const insertListing = db.prepare(`
      INSERT INTO scan_listings (scan_id, rank, price, seller, country, language, condition)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    prices.slice(0, 5).forEach((p, i) => {
      insertListing.run(scanId, i + 1, p.price, p.seller ?? null, p.country ?? null, p.language ?? null, p.condition ?? null);
    });

    return scanId;
  });

  const scanId = insert();
  return { scanId };
}

export function getRecentScans(cardSlug, limit = 10) {
  const db = getDb();

  const scans = db.prepare(`
    SELECT id, card_name, scraped_at, lowest_price, third_lowest_price, listings_total
    FROM scans
    WHERE card_slug = ?
    ORDER BY scraped_at DESC
    LIMIT ?
  `).all(cardSlug, limit);

  const getListings = db.prepare(`
    SELECT rank, price, seller, country, language, condition
    FROM scan_listings
    WHERE scan_id = ?
    ORDER BY rank ASC
  `);

  return scans.map((s) => ({
    id: s.id,
    cardName: s.card_name,
    scrapedAt: s.scraped_at,
    lowestPrice: s.lowest_price,
    thirdLowestPrice: s.third_lowest_price,
    listingsTotal: s.listings_total,
    listings: getListings.all(s.id),
  }));
}

export function listCardSlugs() {
  const db = getDb();
  return db.prepare(`
    SELECT DISTINCT card_slug FROM scans ORDER BY card_slug ASC
  `).all().map((r) => r.card_slug);
}
