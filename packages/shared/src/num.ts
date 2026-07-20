/**
 * Input sanitization helpers (shared, deterministic).
 *
 * The web UI reads raw <input> values that can be empty or non-numeric.
 * Centralizing parsing here means the server and any future client agree on
 * what counts as a valid finite number, and tests can cover it once.
 */

/** Parse a value into a finite number. Returns null when the value is missing,
 *  empty, NaN, or non-finite (Infinity). Callers must reject null. */
export function parseFinite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Parse many fields, returning null if ANY is invalid (so a handler can 400). */
export function parseFiniteAll(values: unknown[]): number[] | null {
  const out: number[] = [];
  for (const v of values) {
    const n = parseFinite(v);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}
