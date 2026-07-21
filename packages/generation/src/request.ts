import type { GenerateRequest } from 'prism-shared';

export const MAX_SOURCE_CHARS = 20_000;

export class GenerationRequestError extends Error {
  constructor(message: string, public readonly status: 400 | 413 = 400) {
    super(message);
    this.name = 'GenerationRequestError';
  }
}

export function prepareGenerateRequest(input: unknown): GenerateRequest {
  if (!isRecord(input) || typeof input.text !== 'string') {
    throw new GenerationRequestError('text is required and must be a string.');
  }

  const text = input.text.replace(/\u0000/g, '').trim();
  if (!text) throw new GenerationRequestError('text is required.');
  if (text.length > MAX_SOURCE_CHARS) {
    throw new GenerationRequestError(`text must not exceed ${MAX_SOURCE_CHARS} characters.`, 413);
  }

  const result: GenerateRequest = { text };
  if (input.title !== undefined) result.title = optionalString(input.title, 'title', 300);
  if (input.sourceUrl !== undefined) result.sourceUrl = optionalString(input.sourceUrl, 'sourceUrl', 2_048);
  if (input.homeLanguage !== undefined) {
    const homeLanguage = optionalString(input.homeLanguage, 'homeLanguage', 35);
    if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(homeLanguage)) {
      throw new GenerationRequestError('homeLanguage must be a valid BCP 47-style language tag.');
    }
    result.homeLanguage = homeLanguage;
  }
  if (input.targetGrade !== undefined) {
    if (!Number.isInteger(input.targetGrade) || (input.targetGrade as number) < 1 || (input.targetGrade as number) > 12) {
      throw new GenerationRequestError('targetGrade must be an integer from 1 through 12.');
    }
    result.targetGrade = input.targetGrade as number;
  }
  return result;
}

function optionalString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new GenerationRequestError(`${field} must be a non-empty string when provided.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new GenerationRequestError(`${field} is too long.`);
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
