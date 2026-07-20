/**
 * Prism web server — zero external runtime deps (hand-rolled http).
 *
 * Enforces the spec's hardest rule (AGENTS.md #4): the final answer is gated
 * SERVER-SIDE. The client never receives the answer until the learner has made
 * a meaningful attempt, recorded here in the session store.
 *
 * Also serves a small demo UI from /public so the product is visible on
 * localhost without the Chrome extension.
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';

import type {
  Session,
  Attempt,
  Classification,
  FinancialProfile,
  StartSessionRequest,
  StartSessionResponse,
  SubmitAttemptRequest,
  SubmitAttemptResponse,
  RevealAnswerResponse,
  SavePlanRequest,
} from 'prism-shared';
import { LEARNER_GOALS } from 'prism-shared';
import { CURRICULUM, classifyConcept } from 'prism-curriculum';
import { solveLinear, verifyAttempt, compoundGrowth, compareGrowth, projectInvestment, compareInvestmentScenarios, verifyInvestmentGuess, ASSET_CLASSES, SUGGESTED_KEYWORDS, FUTURE_GOALS } from 'prism-verifiers';
import {
  createSession,
  recordAttempt,
  mayRevealAnswer,
  recommendMode,
  buildHintLadder,
  nextHint,
  buildQuiz,
  scoreQuiz,
} from 'prism-learning-engine';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 8787;
// Bind 0.0.0.0 by default so other devices on the same hotspot/LAN can reach
// the host. Set HOST=127.0.0.1 to restrict to the host machine only.
const HOST = process.env.HOST || '0.0.0.0';

interface StoredSession extends Session {
  lhs?: string;
  rhs?: string;
  profile?: FinancialProfile;
}

const sessions = new Map<string, StoredSession>();
const plans: SavePlanRequest[] = [];

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

function splitEquation(text: string): { lhs: string; rhs: string } | null {
  const idx = text.indexOf('=');
  if (idx < 0) return null;
  return { lhs: text.slice(0, idx), rhs: text.slice(idx + 1) };
}

function stepsToText(steps: { explanation: string; expression?: string }[]): string[] {
  return steps.map((s) => (s.expression ? `${s.explanation}  →  ${s.expression}` : s.explanation));
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleStart(req: StartSessionRequest): StartSessionResponse {
  const text = req.selectedText || req.typedTopic || '';
  const { conceptId, isHomework } = classifyConcept(text);
  const concept = conceptId ? CURRICULUM[conceptId] : null;

  const classification: Classification = {
    surface: req.surface,
    domain: concept?.domain ?? 'algebra',
    conceptId,
    inputType: req.inputType,
    isHomework,
  };

  const session = createSession(randomUUID()) as StoredSession;
  session.surface = req.surface;
  session.classification = classification;
  session.conceptId = conceptId;

  if (concept) {
    if (concept.verifier === 'linear-equation') {
      const eq = splitEquation(text);
      if (eq) {
        session.lhs = eq.lhs;
        session.rhs = eq.rhs;
        const sol = solveLinear(eq.lhs, eq.rhs);
        session.gating.finalAnswer = sol === null ? 'No unique solution' : `x = ${sol}`;
      }
    } else {
      session.gating.finalAnswer = concept.similarProblem.answer;
    }
    session.gating.fullSolution = stepsToText(concept.workedExample);
  }

  sessions.set(session.id, session);
  return {
    sessionId: session.id,
    classification,
    goalOptions: LEARNER_GOALS,
  };
}

function handleAttempt(body: SubmitAttemptRequest): SubmitAttemptResponse {
  const session = sessions.get(body.sessionId);
  if (!session) {
    throw Object.assign(new Error('Unknown session'), { status: 404 });
  }
  const attempt: Attempt = { ...body, timestamp: Date.now() };
  recordAttempt(session, attempt);

  const concept = session.conceptId ? CURRICULUM[session.conceptId] : null;
  let verification = { correct: false, reason: 'No matching curriculum concept.' };
  if (concept) {
    verification = verifyAttempt(concept, attempt, {
      lhs: session.lhs,
      rhs: session.rhs,
      profile: session.profile,
    });
  }

  const recommendation = recommendMode(session.surface, session.conceptId, session.attempts);
  const ladder = concept ? buildHintLadder(concept) : [];
  const next = verification.correct ? undefined : nextHint(ladder, session.attempts.length);

  return {
    verification,
    answerUnlocked: mayRevealAnswer(session),
    recommendation,
    nextHint: next,
  };
}

function handleReveal(body: { sessionId: string }): RevealAnswerResponse {
  const session = sessions.get(body.sessionId);
  if (!session) {
    throw Object.assign(new Error('Unknown session'), { status: 404 });
  }
  if (!mayRevealAnswer(session)) {
    return {
      finalAnswer: null,
      fullSolution: null,
      error: 'Answer locked. Submit a meaningful attempt first.',
    };
  }
  return {
    finalAnswer: session.gating.finalAnswer,
    fullSolution: session.gating.fullSolution,
  };
}

function handleSimulate(body: { sessionId: string; profile: FinancialProfile }) {
  const session = sessions.get(body.sessionId);
  if (session) {
    session.profile = body.profile;
    session.conceptId = session.conceptId ?? 'compound-interest';
    session.gating.finalAnswer = String(compoundGrowth(body.profile).balance);
  }
  return compoundGrowth(body.profile);
}

function handleSavePlan(body: SavePlanRequest) {
  plans.push(body);
  return { ok: true as const };
}

// Quiz is generated from the approved curriculum (objectives/misconceptions),
// never invented by a model — see packages/learning-engine/src/quiz.ts.
function handleQuizGenerate(body: { conceptId: string; seed?: number }) {
  const concept = CURRICULUM[body.conceptId];
  if (!concept) throw Object.assign(new Error('Unknown concept'), { status: 404 });
  return buildQuiz(concept, body.seed ?? Date.now());
}

function handleQuizScore(body: { conceptId: string; seed?: number; answers: number[] }) {
  const concept = CURRICULUM[body.conceptId];
  if (!concept) throw Object.assign(new Error('Unknown concept'), { status: 404 });
  const quiz = buildQuiz(concept, body.seed ?? Date.now());
  return scoreQuiz(quiz, body.answers);
}

// --- Prism Core: linear vs exponential growth lesson ---
function handleCoreGrowth(body: { start: number; linearIncrement: number; exponentialMultiplier: number; years: number; guess?: 'linear' | 'exponential' }) {
  return compareGrowth(body, body.guess);
}

// --- Prism Future: investing projection + asset content ---
function handleFutureInvest(body: { startingBalance: number; monthlyContribution: number; years: number; assumedReturnPct: number; feePct: number; guess?: number }) {
  const profile = {
    startingBalance: body.startingBalance,
    monthlyContribution: body.monthlyContribution,
    years: body.years,
    assumedReturnPct: body.assumedReturnPct,
    feePct: body.feePct,
    inflationPct: Number((body as { inflationPct?: number }).inflationPct ?? 2.5),
  };
  const projection = projectInvestment(profile);
  const comparisons = compareInvestmentScenarios(profile);
  const check = body.guess !== undefined ? verifyInvestmentGuess(profile, body.guess) : null;
  return { projection, comparisons, check };
}

// ---------------------------------------------------------------------------
// Static demo UI
// ---------------------------------------------------------------------------

async function serveStatic(res: http.ServerResponse, urlPath: string) {
  const file = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  try {
    const buf = await readFile(path.join(PUBLIC_DIR, file));
    const ext = path.extname(file);
    const ct = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : ext === '.svg' ? 'image/svg+xml' : 'text/plain';
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
      return send(res, 200, { ok: true, sessions: sessions.size });
    }
    if (req.method === 'POST' && url.pathname === '/api/session/start') {
      return send(res, 200, handleStart(await readBody<StartSessionRequest>(req)));
    }
    if (req.method === 'POST' && url.pathname === '/api/session/attempt') {
      return send(res, 200, handleAttempt(await readBody<SubmitAttemptRequest>(req)));
    }
    if (req.method === 'POST' && url.pathname === '/api/session/reveal') {
      return send(res, 200, handleReveal(await readBody<{ sessionId: string }>(req)));
    }
    if (req.method === 'POST' && url.pathname === '/api/life/simulate') {
      return send(res, 200, handleSimulate(await readBody<{ sessionId: string; profile: FinancialProfile }>(req)));
    }
    if (req.method === 'POST' && url.pathname === '/api/plan/save') {
      return send(res, 200, handleSavePlan(await readBody<SavePlanRequest>(req)));
    }
    if (req.method === 'POST' && url.pathname === '/api/quiz/generate') {
      return send(res, 200, handleQuizGenerate(await readBody<{ conceptId: string; seed?: number }>(req)));
    }
    if (req.method === 'POST' && url.pathname === '/api/quiz/score') {
      return send(res, 200, handleQuizScore(await readBody<{ conceptId: string; seed?: number; answers: number[] }>(req)));
    }
    if (req.method === 'POST' && url.pathname === '/api/core/growth') {
      return send(res, 200, handleCoreGrowth(await readBody<{ start: number; linearIncrement: number; exponentialMultiplier: number; years: number; guess?: 'linear' | 'exponential' }>(req)));
    }
    if (req.method === 'POST' && url.pathname === '/api/future/invest') {
      return send(res, 200, handleFutureInvest(await readBody<{ startingBalance: number; monthlyContribution: number; years: number; assumedReturnPct: number; feePct: number; guess?: number }>(req)));
    }
    if (req.method === 'GET' && url.pathname === '/api/future/content') {
      return send(res, 200, { assetClasses: ASSET_CLASSES, suggestedKeywords: SUGGESTED_KEYWORDS, futureGoals: FUTURE_GOALS });
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
