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
