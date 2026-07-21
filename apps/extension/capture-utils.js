const SCRIPT_TOKENS = /(?:\bfunction\b|\btypeof\b|\breturn\b|\bvar\b|\bconst\b|\blet\b|window\.|document\.|localStorage|addEventListener|postMessage|JSON\.(?:parse|stringify)|__tcfapi|__gpp|recaptcha|googlesyndication)/giu;

export function isLikelyScriptNoise(value) {
  const text = String(value ?? '').trim();
  if (!text) return true;
  const tokenMatches = text.match(SCRIPT_TOKENS)?.length ?? 0;
  const punctuationMatches = text.match(/[{}[\]();=<>]/gu)?.length ?? 0;
  const punctuationRatio = punctuationMatches / Math.max(text.length, 1);
  return tokenMatches >= 3 || (tokenMatches >= 1 && punctuationRatio > 0.045) || punctuationRatio > 0.11;
}

export function cleanCapturedText(value) {
  const sections = String(value ?? '')
    .split(/\n{2,}/u)
    .map((section) => section.replace(/\s+/gu, ' ').trim())
    .filter((section) => section.length > 1 && !isLikelyScriptNoise(section));
  return [...new Set(sections)].join('\n\n');
}

function originOf(value) {
  try { return new URL(value).origin; } catch { return ''; }
}

/** Keeps the top document and same-origin educational frames; ad/consent frames are discarded. */
export function combineReadableFrames(frameResults, fallbackUrl = '') {
  const frames = frameResults
    .map(({ result, frameId }) => result ? { ...result, frameId, text: cleanCapturedText(result.text) } : null)
    .filter((frame) => frame?.text);
  const main = frames.find((frame) => frame.frameId === 0) || frames[0];
  if (!main) return { main: null, text: '' };
  const pageUrl = main.url || fallbackUrl;
  const pageOrigin = originOf(pageUrl);
  const allowed = frames.filter((frame) => frame === main || (pageOrigin && originOf(frame.url) === pageOrigin));
  const seen = new Set();
  const sections = [];
  for (const frame of allowed) {
    if (!frame.text || seen.has(frame.text)) continue;
    seen.add(frame.text);
    sections.push(frame.text);
  }
  return { main, text: sections.join('\n\n').slice(0, 30000) };
}
