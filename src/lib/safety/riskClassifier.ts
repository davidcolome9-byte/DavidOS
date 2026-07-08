import type { RiskLevel } from '../types';

interface RiskRule {
  level: RiskLevel;
  patterns: (string | RegExp)[];
}

// Checked in order — first match wins. Highest risk first.
// Regexes handle filler words ("send THIS email", "send an email to…").
const RULES: RiskRule[] = [
  {
    level: 'high_risk',
    patterns: [
      /\bbuy\b/, 'purchase', /\bpay\b/, 'payment', 'transfer money', /\bwire\b/, 'invest',
      'medical advice', 'diagnose', 'prescription', 'legal advice', 'lawsuit',
    ],
  },
  {
    level: 'sensitive_external_write',
    patterns: [
      /send\s+(?:\w+\s+){0,2}?(?:email|gmail|reply|message|text|dm)/, // send this email / send an email / send a message
      /email\s+(?:\w+\s+){0,2}?to\b/, // email this to my supervisor
      'publish', 'post to', 'share externally', 'tweet', 'upload to social',
    ],
  },
  {
    level: 'external_write',
    patterns: [
      /(?:create|add|edit|update|delete|move)\s+(?:\w+\s+){0,2}?(?:event|calendar|invite|meeting)/,
      'add to calendar', 'delete file', 'sync to drive', 'upload', 'push to github',
      'commit to', 'open pull request', 'create issue', 'send prompt to',
    ],
  },
  {
    level: 'local_write',
    patterns: [
      /\bsave\b/, /\bstore\b/, 'add to vault', 'log this', /\brecord\b/, 'add reminder',
      'add project', 'add prompt', /\bimport\b/, /\breset\b/, /\bdelete\b/, /\boverwrite\b/,
    ],
  },
  {
    level: 'draft_only',
    patterns: [
      'draft', 'generate', /\bwrite\b/, 'create a', 'make this', 'turn these', 'turn this',
      'summarize', 'clean this', 'clean up', 'format', 'improve', 'rewrite', /\bplan\b/,
      'outline', 'handoff', 'teachback', 'checklist',
    ],
  },
];

/**
 * Classify a free-text command into a risk level.
 * Defaults to read_only when nothing action-like is detected.
 */
export function classifyCommand(text: string): RiskLevel {
  const t = text.toLowerCase();
  for (const rule of RULES) {
    const hit = rule.patterns.some((p) => (typeof p === 'string' ? t.includes(p) : p.test(t)));
    if (hit) return rule.level;
  }
  return 'read_only';
}
