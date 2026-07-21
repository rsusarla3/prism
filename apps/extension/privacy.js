const SENSITIVE_HOST_RULES = [
  { pattern: /(^|\.)mail\.google\.com$/u, reason: 'email' },
  { pattern: /(^|\.)outlook\.(live|office)\.com$/u, reason: 'email' },
  { pattern: /(^|\.)mychart\./u, reason: 'health portal' },
  { pattern: /(^|\.)(patient|health|medical)[-\w]*portal\./u, reason: 'health portal' },
  { pattern: /(^|\.)(bank|banking|creditunion|wallet)[-\w]*\./u, reason: 'financial account' },
  { pattern: /(^|\.)(password|vault)[-\w]*\./u, reason: 'credential manager' },
];

const REDACTION_RULES = [
  { kind: 'email address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu },
  { kind: 'US Social Security number', pattern: /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/gu },
  { kind: 'payment card number', pattern: /\b(?:\d[ -]*?){13,19}\b/gu, validate: luhnLike },
  { kind: 'phone number', pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/gu },
  { kind: 'account identifier', pattern: /\b(?:account|routing|student|member)\s*(?:number|no\.?|id)?\s*[:#-]?\s*[A-Z0-9-]{6,}\b/giu },
];

function luhnLike(value) {
  const digits = value.replace(/\D/gu, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function assessPagePrivacy(url) {
  let hostname;
  try { hostname = new URL(url).hostname.toLocaleLowerCase(); } catch { return { sensitive: true, reason: 'invalid page address' }; }
  const match = SENSITIVE_HOST_RULES.find((rule) => rule.pattern.test(hostname));
  return match ? { sensitive: true, reason: match.reason } : { sensitive: false, reason: '' };
}

export function redactSensitiveText(text) {
  let output = String(text ?? '');
  const findings = [];
  for (const rule of REDACTION_RULES) {
    let count = 0;
    output = output.replace(rule.pattern, (match) => {
      if (rule.validate && !rule.validate(match)) return match;
      count += 1;
      return `[REDACTED ${rule.kind}]`;
    });
    if (count) findings.push({ kind: rule.kind, count });
  }
  return { text: output, findings, redactionCount: findings.reduce((total, finding) => total + finding.count, 0) };
}

export { SENSITIVE_HOST_RULES };
