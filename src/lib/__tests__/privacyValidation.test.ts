import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs module without type declarations
import { findPrivacyViolations } from '../../../scripts/validate-privacy.mjs';

describe('privacy validation', () => {
  it('rejects a personal IANA home-timezone literal', () => {
    // Built dynamically so this tracked test file never contains the
    // contiguous literal itself.
    const tz = ['America', 'Chicago'].join('/');
    const findings = findPrivacyViolations(`home timezone is ${tz}`, 'docs/EXAMPLE.md');
    expect(findings).toHaveLength(1);
    expect(findings[0].name).toBe('IANA home-timezone literal');
  });

  it('rejects a personal location literal', () => {
    const city = ['Pensa', 'cola'].join('');
    const findings = findPrivacyViolations(`meet in ${city}`, 'docs/EXAMPLE.md');
    expect(findings).toHaveLength(1);
  });

  it('accepts generic placeholders and non-personal text', () => {
    const text = [
      'home timezone: [PRIVATE_HOME_TIMEZONE]',
      'the app uses the device-local timezone where applicable',
      'served at http://localhost:5173 and https://davidcolome9-byte.github.io/DavidOS/',
    ].join('\n');
    expect(findPrivacyViolations(text, 'docs/EXAMPLE.md')).toEqual([]);
  });

  it('accepts an allowlisted synthetic example ONLY in its approved fixture file', () => {
    const synthetic = 'Antarctica/South_Pole';
    expect(
      findPrivacyViolations(`tz example: ${synthetic}`, 'src/lib/__tests__/privacyValidation.test.ts'),
    ).toEqual([]);
    expect(findPrivacyViolations(`tz example: ${synthetic}`, 'docs/OTHER.md')).toHaveLength(1);
  });
});
