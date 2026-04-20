#!/usr/bin/env node
/**
 * Test ntfy notifications manually.
 *
 * Usage:
 *   npm run test:notify                           # send fake alert to default topic
 *   npm run test:notify my-topic-name            # send to custom topic
 *   npm run test:notify my-topic-name --dry-run  # dry run mode
 */
import { sendAlert } from './src/notifier/ntfy.js';
import { dispatchPendingAlerts } from './src/notifier/dispatcher.js';
import { initDb } from './src/storage/db.js';

const args = process.argv.slice(2);
const topic = args.find((a) => !a.startsWith('--')) || 'mtg-tracker-dev';
const dryRun = args.includes('--dry-run');

const fakeAlert = {
  id: 999,
  cardName: 'Test Card',
  cardSlug: 'test/card',
  currentPrice: 89.99,
  baselinePrice: 120.50,
  dropPercent: 25.3,
  createdAt: new Date().toISOString(),
};

console.log(`Testing ntfy notification...`);
console.log(`Topic: ${topic}`);
console.log(`Dry run: ${dryRun}`);
console.log();

try {
  const result = await sendAlert(fakeAlert, { topic, dryRun });

  if (result.success) {
    console.log('Notification sent successfully');
    if (!dryRun) {
      console.log(`Check: https://ntfy.sh/${topic}`);
    }
  } else {
    console.log('Notification failed:', result.error);
    process.exit(1);
  }
} catch (err) {
  console.error('Test crashed:', err.message);
  process.exit(1);
}

console.log('\nDispatching real pending alerts from DB...');
initDb();
const dispatch = await dispatchPendingAlerts({ topic, dryRun });
console.log(`Processed: ${dispatch.processed}, Sent: ${dispatch.sent}, Failed: ${dispatch.failed.length}`);
if (dispatch.failed.length > 0) {
  dispatch.failed.forEach((f) => console.log(`  Alert #${f.alertId}: ${f.error}`));
}
