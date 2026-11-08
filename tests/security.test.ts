import { describe, expect, it } from 'vitest';
import { isAllowedHost, isAllowedOrigin, securityHeaders } from '../src/server/security.js';

const PORT = 4747;

describe('isAllowedHost', () => {
  it.each(['127.0.0.1:4747', 'localhost:4747', 'LOCALHOST:4747'])('aceita %s', (host) => {
    expect(isAllowedHost(host, PORT)).toBe(true);
  });

  it.each([
    undefined,
    '',
    '127.0.0.1',
    'localhost',
    '127.0.0.1:4748',
    'evil.com:4747',
    'localhost.evil.com:4747',
    '0.0.0.0:4747',
    '[::1]:4747',
  ])('recusa %s', (host) => {
    expect(isAllowedHost(host, PORT)).toBe(false);
  });
});

describe('isAllowedOrigin', () => {
  it.each(['http://127.0.0.1:4747', 'http://localhost:4747'])('aceita %s', (origin) => {
    expect(isAllowedOrigin(origin, PORT)).toBe(true);
  });

  it.each([
    undefined,
    '',
    'null',
    'https://127.0.0.1:4747',
    'http://127.0.0.1:4748',
    'http://evil.com',
    'http://localhost:4747.evil.com',
    'http://127.0.0.1:4747/',
  ])('recusa %s', (origin) => {
    expect(isAllowedOrigin(origin, PORT)).toBe(false);
  });
});

describe('securityHeaders', () => {
  const headers = securityHeaders(PORT);

  it('envia CSP restritiva que libera só o WebSocket local na porta certa', () => {
    const csp = headers['Content-Security-Policy'] ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain('connect-src ws://127.0.0.1:4747 ws://localhost:4747');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
  });

  it('envia nosniff, no-referrer e no-store', () => {
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['Cache-Control']).toBe('no-store');
  });
});
