/**
 * Typed HTTP client for the Prism web API. Used by the extension side panel
 * and by tests. Never imports server secrets or provider SDKs.
 */

import type {
  StartSessionRequest,
  StartSessionResponse,
  SubmitAttemptRequest,
  SubmitAttemptResponse,
  RevealAnswerResponse,
  SavePlanRequest,
} from 'prism-shared';

export class PrismApiClient {
  constructor(private readonly baseUrl: string) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Prism API ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  }

  startSession(req: StartSessionRequest): Promise<StartSessionResponse> {
    return this.post('/api/session/start', req);
  }

  submitAttempt(req: SubmitAttemptRequest): Promise<SubmitAttemptResponse> {
    return this.post('/api/session/attempt', req);
  }

  revealAnswer(sessionId: string): Promise<RevealAnswerResponse> {
    return this.post('/api/session/reveal', { sessionId });
  }

  savePlan(req: SavePlanRequest): Promise<{ ok: true }> {
    return this.post('/api/plan/save', req);
  }
}
