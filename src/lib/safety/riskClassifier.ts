import type { RiskLevel } from '../types';

interface RiskRule {
  level: RiskLevel;
  terms: string[];
}

// Checked in order — first match wins. Highest risk first.
const RULES: RiskRule[] = [
  {
    level: 'high_risk',
    terms: [
      'buy', 'purchase', 'pay ', 'payment', 'transfer money', 'wire', 'invest',
      'medical advice', 'diagnose', 'prescription', 'legal advice', 'lawsuit',
    ],
  },
  {
    level: 'sensitive_external_write',
    terms: [
      'send email', 'send the email', 'send gmail', 'send reply', 'send message',
      'publish', 'post to', 'share externally', 'tweet', 'upload to social',
    ],
  },
  {
    level: 'external_write',
    terms: [
      'create event', 'add to calendar', 'edit calendar', 'update event',
      'delete event', 'delete file', 'sync to drive', 'upload', 'push to github',
      'commit to', 'open pull request', 'create issue', 'send prompt to',
    ],
  },
  {
    level: 'local_write',
    terms: [
      'save', 'store', 'add to vault', 'log this', 'record', 'add reminder',
      'add project', 'add prompt', 'import',
    ],
  },
  {
    level: 'draft_only',
    terms: [
      'draft', 'generate', 'write', 'create a', 'make this', 'turn these', 'turn this',
      'summarize', 'clean this', 'clean up', 'format', 'improve', 'rewrite', 'plan',
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
    if (rule.terms.some((term) => t.includes(term))) return rule.level;
  }
  return 'read_only';
}
