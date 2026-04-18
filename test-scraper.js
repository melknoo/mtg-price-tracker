#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fetchViaBrowser } from './src/scraper/browser.js';
import { scrapeCard, diagnose } from './src/scraper/index.js';

const DUMP_PATH = path.resolve('./data/last-response.html');

const args = process.argv.slice(2);
const dumpHtml = args.includes('--dump-html');

const testCard = {
  name: 'Mox Opal',
  url: 'https://www.cardmarket.com/en/Magic/Products/Singles/Modern-Masters-2015/Mox-Opal',
  filters:
    'sellerCountry=7&sellerReputation=1&language=1,3&minCondition=4&isSigned=N&isAltered=N',
};

async function main() {
  if (dumpHtml) {
    console.log(`Dumping raw HTML from ${testCard.url}...`);
    const fullUrl = `${testCard.url}?${testCard.filters}`;
    const res = await fetchViaBrowser(fullUrl);

    fs.mkdirSync(path.dirname(DUMP_PATH), { recursive: true });

    if (res.ok) {
      fs.writeFileSync(DUMP_PATH, res.html);
      console.log(`HTML saved to ${DUMP_PATH}`);
      console.log('Diagnostics:', diagnose(res.html));
    } else {
      fs.writeFileSync(DUMP_PATH, `<!-- Fetch failed: ${JSON.stringify(res)} -->`);
      console.error('Fetch failed:', res);
      process.exit(1);
    }
    return;
  }

  console.log(`Scraping ${testCard.name}...`);
  console.log(`URL: ${testCard.url}?${testCard.filters}\n`);

  try {
    const result = await scrapeCard(testCard);

    console.log(`Scraped at: ${result.scrapedAt}`);
    console.log(`HTTP: ${result.raw.statusCode}`);
    console.log(`HTML bytes: ${result.raw.htmlLength}`);
    console.log(`Page title: ${result.raw.diagnostics.title}`);
    console.log(`Listings found: ${result.prices.length}\n`);

    if (result.prices.length === 0) {
      console.warn('No prices parsed. Diagnostics:');
      console.warn(result.raw.diagnostics);
      console.warn('\nRun `npm run test:dump` and open data/last-response.html');
      console.warn('to inspect the actual DOM. Selectors in parser.js may need tuning.');
      process.exit(2);
    }

    console.log('Top 10 cheapest listings:');
    console.table(
      result.prices.slice(0, 10).map((p) => ({
        price: `${p.price.toFixed(2)} €`,
        condition: p.condition,
        language: p.language,
        country: p.country,
        seller: p.seller,
      }))
    );

    if (result.prices.length >= 3) {
      const third = result.prices[2].price;
      console.log(
        `\nLowest: ${result.prices[0].price.toFixed(2)} € | ` +
          `3rd lowest: ${third.toFixed(2)} € (used as robust "current" in detector)`
      );
    }
  } catch (err) {
    console.error('Scrape failed:', err.message);
    process.exit(1);
  }
}

main();
