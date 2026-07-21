export function languageCode(value) {
  return String(value ?? '').trim().toLocaleLowerCase().split(/[-_]/u)[0];
}

export function voicesForLanguage(voices, language) {
  const target = languageCode(language);
  return [...(voices ?? [])].filter((voice) => languageCode(voice.lang) === target);
}
