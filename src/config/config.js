import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '../../config.json');

let configCache = null;

/**
 * Load and validate config.json.
 * Cached after first load. Call with force=true to reload.
 *
 * @param {{ force?: boolean }} [options]
 * @returns {{
 *   ntfy: { topic: string, baseUrl: string },
 *   defaults: { filters: string, alertThresholdPercent: number, alertCooldownHours: number },
 *   cards: Array<{
 *     name: string,
 *     url: string,
 *     filters?: string,
 *     alertThresholdPercent?: number,
 *   }>
 * }}
 */
export function loadConfig(options = {}) {
  if (configCache && !options.force) {
    return configCache;
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Config file not found: ${CONFIG_PATH}`);
  }

  const rawConfig = fs.readFileSync(CONFIG_PATH, 'utf8');
  const config = JSON.parse(rawConfig);

  validateConfig(config);

  configCache = config;
  return config;
}

/**
 * Validate config structure. Throws on invalid config.
 * @param {object} config
 */
function validateConfig(config) {
  if (!config.ntfy || typeof config.ntfy.topic !== 'string') {
    throw new Error('config.ntfy.topic is required');
  }
  if (!config.defaults) {
    throw new Error('config.defaults is required');
  }
  if (typeof config.defaults.alertThresholdPercent !== 'number') {
    throw new Error('config.defaults.alertThresholdPercent must be a number');
  }
  if (!Array.isArray(config.cards) || config.cards.length === 0) {
    throw new Error('config.cards must be a non-empty array');
  }

  for (let i = 0; i < config.cards.length; i++) {
    const card = config.cards[i];
    if (!card.name || !card.url) {
      throw new Error(`config.cards[${i}] must have name and url`);
    }
    if (!card.url.includes('cardmarket.com')) {
      throw new Error(`config.cards[${i}].url must be a Cardmarket URL`);
    }
  }
}

/**
 * Resolve effective config for a single card (defaults + overrides).
 *
 * @param {object} card - raw card from config.cards
 * @param {object} defaults - config.defaults
 * @returns {{
 *   name: string,
 *   url: string,
 *   filters: string,
 *   alertThresholdPercent: number,
 * }}
 */
export function resolveCardConfig(card, defaults) {
  return {
    name: card.name,
    url: card.url,
    filters: card.filters || defaults.filters,
    alertThresholdPercent: card.alertThresholdPercent || defaults.alertThresholdPercent,
  };
}
