import { describe, expect, it } from 'vitest';
import { sha256Hex, shortFingerprint } from '../utils/hash';

describe('sha256Hex', () => {
  it('matches known SHA-256 vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('is stable for identical content', () => {
    const a = sha256Hex('the same prompt content');
    const b = sha256Hex('the same prompt content');
    expect(a).toBe(b);
  });

  it('differs for different content', () => {
    expect(sha256Hex('prompt a')).not.toBe(sha256Hex('prompt b'));
  });
});

describe('shortFingerprint', () => {
  it('formats as 8-hex chars plus comma-grouped char count', () => {
    const fp = shortFingerprint('x'.repeat(12420));
    expect(fp).toMatch(/^[0-9a-f]{8} · 12,420 chars$/);
  });
});
