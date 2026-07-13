import { describe, expect, it } from 'vitest';
import { COMMANDS, matchCommand } from '../commands';

describe('matchCommand', () => {
  it('matches an exact slash command', () => {
    expect(matchCommand('/brief')?.command.slash).toBe('/brief');
  });

  it('is case-insensitive (mobile keyboards capitalize)', () => {
    // Regression: suggestions matched case-insensitively but submit did not,
    // so "/Settings" silently fell through to free-text intent routing.
    expect(matchCommand('/Settings')?.command.slash).toBe('/settings');
    expect(matchCommand('/OS STATUS')?.command.slash).toBe('/os status');
  });

  it('prefers the longest slash and preserves original-case args', () => {
    const m = matchCommand('/os route Send my Boss an update');
    expect(m?.command.slash).toBe('/os route');
    expect(m?.args).toBe('Send my Boss an update');
  });

  it('returns null for free text and unknown commands', () => {
    expect(matchCommand('plan my day')).toBeNull();
    expect(matchCommand('/nope')).toBeNull();
  });

  it('every command target is a nav:, wf:, or route target', () => {
    for (const c of COMMANDS) {
      expect(
        c.target === 'route' || c.target.startsWith('nav:/') || c.target.startsWith('wf:'),
        `bad target for ${c.slash}: ${c.target}`,
      ).toBe(true);
    }
  });
});
