import { describe, expect, it } from 'vitest';
import { normalizeApiBase, permissionOrigin } from '../config.js';

describe('extension server configuration', () => {
  it('normalizes a deployable API base URL', () => {
    expect(normalizeApiBase('https://prism.example.com/api/')).toBe('https://prism.example.com/api');
    expect(permissionOrigin('https://prism.example.com/api')).toBe('https://prism.example.com/*');
  });

  it('rejects credential-bearing and non-web addresses', () => {
    expect(() => normalizeApiBase('file:///tmp/server')).toThrow();
    expect(() => normalizeApiBase('https://user:secret@example.com')).toThrow(/credentials/i);
  });
});
