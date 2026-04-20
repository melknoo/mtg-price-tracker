#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initDb, closeDb } from './src/storage/db.js';
import { getRecentScans, listCardSlugs } from './src/storage/scans.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.json');
const HTML_PATH = path.join(__dirname, 'src', 'web', 'index.html');
const PORT = Number(process.env.PORT ?? 3000);

function cardNameToUrl(name) {
  const slug = name.trim()
    .replace(/'/g, '')           // Apostroph entfernen (Gaea's → Gaeas)
    .replace(/[^\w\s-]/g, ' ')  // sonstige Sonderzeichen → Leerzeichen
    .trim()
    .replace(/\s+/g, '-');       // Leerzeichen → Bindestrich
  return `https://www.cardmarket.com/de/Magic/Cards/${slug}`;
}

// Inline to avoid importing puppeteer at server start
function slugFromUrl(url) {
  const mSet = url.match(/\/Products\/Singles\/([^/]+)\/([^/?#]+)/i);
  if (mSet) return `${mSet[1]}/${mSet[2]}`.toLowerCase();
  const mCard = url.match(/\/Cards\/([^/?#]+)/i);
  if (mCard) return mCard[1].toLowerCase();
  return null;
}

async function readConfig() {
  return JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
}

async function writeConfig(config) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function fail(res, status, message) {
  json(res, status, { error: message });
}

async function route(req, res) {
  const { method } = req;
  const p = new URL(req.url, 'http://localhost').pathname;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // Serve frontend
  if (method === 'GET' && p === '/') {
    const html = await fs.readFile(HTML_PATH, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // GET /api/cards
  if (method === 'GET' && p === '/api/cards') {
    const config = await readConfig();
    const cards = config.cards.map((c) => ({ ...c, slug: slugFromUrl(c.url) }));
    return json(res, 200, { cards, defaults: config.defaults, ntfy: config.ntfy });
  }

  // POST /api/cards
  if (method === 'POST' && p === '/api/cards') {
    let body;
    try { body = await parseBody(req); }
    catch { return fail(res, 400, 'Ungültiges JSON'); }

    const { name, url: cardUrl, alertThresholdPercent } = body;
    if (!name?.trim()) return fail(res, 400, 'name ist erforderlich');
    const resolvedUrl = cardUrl?.trim() || cardNameToUrl(name.trim());
    if (!resolvedUrl.includes('cardmarket.com')) return fail(res, 400, 'URL muss eine cardmarket.com-URL sein');
    if (alertThresholdPercent != null) {
      if (typeof alertThresholdPercent !== 'number' || alertThresholdPercent <= 0)
        return fail(res, 400, 'alertThresholdPercent muss eine positive Zahl sein');
    }

    const config = await readConfig();
    if (config.cards.some((c) => c.name.toLowerCase() === name.trim().toLowerCase()))
      return fail(res, 409, `"${name.trim()}" ist bereits in der Watchlist`);

    const card = { name: name.trim(), url: resolvedUrl };
    if (alertThresholdPercent) card.alertThresholdPercent = alertThresholdPercent;
    config.cards.push(card);
    await writeConfig(config);
    return json(res, 201, { card });
  }

  // DELETE /api/cards/:name
  const delMatch = p.match(/^\/api\/cards\/(.+)$/);
  if (method === 'DELETE' && delMatch) {
    const name = decodeURIComponent(delMatch[1]);
    const config = await readConfig();
    const idx = config.cards.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
    if (idx === -1) return fail(res, 404, `"${name}" nicht gefunden`);
    const [removed] = config.cards.splice(idx, 1);
    await writeConfig(config);
    return json(res, 200, { removed });
  }

  // GET /api/slugs
  if (method === 'GET' && p === '/api/slugs') {
    return json(res, 200, { slugs: listCardSlugs() });
  }

  // GET /api/history/:slug  (slug may contain slashes like "set-name/card-name")
  const histMatch = p.match(/^\/api\/history\/(.+)$/);
  if (method === 'GET' && histMatch) {
    const slug = histMatch[1];
    const scans = getRecentScans(slug, 15);
    return json(res, 200, { slug, scans });
  }

  res.writeHead(404);
  res.end('Not found');
}

async function main() {
  initDb();

  const server = http.createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (e) {
      console.error('Request error:', e.message);
      if (!res.headersSent) fail(res, 500, 'Interner Serverfehler');
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log('\nMTG Price Tracker — Web UI');
    console.log(`Lokal:    http://localhost:${PORT}`);
    console.log(`Netzwerk: http://<S9-IP>:${PORT}`);
    console.log('\nCTRL+C zum Beenden\n');
  });

  process.on('SIGINT', () => {
    closeDb();
    server.close();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
