#!/usr/bin/env node
import { initDb } from './src/storage/db.js';
import { getRecentScans, listCardSlugs } from './src/storage/scans.js';

const TIMEZONE = 'Europe/Berlin';
const SEP = '═'.repeat(55);

function formatTs(isoString) {
  return new Date(isoString).toLocaleString('de-DE', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtPrice(val) {
  return val != null ? `${val.toFixed(2)} €` : 'n/a';
}

function printScanLine(scan) {
  console.log(
    `  ${formatTs(scan.scrapedAt)}   lowest: ${fmtPrice(scan.lowestPrice).padEnd(10)}  3rd: ${fmtPrice(scan.thirdLowestPrice).padEnd(10)}  (${scan.listingsTotal} listings)`
  );
}

function showOverview() {
  const slugs = listCardSlugs();
  if (slugs.length === 0) {
    console.log('No scans in database yet. Run `npm run test:persist` first.');
    return;
  }

  for (const slug of slugs) {
    const scans = getRecentScans(slug, 3);
    console.log(`\n${SEP}`);
    console.log(`${scans[0].cardName} (${slug})`);
    console.log(`${SEP}`);
    for (const scan of scans) printScanLine(scan);
  }
  console.log('');
}

function showCard(slug, limit) {
  const scans = getRecentScans(slug, limit);
  if (scans.length === 0) {
    console.log(`No scans found for slug: ${slug}`);
    return;
  }

  console.log(`\n${SEP}`);
  console.log(`${scans[0].cardName} (${slug})`);
  console.log(`Last ${scans.length} scans:`);
  console.log(`${SEP}`);
  for (const scan of scans) printScanLine(scan);

  const newest = scans[0];
  if (newest.listings.length > 0) {
    console.log(`\nTop listings (most recent scan — ${formatTs(newest.scrapedAt)}):`);
    console.table(
      newest.listings.map((l) => ({
        rank: l.rank,
        price: fmtPrice(l.price),
        cond: l.condition ?? '–',
        lang: l.language ?? '–',
        country: l.country ?? '–',
        seller: l.seller ?? '–',
      }))
    );
  }
  console.log('');
}

initDb();

const slugArg = process.argv[2];
const limitArg = parseInt(process.argv[3], 10) || 10;

if (slugArg) {
  showCard(slugArg, limitArg);
} else {
  showOverview();
}
