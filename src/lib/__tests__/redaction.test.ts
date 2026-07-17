import { describe, expect, it } from 'vitest';
import { fingerprintInput, redactedCommandLabel } from '../audit/redaction';
import { resolveDomainRouteCommand } from '../commands';

const SECRET = 'SENTINEL-SECRET-7c1f2a';

describe('audit redaction (Priority 5)', () => {
  it('fingerprints are non-reversible and never contain the input', () => {
    const fp = fingerprintInput(SECRET);
    expect(fp).toMatch(/^[0-9a-f]{12}$/);
    expect(fp).not.toContain('SENTINEL');
  });

  it('blank input fingerprints as "empty"', () => {
    expect(fingerprintInput('')).toBe('empty');
    expect(fingerprintInput('   ')).toBe('empty');
  });

  it('the same input always fingerprints the same way (stable correlation)', () => {
    expect(fingerprintInput(SECRET)).toBe(fingerprintInput(SECRET));
  });

  it('redacted command labels carry only event type, fingerprint, and length', () => {
    const label = redactedCommandLabel('Routed command (ambiguous)', SECRET);
    expect(label).not.toContain('SENTINEL');
    expect(label).toContain('Routed command (ambiguous)');
    expect(label).toContain(`${SECRET.length} chars`);
    expect(label).toMatch(/fp [0-9a-f]{12}/);
  });

  it('domain-route resolution never echoes the raw command text', () => {
    const secretRoute = `${SECRET} please`;
    const r = resolveDomainRouteCommand(secretRoute);
    // Serialize the whole resolution EXCEPT routeInput (which the router needs).
    const { routeInput: _routeInput, ...safe } = r;
    expect(JSON.stringify(safe)).not.toContain('SENTINEL');
  });
});
