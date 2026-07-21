export function languageCode(value) {
  return String(value ?? '').trim().toLocaleLowerCase().split(/[-_]/u)[0];
}

export function voicesForLanguage(voices, language) {
  const target = languageCode(language);
  return [...(voices ?? [])].filter((voice) => languageCode(voice.lang) === target);
}

/**
 * Web Speech can silently stop on long utterances in Chromium. Keep each
 * request short enough to be reliable while preserving sentence boundaries.
 */
export function chunkSpeechText(value, maxLength = 240) {
  const sentences = String(value ?? '').trim().match(/[^.!?]+[.!?]+|[^.!?]+$/gu) ?? [];
  const chunks = [];
  let chunk = '';

  for (const sentence of sentences) {
    const text = sentence.trim();
    if (!text) continue;
    if (chunk && chunk.length + text.length + 1 > maxLength) {
      chunks.push(chunk);
      chunk = '';
    }
    if (text.length <= maxLength) {
      chunk = chunk ? `${chunk} ${text}` : text;
      continue;
    }
    if (chunk) chunks.push(chunk);
    for (let start = 0; start < text.length; start += maxLength) chunks.push(text.slice(start, start + maxLength));
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
