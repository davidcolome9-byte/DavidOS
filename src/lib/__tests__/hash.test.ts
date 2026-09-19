import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { sha256Hex, shortFingerprint } from '../utils/hash';

// node:crypto is the independent oracle for the deliberately synchronous,
// dependency-free implementation (which must stay sync for render paths).
const oracle = (input: string) => createHash('sha256').update(input, 'utf8').digest('hex');

describe('sha256Hex vs node:crypto oracle', () => {
  it('matches for empty and Unicode input', () => {
    for (const s of ['', 'héllo wörld', '日本語のテキスト', '🚀 emoji 👩‍💻 zwj', 'é combining', '\u0000nul\u0000']) {
      expect(sha256Hex(s), JSON.stringify(s)).toBe(oracle(s));
    }
  });

  it('matches at SHA-256 padding block boundaries (ASCII bytes)', () => {
    // 55 = largest single-block message; 56 forces a second padding block;
    // 63/64/65 straddle a whole block; 127/128/129 repeat that at two blocks.
    for (const n of [55, 56, 63, 64, 65, 127, 128, 129]) {
      const s = 'a'.repeat(n);
      expect(sha256Hex(s), `${n} bytes`).toBe(oracle(s));
    }
  });

  it('matches when multi-byte characters land on the block boundaries', () => {
    // 'é' is 2 UTF-8 bytes; the odd-length variants shift the boundary by one byte.
    for (const n of [55, 56, 63, 64, 65, 127, 128, 129]) {
      const even = 'é'.repeat(Math.floor(n / 2)) + (n % 2 ? 'x' : '');
      expect(sha256Hex(even), `${n} bytes (2-byte chars)`).toBe(oracle(even));
      const emoji = '🚀'.repeat(Math.floor(n / 4)) + 'x'.repeat(n % 4); // 4-byte chars
      expect(sha256Hex(emoji), `${n} bytes (4-byte chars)`).toBe(oracle(emoji));
    }
  });

  it('matches for long strings', () => {
    const long = 'The quick brown fox jumps over the lazy dog. '.repeat(20_000); // ~900 KB
    expect(sha256Hex(long)).toBe(oracle(long));
    const longUnicode = 'naïve café 日本語 🚀 '.repeat(10_000);
    expect(sha256Hex(longUnicode)).toBe(oracle(longUnicode));
  });
});

describe('sha256Hex', () => {
  it('matches known SHA-256 vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('stays synchronous (returns a string, not a Promise)', () => {
    expect(typeof sha256Hex('sync')).toBe('string');
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
