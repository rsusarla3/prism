/**
 * Prism web server — zero external runtime deps (hand-rolled http).
 *
 * Serves the minimal working base with two product surfaces:
 *   - Prism Core  (K-12, school): linear vs exponential growth lesson
 *   - Prism Future (adult): investing projection + future snapshot
 *
 * Also serves the demo UI from /public so the product is visible on
 * localhost without the Chrome extension. Deterministic, educational math
 * only — no auth, no DB, no real bank connections (spec: minimal base).
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

import { parseFiniteAll } from 'prism-shared';
import {
  compareGrowth,
  projectInvestment,
  verifyInvestmentGuess,
  ASSET_CLASSES,
  SUGGESTED_KEYWORDS,
} from 'prism-verifiers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 8787;
// Bind 0.0.0.0 by default so other devices on the same hotspot/LAN can reach
// the host. Set HOST=127.0.0.1 to restrict to the host machine only.
const HOST = process.env.HOST || '0.0.0.0';

function send(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
  });
  res.end(json);
}

function readBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? (JSON.parse(data) as T) : ({} as T));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Handlers (two-product base)
// ---------------------------------------------------------------------------

// --- Prism Core: linear vs exponential growth lesson ---
function handleCoreGrowth(body: { start: number; linearIncrement: number; exponentialMultiplier: number; years: number; guess?: 'linear' | 'exponential' }) {
  const vals = parseFiniteAll([body.start, body.linearIncrement, body.exponentialMultiplier, body.years]);
  if (!vals) throw Object.assign(new Error('All fields must be valid numbers.'), { status: 400 });
  const [start, linearIncrement, exponentialMultiplier, years] = vals;
  if (years < 0 || exponentialMultiplier <= 0) throw Object.assign(new Error('Years must be ≥ 0 and multiplier > 0.'), { status: 400 });
  return compareGrowth({ start, linearIncrement, exponentialMultiplier, years }, body.guess);
}

// --- Prism Future: investing projection + asset content ---
function handleFutureInvest(body: { startingBalance: number; monthlyContribution: number; years: number; assumedReturnPct: number; feePct: number; guess?: number }) {
  const vals = parseFiniteAll([body.startingBalance, body.monthlyContribution, body.years, body.assumedReturnPct, body.feePct]);
  if (!vals) throw Object.assign(new Error('All fields must be valid numbers.'), { status: 400 });
  const [startingBalance, monthlyContribution, years, assumedReturnPct, feePct] = vals;
  if (years < 0) throw Object.assign(new Error('Years must be ≥ 0.'), { status: 400 });
  const profile = { startingBalance, monthlyContribution, years, assumedReturnPct, feePct };
  const projection = projectInvestment(profile);
  const check = body.guess !== undefined ? verifyInvestmentGuess(profile, body.guess) : null;
  return { projection, check };
}

// ---------------------------------------------------------------------------
// Static demo UI
// ---------------------------------------------------------------------------

async function serveStatic(res: http.ServerResponse, urlPath: string) {
  const file = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  try {
    const buf = await readFile(path.join(PUBLIC_DIR, file));
    const ext = path.extname(file);
    const ct = ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' : 'text/plain';
    res.writeHead(200, { 'content-type': ct });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/public'))) {
      return serveStatic(res, url.pathname === '/' ? '/' : url.pathname.replace('/public/', '/'));
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/core/growth') {
      return send(res, 200, handleCoreGrowth(await readBody<{ start: number; linearIncrement: number; exponentialMultiplier: number; years: number; guess?: 'linear' | 'exponential' }>(req)));
    }
    if (req.method === 'POST' && url.pathname === '/api/future/invest') {
      return send(res, 200, handleFutureInvest(await readBody<{ startingBalance: number; monthlyContribution: number; years: number; assumedReturnPct: number; feePct: number; guess?: number }>(req)));
    }
    if (req.method === 'GET' && url.pathname === '/api/future/content') {
      return send(res, 200, { assetClasses: ASSET_CLASSES, suggestedKeywords: SUGGESTED_KEYWORDS });
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    send(res, status, { error: (e as Error).message });
  }
});

server.listen(PORT, HOST, () => {
  const lanUrls: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) lanUrls.push(`http://${a.address}:${PORT}`);
    }
  }
  console.log(`Prism web server running`);
  console.log(`  local:            http://localhost:${PORT}`);
  if (lanUrls.length) {
    console.log(`  on your network:  ${lanUrls.join('\n                    ')}`);
    console.log('  → share a network URL with teammates on the same hotspot.');
  }
});
