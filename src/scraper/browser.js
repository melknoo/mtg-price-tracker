import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const CF_MARKERS = ['Just a moment', 'Checking your browser', '__cf_chl_'];

/**
 * Fetch a URL via a stealth Chromium instance. Returns a normalized result object.
 *
 * @param {string} url
 * @returns {Promise<{
 *   ok: boolean,
 *   html?: string,
 *   reason?: 'cf_challenge'|'http_error'|'network_error',
 *   statusCode?: number,
 *   error?: string,
 * }>}
 */
export async function fetchViaBrowser(url) {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  const headful = process.env.WARMUP_HEADFUL === '1';

  const browser = await puppeteer.launch({
    headless: headful ? false : 'new',
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const statusCode = response?.status() ?? 0;

    if (statusCode >= 400) {
      return { ok: false, reason: 'http_error', statusCode };
    }

    // Allow JS to finish rendering listing rows (page is SSR but has post-load scripts)
    await new Promise((r) => setTimeout(r, 2000));

    const html = await page.content();

    if (CF_MARKERS.some((m) => html.includes(m))) {
      return { ok: false, reason: 'cf_challenge', statusCode };
    }

    return { ok: true, html, statusCode };
  } catch (err) {
    return { ok: false, reason: 'network_error', error: err.message };
  } finally {
    await browser.close();
  }
}
