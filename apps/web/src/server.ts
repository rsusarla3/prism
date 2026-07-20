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
import { solveLinear, verifyAttempt, compoundGrowth } from 'prism-verifiers';
import {
  createSession,
  recordAttempt,
  mayRevealAnswer,
  recommendMode,
  buildHintLadder,
  nextHint,
} from 'prism-learning-engine';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 8787;

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
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    send(res, status, { error: (e as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(`Prism web server on http://localhost:${PORT}`);
});
