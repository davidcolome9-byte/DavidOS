// Repository privacy validation: fails when personal location or home-
// timezone literals (or other known-personal markers) appear in tracked
// text files. This repo is PUBLIC — see AGENTS.md §2.1.
//
// Genuinely generic synthetic examples are permitted only through the
// narrow ALLOWLIST below (exact file + exact literal). localhost and
// public repository URLs are not private data and are never flagged.
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Patterns that indicate PERSONAL data. Keep them personal-specific:
 * generic tech words, localhost, and public URLs must not match.
 * Each entry: { name, regex } — regex is applied per line.
 *
 * Personal term fragments are stored base64-encoded so this public file
 * never contains the literals it guards against (decode locally if you
 * need to audit them).
 */
const b64 = (s) => Buffer.from(s, 'base64').toString('utf8');

export const PRIVACY_PATTERNS = [
  {
    name: 'IANA home-timezone literal',
    // Region/City timezone identifiers. The app uses device-local time;
    // a concrete home timezone is personal scheduling data.
    regex: /\b(?:America|Europe|Asia|Africa|Australia|Antarctica|Atlantic|Indian|Pacific)\/[A-Z][A-Za-z_]+(?:\/[A-Z][A-Za-z_]+)?\b/g,
  },
  {
    name: 'personal location',
    regex: new RegExp(`\\b${b64('UGVuc2Fjb2xh')}\\b`, 'gi'),
  },
  {
    name: 'personal surname',
    // The public GitHub handle (scrubbed below) is allowed; the bare
    // surname is not.
    regex: new RegExp(`\\b${b64('Q29sb20=')}[eé]\\b`, 'gi'),
  },
];

/**
 * Exact-match allowlist: [repo-relative path, exact literal].
 * Only genuinely synthetic examples belong here — never real values.
 */
export const ALLOWLIST = [
  // Synthetic fixture used by the privacy-validation unit tests.
  ['src/lib/__tests__/privacyValidation.test.ts', 'Antarctica/South_Pole'],
];

// The GitHub owner handle is public repo metadata, not private data.
const PUBLIC_LITERALS = [new RegExp(b64('ZGF2aWRjb2xvbWU5'), 'gi')];

function isAllowlisted(relPath, literal) {
  return ALLOWLIST.some(([p, l]) => p === relPath.replace(/\\/g, '/') && l === literal);
}

/** Scan one file's text. Returns [{path, line, name, literal}]. */
export function findPrivacyViolations(text, relPath) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((lineText, i) => {
    const scrubbed = PUBLIC_LITERALS.reduce((t, re) => t.replace(re, ''), lineText);
    for (const { name, regex } of PRIVACY_PATTERNS) {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(scrubbed)) !== null) {
        const literal = m[0];
        if (isAllowlisted(relPath, literal)) continue;
        findings.push({ path: relPath, line: i + 1, name, literal });
      }
    }
  });
  return findings;
}

const SCAN_EXTENSIONS = /\.(md|ts|tsx|js|mjs|cjs|json|yml|yaml|css|html|txt)$/i;
// package-lock is machine-generated dependency metadata (no prose);
// this script and its test define the patterns/fixtures themselves.
const SKIP_FILES = new Set(['package-lock.json', 'scripts/validate-privacy.mjs']);

export function scanRepository() {
  const files = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f && SCAN_EXTENSIONS.test(f) && !SKIP_FILES.has(f));
  const findings = [];
  for (const f of files) {
    const text = readFileSync(join(root, f), 'utf8');
    findings.push(...findPrivacyViolations(text, f));
  }
  return { files: files.length, findings };
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (invokedDirectly) {
  const { files, findings } = scanRepository();
  if (findings.length > 0) {
    console.error(`Privacy validation FAILED — personal data must not enter this public repo:`);
    for (const f of findings) {
      console.error(`  - ${f.path}:${f.line} [${f.name}] "${f.literal}"`);
    }
    console.error('If a literal is a genuinely synthetic example, add it to the ALLOWLIST in scripts/validate-privacy.mjs with justification.');
    process.exit(1);
  }
  console.log(`Privacy validation OK — ${files} tracked text files scanned, no personal location/timezone literals.`);
}
