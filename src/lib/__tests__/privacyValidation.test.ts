import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs module without type declarations
import { findPrivacyViolations, isProbablyBinary, DECLARED_SKIPS } from '../../../scripts/validate-privacy.mjs';

// DECLARED FIXTURE FILE: every concrete example below is synthetic and
// unrelated to any real user. The CLI scan skips this file by declared
// policy (printed in its output); these tests exercise the rules directly.

describe('privacy validation — generic rules', () => {
  it('rejects a concrete IANA home-timezone declaration', () => {
    const findings = findPrivacyViolations('home timezone is Europe/Zurich for routines', 'docs/EXAMPLE.md');
    expect(findings).toHaveLength(1);
    expect(findings[0].name).toBe('concrete IANA home-timezone literal');
    expect(findings[0].literal).toBe('Europe/Zurich');
  });

  it('rejects a three-part IANA identifier too', () => {
    expect(findPrivacyViolations('tz: Antarctica/South_Pole', 'seed/context/x.md')).toHaveLength(1);
  });

  it('rejects a private home-configuration field carrying a concrete value', () => {
    const findings = findPrivacyViolations('homeCity: "Testville"', 'seed/context/user-profile.md');
    expect(findings).toHaveLength(1);
    expect(findings[0].name).toBe('private home-configuration field with a concrete value');
  });

  it('accepts the required placeholder form', () => {
    expect(findPrivacyViolations('home_timezone: [PRIVATE_HOME_TIMEZONE]', 'docs/EXAMPLE.md')).toEqual([]);
  });

  it('accepts device-local wording and public URLs', () => {
    const text = [
      'the app uses the device-local timezone where applicable',
      'served at http://localhost:5173 and https://davidcolome9-byte.github.io/DavidOS/',
    ].join('\n');
    expect(findPrivacyViolations(text, 'docs/EXAMPLE.md')).toEqual([]);
  });

  it('applies an optional private denylist without weakening generic rules', () => {
    const findings = findPrivacyViolations('meeting in Fictionburg tomorrow', 'docs/EXAMPLE.md', ['Fictionburg']);
    expect(findings).toHaveLength(1);
    expect(findings[0].name).toBe('private denylist literal');
    // Empty denylist → generic rules still fully active.
    expect(findPrivacyViolations('tz Pacific/Fakeland', 'docs/EXAMPLE.md', [])).toHaveLength(1);
  });
});

describe('privacy validation — personal medical facts (DOS-GOV-001)', () => {
  // PROHIBITED: specific personal medical facts must be caught. Every literal
  // here is synthetic; this fixture file is a declared scan skip.
  const SPINAL_RULE = 'spinal-level notation asserted as a personal medical fact';

  it('rejects spinal-level notation framed as personal/profile health info', () => {
    const prohibited = [
      'Movement safety context: L4/L5 back history',
      "David's L4/L5 history",
      'my L5-S1 injury',
      'Health Profile context: C5/C6 surgery',
    ];
    for (const s of prohibited) {
      const f = findPrivacyViolations(s, 'docs/EXAMPLE.md');
      expect(f, s).toHaveLength(1);
      expect(f[0].name, s).toBe(SPINAL_RULE);
    }
    // The finding still surfaces the offending notation for the reviewer.
    expect(findPrivacyViolations("David's L4/L5 history", 'docs/EXAMPLE.md')[0].literal).toContain('L4/L5');
  });

  it('rejects named/first-person possessive medical wording', () => {
    expect(findPrivacyViolations("David's laminectomy from 2019", 'docs/EXAMPLE.md')).toHaveLength(1);
    expect(findPrivacyViolations('my herniated disc still aches', 'docs/EXAMPLE.md')).toHaveLength(1);
    expect(findPrivacyViolations("David's back history is relevant", 'docs/EXAMPLE.md')).toHaveLength(1);
  });

  // SAFE: generic or technical spinal references must keep passing — the rule
  // must NOT become a global ban on the notation.
  it('allows generic or technical spinal references with no personal context', () => {
    expect(findPrivacyViolations('The L4/L5 segment is discussed in this general anatomy guide.', 'docs/anatomy.md')).toEqual([]);
    expect(findPrivacyViolations('Example spinal notation: C5/C6.', 'docs/notation.md')).toEqual([]);
  });

  it('does not flag lowercase l4|l5 classifier tokens inside code regexes', () => {
    const code = 'const BACK = /l4|l5|laminectomy|herniat/i; // classifier keywords';
    expect(findPrivacyViolations(code, 'src/lib/health/profilePrompt.ts')).toEqual([]);
  });

  // SAFE: generic health/accessibility terminology must keep passing too.
  it('accepts generic movement-safety and accessibility terminology', () => {
    const text = [
      'Movement safety context: reported back-safety context. Avoid axial loading.',
      'saved training restrictions and user-approved health context',
      'relevant physical limitations are respected',
      'Respect the movement restrictions the user has reported.',
      'This page documents accessible, injury-aware exercise substitutions in general.',
    ].join('\n');
    expect(findPrivacyViolations(text, 'docs/ACCESSIBILITY.md')).toEqual([]);
  });

  it('does not flag a generic (non-named, non-first-person) possessive', () => {
    // "the user's reported injuries" is instructional, not a real person's fact.
    expect(findPrivacyViolations("respect the user's reported injuries", 'docs/EXAMPLE.md')).toEqual([]);
    // "my back?" without a bound condition is not a stated medical fact.
    expect(findPrivacyViolations('Is this workout safe for my back?', 'src/x.test.ts')).toEqual([]);
  });
});

describe('privacy validation — tracked-text scanning', () => {
  it('scans extension-less and dot-prefixed paths (no extension allowlist)', () => {
    // HOME_TZ=<concrete value> trips BOTH generic rules: the IANA literal
    // and the home-config-field-with-concrete-value rule.
    const envFindings = findPrivacyViolations('HOME_TZ=Europe/Zurich', '.env.example');
    expect(envFindings.map((f: { name: string }) => f.name).sort()).toEqual([
      'concrete IANA home-timezone literal',
      'private home-configuration field with a concrete value',
    ]);
    expect(findPrivacyViolations('tz Europe/Zurich', 'LICENSE')).toHaveLength(1);
  });

  it('detects a prohibited marker in a webmanifest path', () => {
    expect(findPrivacyViolations('{"tz":"Europe/Zurich"}', 'public/manifest.webmanifest')).toHaveLength(1);
  });

  it('classifies NUL-containing content as binary without crashing', () => {
    expect(isProbablyBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]))).toBe(true);
    expect(isProbablyBinary(Buffer.from('plain text content', 'utf8'))).toBe(false);
  });

  it('declares its skips explicitly (this fixture file among them)', () => {
    expect(DECLARED_SKIPS.has('src/lib/__tests__/privacyValidation.test.ts')).toBe(true);
    expect(DECLARED_SKIPS.has('package-lock.json')).toBe(true);
  });
});
