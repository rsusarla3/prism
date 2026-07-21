import { describe, expect, it } from 'vitest';
import { assessPagePrivacy, redactSensitiveText } from '../privacy.js';

describe('extension privacy guard', () => {
  it('blocks automatic capture on recognized sensitive surfaces', () => {
    expect(assessPagePrivacy('https://mail.google.com/mail/u/0/').sensitive).toBe(true);
    expect(assessPagePrivacy('https://www.example.com/article').sensitive).toBe(false);
  });

  it('redacts identifiers before remote storage or generation', () => {
    const result = redactSensitiveText('Email alex@example.com or call 608-555-0123. SSN 123-45-6789.');
    expect(result.text).not.toContain('alex@example.com');
    expect(result.text).not.toContain('608-555-0123');
    expect(result.text).not.toContain('123-45-6789');
    expect(result.redactionCount).toBe(3);
  });
});
