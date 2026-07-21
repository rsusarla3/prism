export const DEFAULT_API_BASE = 'http://localhost:8787';

export function normalizeApiBase(value) {
  const parsed = new URL(String(value ?? '').trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an HTTP or HTTPS server address.');
  if (parsed.username || parsed.password) throw new Error('Do not put credentials in the server address.');
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
  return parsed.toString().replace(/\/$/u, '');
}

export function permissionOrigin(value) {
  const parsed = new URL(normalizeApiBase(value));
  return `${parsed.origin}/*`;
}
