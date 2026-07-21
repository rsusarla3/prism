/**
 * Prism web server — zero external runtime deps (hand-rolled http).
 *
 * Serves the minimal working base with two product surfaces:
 *   - Prism Core  (K-12, school): linear vs exponential growth lesson
 *   - Prism Future (adult): investing projection + future snapshot
 *
 * Deterministic, educational math only — no auth, no DB, no real bank
 * connections (spec: minimal base).
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
  compareInvestmentScenarios,
  verifyInvestmentGuess,
  ASSET_CLASSES,
  SUGGESTED_KEYWORDS,
  FUTURE_GOALS,
} from 'prism-verifiers';
import { generateStudyBundle, createGeminiClient, prepareGenerateRequest, type LLMClient } from 'prism-generation';

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

const MAX_REQUEST_BYTES = 25_000;

function readBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = '';
    let rejected = false;
    req.on('data', (chunk: Buffer) => {
      if (rejected) return;
      data += chunk.toString('utf8');
      if (Buffer.byteLength(data, 'utf8') > MAX_REQUEST_BYTES) {
        rejected = true;
        reject(Object.assign(new Error(`Request body must not exceed ${MAX_REQUEST_BYTES} bytes.`), { status: 413 }));
      }
    });
    req.on('end', () => {
      if (rejected) return;
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

// --- Prism Future: investing projection + scenarios + asset content ---
function handleFutureInvest(body: { startingBalance: number; monthlyContribution: number; years: number; assumedReturnPct: number; feePct: number; inflationPct?: number; guess?: number }) {
  const vals = parseFiniteAll([body.startingBalance, body.monthlyContribution, body.years, body.assumedReturnPct, body.feePct, body.inflationPct ?? 2.5]);
  if (!vals) throw Object.assign(new Error('All projection inputs must be finite numbers.'), { status: 400 });
  const [startingBalance, monthlyContribution, years, assumedReturnPct, feePct, inflationPct] = vals;
  if (years < 0) throw Object.assign(new Error('Years must be ≥ 0.'), { status: 400 });
  const profile = { startingBalance, monthlyContribution, years, assumedReturnPct, feePct, inflationPct };
  const projection = projectInvestment(profile);
  const comparisons = compareInvestmentScenarios(profile);
  const check = body.guess !== undefined ? verifyInvestmentGuess(profile, body.guess) : null;
  return { projection, comparisons, check };
}

// --- Generation: raw captured text -> validated study bundle ---
// Provider is Gemini (see docs/prism/GENERATION_SPEC.md). Set GEMINI_API_KEY
// to enable; without it the route reports 501 instead of crashing, so local
// dev without a key still works for every other endpoint.
const geminiApiKey = process.env.GEMINI_API_KEY;
const llmClient: LLMClient | null = geminiApiKey
  ? createGeminiClient({ apiKey: geminiApiKey, model: process.env.GEMINI_MODEL })
  : null;

async function handleGenerate(body: unknown) {
  const request = prepareGenerateRequest(body);
  if (!llmClient) {
    throw Object.assign(new Error('No LLM provider configured yet.'), { status: 501 });
  }
  const result = await generateStudyBundle(request, llmClient);
  if (!result.bundle) {
    throw Object.assign(new Error('Generation failed validation.'), { status: 502, issues: result.issues });
  }
  return result.bundle;
}

// ---------------------------------------------------------------------------
// Static demo UI
// ---------------------------------------------------------------------------

async function serveStatic(res: http.ServerResponse, urlPath: string) {
  const file = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  try {
    const buf = await readFile(path.join(PUBLIC_DIR, file));
    const ext = path.extname(file);
    const ct = ext === '.html' ? 'text/html; charset=utf-8'
      : ext === '.js' ? 'text/javascript; charset=utf-8'
      : ext === '.css' ? 'text/css; charset=utf-8'
      : ext === '.svg' ? 'image/svg+xml'
      : 'text/plain';
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
      return send(res, 200, handleFutureInvest(await readBody<{ startingBalance: number; monthlyContribution: number; years: number; assumedReturnPct: number; feePct: number; inflationPct?: number; guess?: number }>(req)));
    }
    if (req.method === 'GET' && url.pathname === '/api/future/content') {
      return send(res, 200, { assetClasses: ASSET_CLASSES, suggestedKeywords: SUGGESTED_KEYWORDS, futureGoals: FUTURE_GOALS });
    }
    if (req.method === 'POST' && url.pathname === '/api/generate') {
      return send(res, 200, await handleGenerate(await readBody<unknown>(req)));
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    const issues = (e as { issues?: unknown }).issues;
    send(res, status, { error: (e as Error).message, ...(issues ? { issues } : {}) });
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
