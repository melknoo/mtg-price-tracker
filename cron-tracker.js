#!/usr/bin/env node
/**
 * Main cron job: process all cards from config.json.
 *
 * Usage:
 *   node cron-tracker.js           # process all cards
 *   node cron-tracker.js --dry-run # run without DB writes or notifications
 *   node cron-tracker.js --card 0  # process only card at index 0 (for testing)
 *   node cron-tracker.js --verbose # show full detection objects
 */
import { loadConfig, resolveCardConfig } from './src/config/config.js';
import { scrapeCard } from './src/scraper/index.js';
import { initDb } from './src/storage/db.js';
import { insertScan } from './src/storage/scans.js';
import { detectDrop } from './src/detector/detector.js';
import { dispatchPendingAlerts } from './src/notifier/dispatcher.js';

const args = process.argv.slice(2);
const flags = {
  dryRun: args.includes('--dry-run'),
  cardIndex: args.includes('--card') ? parseInt(args[args.indexOf('--card') + 1], 10) : null,
  verbose: args.includes('--verbose') || args.includes('-v'),
};

async function processCard(cardConfig, cardIndex, totalCards) {
  const logPrefix = `[${cardIndex + 1}/${totalCards}] ${cardConfig.name}:`;

  try {
    console.log(`${logPrefix} Scraping...`);
    const scrapeResult = await scrapeCard(cardConfig);

    if (scrapeResult.prices.length === 0) {
      console.log(`${logPrefix} No listings found`);
      return { skipped: 'no_listings' };
    }

    console.log(`${logPrefix} Found ${scrapeResult.prices.length} listings`);

    if (flags.dryRun) {
      const lowest = scrapeResult.prices[0]?.price;
      const third = scrapeResult.prices[2]?.price;
      console.log(
        `${logPrefix} Lowest: ${lowest?.toFixed(2)}€, 3rd: ${third?.toFixed(2)}€ (DRY RUN - no DB write)`
      );
      return { skipped: 'dry_run' };
    }

    // Persist scan
    const { scanId } = insertScan({
      cardSlug: scrapeResult.cardSlug,
      cardName: scrapeResult.name,
      url: scrapeResult.url,
      scrapedAt: scrapeResult.scrapedAt,
      prices: scrapeResult.prices,
    });

    console.log(`${logPrefix} Persisted scan #${scanId}`);

    // Run detection
    const detection = detectDrop(scanId, {
      thresholdPercent: cardConfig.alertThresholdPercent,
    });

    if (flags.verbose) {
      console.log(`${logPrefix} Detection:`, JSON.stringify(detection));
    }

    if (detection.triggered) {
      console.log(
        `${logPrefix} ALERT: dropped ${detection.dropPct}% ` +
        `(${detection.baseline}€ -> ${detection.current}€)`
      );
      return { alert: true, detection };
    } else if (detection.skipped) {
      console.log(`${logPrefix} Skipped: ${detection.skipped}`);
    } else if (detection.suppressed) {
      console.log(`${logPrefix} Suppressed: ${detection.suppressed}`);
    } else {
      console.log(
        `${logPrefix} No alert (${detection.dropPct.toFixed(1)}% < ${detection.threshold}%)`
      );
    }

    return { processed: true };
  } catch (error) {
    console.error(`${logPrefix} Error:`, error.message);
    return { error: error.message };
  }
}

async function main() {
  console.log('MTG Price Tracker - Cron Run');
  console.log(`Started: ${new Date().toISOString()}`);

  if (flags.dryRun) {
    console.log('DRY RUN MODE - no database writes, no notifications');
  }

  try {
    const config = loadConfig();
    console.log(`Loaded config: ${config.cards.length} cards, topic: ${config.ntfy.topic}`);

    if (!flags.dryRun) {
      initDb();
    }

    const cardsToProcess = flags.cardIndex !== null
      ? [{ ...config.cards[flags.cardIndex], index: flags.cardIndex }]
      : config.cards.map((card, index) => ({ ...card, index }));

    if (flags.cardIndex !== null) {
      const card = config.cards[flags.cardIndex];
      if (!card) {
        console.error(`Card index ${flags.cardIndex} out of range (0-${config.cards.length - 1})`);
        process.exit(1);
      }
      console.log(`Processing single card: index ${flags.cardIndex}`);
    }

    const results = { processed: 0, alerts: 0, errors: 0, skipped: 0 };

    for (const cardEntry of cardsToProcess) {
      const cardConfig = resolveCardConfig(cardEntry, config.defaults);
      const result = await processCard(cardConfig, cardEntry.index, config.cards.length);

      if (result.error) results.errors++;
      else if (result.alert) results.alerts++;
      else if (result.skipped) results.skipped++;
      else results.processed++;

      // 2s delay between cards to be polite to Cardmarket
      if (cardsToProcess.indexOf(cardEntry) < cardsToProcess.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Dispatch notifications for any pending alerts
    if (!flags.dryRun) {
      console.log('\nDispatching notifications...');
      const dispatch = await dispatchPendingAlerts({
        topic: config.ntfy.topic,
        baseUrl: config.ntfy.baseUrl,
      });

      if (dispatch.sent > 0) {
        console.log(`Sent ${dispatch.sent} notification(s)`);
      }
      if (dispatch.failed.length > 0) {
        console.log(`Failed to send ${dispatch.failed.length} notification(s)`);
        dispatch.failed.forEach(f => console.log(`  Alert #${f.alertId}: ${f.error}`));
      }
      if (dispatch.processed === 0) {
        console.log('No pending notifications');
      }
    }

    // Summary
    console.log('\nSummary:');
    console.log(`  Processed: ${results.processed}`);
    console.log(`  Alerts:    ${results.alerts}`);
    console.log(`  Skipped:   ${results.skipped}`);
    console.log(`  Errors:    ${results.errors}`);
    console.log(`Finished: ${new Date().toISOString()}`);

  } catch (error) {
    console.error('Cron run failed:', error.message);
    process.exit(1);
  }
}

main();
