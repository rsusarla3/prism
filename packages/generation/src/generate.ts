/**
 * Orchestrates prompt -> model -> validate -> retry-on-failure.
 * See docs/prism/GENERATION_SPEC.md "Suggested implementation": one
 * structured call per request, not five, with the validator as the
 * enforcement point for the research-derived rules.
 */
import type { GenerateRequest, StudyBundle } from 'prism-shared';
import { buildGenerationPrompt } from './prompt.js';
import { validateStudyBundle, type ValidationIssue } from './validate.js';

/** Minimal seam for whichever LLM provider ends up wired in. No provider is chosen yet. */
export interface LLMClient {
  complete(args: { system: string; user: string }): Promise<string>;
}

export interface GenerateResult {
  bundle: StudyBundle | null;
  issues: ValidationIssue[];
  attempts: number;
}

const DEFAULT_MAX_ATTEMPTS = 2;

/**
 * Runs the generation pipeline. On a validation failure, retries once by
 * default, appending the specific issues so the model can repair them —
 * this backstops the prompt's own self-check instruction rather than
 * replacing it.
 */
export async function generateStudyBundle(
  request: GenerateRequest,
  llm: LLMClient,
  opts: { maxAttempts?: number } = {},
): Promise<GenerateResult> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const { system, user } = buildGenerationPrompt(request);

  let currentUser = user;
  let lastIssues: ValidationIssue[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await llm.complete({ system, user: currentUser });
    const bundle = parseBundle(raw);
    if (!bundle) {
      lastIssues = [{ path: '', rule: 'invalid-json', message: 'Model output was not valid JSON.' }];
      currentUser = `${currentUser}\n\nYour previous response was not valid JSON. Return only the JSON object.`;
      continue;
    }

    const result = validateStudyBundle(bundle);
    if (result.valid) {
      return { bundle, issues: [], attempts: attempt };
    }

    lastIssues = result.issues;
    currentUser = `${currentUser}\n\nYour previous attempt failed validation. Fix every issue below and return the full corrected JSON object:\n${result.issues.map((i) => `- ${i.path}: ${i.message}`).join('\n')}`;
  }

  return { bundle: null, issues: lastIssues, attempts: maxAttempts };
}

function parseBundle(raw: string): StudyBundle | null {
  try {
    return JSON.parse(raw) as StudyBundle;
  } catch {
    return null;
  }
}
