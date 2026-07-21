import type { CapturedSourceInput } from 'prism-shared';
import { MAX_SOURCE_CHARS } from 'prism-generation';

export const MAX_CAPTURED_SOURCES = 25;

export function prepareCapturedSources(input: unknown): CapturedSourceInput[] {
  if (!isRecord(input) || !Array.isArray(input.sources)) throw badRequest('sources must be an array.');
  if (input.sources.length === 0) throw badRequest('Select at least one tab to capture.');
  if (input.sources.length > MAX_CAPTURED_SOURCES) throw badRequest(`A capture can include at most ${MAX_CAPTURED_SOURCES} tabs.`);
  return input.sources.map((source, index) => prepareSource(source, index));
}

function prepareSource(value: unknown, index: number): CapturedSourceInput {
  if (!isRecord(value)) throw badRequest(`sources[${index}] must be an object.`);
  const url = requiredString(value.url, `sources[${index}].url`, 2_048);
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw badRequest(`sources[${index}].url must be a valid URL.`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw badRequest(`sources[${index}].url must use HTTP or HTTPS.`);
  const text = requiredString(value.text, `sources[${index}].text`, MAX_SOURCE_CHARS);
  const title = requiredString(value.title, `sources[${index}].title`, 300);
  const capturedAt = requiredString(value.capturedAt, `sources[${index}].capturedAt`, 40);
  if (Number.isNaN(Date.parse(capturedAt))) throw badRequest(`sources[${index}].capturedAt must be an ISO date.`);
  return { url: parsed.toString(), title, text, capturedAt: new Date(capturedAt).toISOString() };
}

function requiredString(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw badRequest(`${path} must be a non-empty string.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw Object.assign(new Error(`${path} must not exceed ${maxLength} characters.`), { status: 413 });
  return trimmed;
}

function badRequest(message: string) { return Object.assign(new Error(message), { status: 400 }); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
