#!/usr/bin/env node
/**
 * Simulates time-shifted scans in an in-memory DB to test detector logic.
 *
 * Test cases run automatically. No real scraping, no real DB writes.
 * Exits with code 0 if all tests pass, 1 if any fail.
 *
 * Run: npm run test:detector
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const schemaPath = path.resolve(__dirname, 'src/storage/schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

import { _setTestDb } from './src/storage/db.js';

function makeTestDb() {
  const db = new Database(':memory:');
  db.exec(schema);
  return db;
}

function insertFakeScan(db, { cardSlug, cardName, scrapedAt, thirdLowest, lowest = thirdLowest, listingsTotal = 5 }) {
  return db.prepare(`
    INSERT INTO scans (card_slug, card_name, scraped_at, url, listings_total, lowest_price, third_lowest_price)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(cardSlug, cardName, scrapedAt, 'https://test/', listingsTotal, lowest, thirdLowest).lastInsertRowid;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(`Assertion failed: ${msg}`); }

// ─── Test Cases ───────────────────────────────────────────────────────────

test('warmup: less than 48h history → skipped warmup', async () => {
  const db = makeTestDb();
  _setTestDb(db);
  const { detectDrop } = await import('./src/detector/detector.js?t=' + Date.now());

  const now = Date.now();
  insertFakeScan(db, { cardSlug: 'set/card', cardName: 'Card', scrapedAt: new Date(now - 10 * 3600_000).toISOString(), thirdLowest: 100 });
  const scanId = insertFakeScan(db, { cardSlug: 'set/card', cardName: 'Card', scrapedAt: new Date(now).toISOString(), thirdLowest: 50 });

  const r = detectDrop(scanId);
  assert(r.skipped === 'warmup', `expected warmup, got ${JSON.stringify(r)}`);
});

test('clear drop after 30d → triggers alert', async () => {
  const db = makeTestDb();
  _setTestDb(db);
  const { detectDrop } = await import('./src/detector/detector.js?t=' + Date.now());

  const now = Date.now();
  // 30 days stable at 140€
  for (let day = 30; day >= 1; day--) {
    insertFakeScan(db, {
      cardSlug: 'mm2/mox-opal',
      cardName: 'Mox Opal',
      scrapedAt: new Date(now - day * 86400_000).toISOString(),
      thirdLowest: 140,
    });
  }
  // Now: drop to 110 (~21%)
  const scanId = insertFakeScan(db, {
    cardSlug: 'mm2/mox-opal',
    cardName: 'Mox Opal',
    scrapedAt: new Date(now).toISOString(),
    thirdLowest: 110,
  });

  const r = detectDrop(scanId);
  assert(r.triggered === true, `expected trigger, got ${JSON.stringify(r)}`);
  assert(Math.round(r.dropPct) === 21, `expected ~21% drop, got ${r.dropPct}`);
});

test('drop below threshold (10% with default 15%) → no alert', async () => {
  const db = makeTestDb();
  _setTestDb(db);
  const { detectDrop } = await import('./src/detector/detector.js?t=' + Date.now());

  const now = Date.now();
  for (let day = 30; day >= 1; day--) {
    insertFakeScan(db, { cardSlug: 'a/b', cardName: 'X', scrapedAt: new Date(now - day * 86400_000).toISOString(), thirdLowest: 100 });
  }
  const scanId = insertFakeScan(db, { cardSlug: 'a/b', cardName: 'X', scrapedAt: new Date(now).toISOString(), thirdLowest: 92 });

  const r = detectDrop(scanId);
  assert(r.triggered === false, `expected no trigger, got ${JSON.stringify(r)}`);
});

test('cooldown: re-alert within 12h with same price → suppressed', async () => {
  const db = makeTestDb();
  _setTestDb(db);
  const { detectDrop } = await import('./src/detector/detector.js?t=' + Date.now());

  const now = Date.now();
  for (let day = 30; day >= 1; day--) {
    insertFakeScan(db, { cardSlug: 'a/b', cardName: 'X', scrapedAt: new Date(now - day * 86400_000).toISOString(), thirdLowest: 100 });
  }

  // Setup: alert-triggering scan placed OUTSIDE the 30-day window (35 days ago)
  // so it does not become the new MIN baseline for subsequent in-window scans.
  // The alert record is written with created_at = now (actual wall-clock time).
  const setupScanId = insertFakeScan(db, { cardSlug: 'a/b', cardName: 'X', scrapedAt: new Date(now - 35 * 86400_000).toISOString(), thirdLowest: 80 });
  const r1 = detectDrop(setupScanId);
  assert(r1.triggered === true, `setup alert should trigger, got ${JSON.stringify(r1)}`);

  // New scan shows 81€ — close to last alert price (80€), within 12h → suppressed
  // Baseline for this scan: 30 days of 100€ only (setup scan outside window) → drop 19% passes threshold
  const scanId2 = insertFakeScan(db, { cardSlug: 'a/b', cardName: 'X', scrapedAt: new Date(now).toISOString(), thirdLowest: 81 });
  const r2 = detectDrop(scanId2);
  assert(r2.suppressed === 'cooldown', `second alert should be suppressed, got ${JSON.stringify(r2)}`);
});

test('cooldown bypassed by >5% further drop', async () => {
  const db = makeTestDb();
  _setTestDb(db);
  const { detectDrop } = await import('./src/detector/detector.js?t=' + Date.now());

  const now = Date.now();
  for (let day = 30; day >= 1; day--) {
    insertFakeScan(db, { cardSlug: 'a/b', cardName: 'X', scrapedAt: new Date(now - day * 86400_000).toISOString(), thirdLowest: 100 });
  }
  // Setup alert at 80€ from outside the 30-day window (same trick as cooldown test)
  const setupScanId = insertFakeScan(db, { cardSlug: 'a/b', cardName: 'X', scrapedAt: new Date(now - 35 * 86400_000).toISOString(), thirdLowest: 80 });
  detectDrop(setupScanId);

  // New scan at 70€: baseline stays at 100€ (setup scan outside window), drop 30% > 15%
  // Price delta from last alert (80€): |80-70|/80 = 12.5% > 5% → cooldown bypassed → re-alert OK
  const scanId2 = insertFakeScan(db, { cardSlug: 'a/b', cardName: 'X', scrapedAt: new Date(now).toISOString(), thirdLowest: 70 });
  const r2 = detectDrop(scanId2);
  assert(r2.triggered === true, `re-alert should trigger on further drop, got ${JSON.stringify(r2)}`);
});

// ─── Runner ───────────────────────────────────────────────────────────────

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`✅ ${t.name}`);
  } catch (err) {
    console.log(`❌ ${t.name}`);
    console.log(`   ${err.message}`);
    failed++;
  }
}

_setTestDb(null);
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed === 0 ? 0 : 1);
