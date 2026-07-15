// Repository privacy validation for a PUBLIC repo (see AGENTS.md §2.1).
//
// GENERIC rules only — this file contains NO real personal values in any
// form (plaintext, fragments, encodings, or reconstructions). It enforces
// public-repository hygiene:
//   1. no concrete IANA home-timezone declarations;
//   2. no private home-configuration fields carrying concrete values
//      (placeholders like [PRIVATE_HOME_TIMEZONE] are required instead);
//   3. no specific personal medical facts (DOS-GOV-001): spinal-level
//      (vertebral-pair) notation ONLY when framed as personal/profile health
//      information (a possessive or a movement-safety/injury/history context
//      signal beside it), and named or first-person possessive medical
//      wording bound to a concrete condition. These are deliberately narrow
//      so generic/technical spinal references in general documentation,
//      ordinary health/accessibility terminology ("movement-safety context",
//      "saved training restrictions", "respect the user's reported injuries"),
//      and lowercase `l4|l5` classifier tokens all keep passing. (This file
//      documents the rules with regexes rather than concrete example literals
//      so it does not trip its own scan.)
//
// An OPTIONAL private denylist of concrete personal literals can be
// supplied outside the repo via:
//   - env var  DAVIDOS_PRIVATE_DENYLIST  (comma-separated literals), or
//   - gitignored file  personal/privacy-denylist.txt  (one per line, # comments).
// Its absence does NOT weaken the generic rules above; the public CI gate
// never requires it.
//
// Scanning is content-aware over ALL git-tracked files (no extension
// allowlist): binary files are detected by content sniff; generated and
// declared-fixture skips are explicit and printed.
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = process.env.DAVIDOS_ROOT
  ? resolve(process.env.DAVIDOS_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), '..');

export const GENERIC_RULES = [
  {
    name: 'concrete IANA home-timezone literal',
    // Region/City identifiers. The app uses device-local time; committing a
    // concrete home timezone declares personal scheduling data publicly.
    regex: /\b(?:America|Europe|Asia|Africa|Australia|Antarctica|Atlantic|Indian|Pacific)\/[A-Z][A-Za-z_]+(?:\/[A-Z][A-Za-z_]+)?\b/g,
  },
  {
    name: 'private home-configuration field with a concrete value',
    // home/my/private + city/town/location/address/timezone assigned a
    // concrete value. Placeholder values (starting with "[") are the
    // required public form and do not match.
    regex: /\b(?:home|my|private)[_ -]?(?:city|town|location|address|timezone|tz)\s*[:=]\s*["'`]?(?!\[)[A-Za-z]/gi,
  },
  {
    name: 'spinal-level notation asserted as a personal medical fact',
    // Canonical vertebral-pair notation (spine letter + level, separator,
    // second level) ONLY when it sits within a short same-line window of a
    // personal- or profile-health context signal: a possessive (David's/my),
    // a movement-safety / health-profile label, or an injury/history/surgery/
    // laminectomy/herniation word. This is deliberately CONTEXTUAL, not a
    // global ban — generic or technical notation ("the L4/L5 segment is
    // discussed", "Example spinal notation: C5/C6", the lowercase `l4|l5`
    // classifier regex) has no such signal and passes. `[^\n]` keeps the
    // window on one line so unrelated lines never combine.
    regex: /(?:David'?s|\bmy\b|movement[- ]safety[- ]context|health[- ]profile[- ]context|injur\w*|back[- ]history|surgery|laminectomy|herniat\w*)[^\n]{0,24}?\b[CTL][1-9][/-][CTLS][1-9]\b|\b[CTL][1-9][/-][CTLS][1-9]\b[^\n]{0,24}?(?:\bhistory\b|injur\w*|surgery|laminectomy|herniat\w*|restriction|back[- ]history)/gi,
  },
  {
    name: 'possessive personal-health wording (named or first-person medical fact)',
    // A named individual's or first-person possessive bound to a specific
    // condition / procedure / history. Kept deliberately narrow: it requires
    // BOTH the David's/my possessive AND a concrete medical term within two
    // words, so generic instructional wording ("respect the user's reported
    // injuries", "saved training restrictions", "movement-safety context")
    // does not match. Third-person/other possessives are intentionally out of
    // scope to avoid flagging generic docs.
    regex: /\b(?:David'?s|my)\s+(?:[\w-]+\s+){0,2}(?:herniat\w*|laminectomy|disc\b|spinal\b|diagnos\w+|surgery|(?:back|medical|injury)\s+history|axial[- ]loading)/gi,
  },
];

/**
 * Optional PRIVATE denylist — never tracked, never required. Missing
 * sources simply contribute nothing.
 */
export function loadPrivateDenylist(env = process.env) {
  const items = [];
  if (env.DAVIDOS_PRIVATE_DENYLIST) {
    items.push(...env.DAVIDOS_PRIVATE_DENYLIST.split(',').map((s) => s.trim()).filter(Boolean));
  }
  const file = join(root, 'personal', 'privacy-denylist.txt');
  if (existsSync(file)) {
    items.push(
      ...readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('#')),
    );
  }
  return items;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Scan one file's text with the generic rules + an optional denylist. */
export function findPrivacyViolations(text, relPath, denylist = []) {
  const findings = [];
  const rules = [
    ...GENERIC_RULES,
    ...denylist.map((literal) => ({
      name: 'private denylist literal',
      regex: new RegExp(escapeRegex(literal), 'gi'),
    })),
  ];
  text.split(/\r?\n/).forEach((lineText, i) => {
    for (const { name, regex } of rules) {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(lineText)) !== null) {
        findings.push({ path: relPath, line: i + 1, name, literal: m[0] });
      }
    }
  });
  return findings;
}

/** Content sniff: a NUL byte in the first 8KB marks a file as binary. */
export function isProbablyBinary(buffer) {
  const n = Math.min(buffer.length, 8000);
  for (let i = 0; i < n; i++) if (buffer[i] === 0) return true;
  return false;
}

/** Explicit, justified skips — everything else tracked gets scanned. */
export const DECLARED_SKIPS = new Map([
  ['package-lock.json', 'machine-generated npm metadata'],
  ['src/lib/__tests__/privacyValidation.test.ts', 'declared privacy-rule test fixture (synthetic examples only)'],
]);

/** Binary extensions whose skip needs no per-file callout in the output. */
const OBVIOUS_BINARY = /\.(png|jpg|jpeg|gif|ico|webp|woff2?|ttf|otf|pdf|zip)$/i;

export function scanRepository(denylist = loadPrivateDenylist()) {
  const tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);

  const findings = [];
  const errors = [];
  const skipped = [];
  let scanned = 0;

  for (const f of tracked) {
    const declaredReason = DECLARED_SKIPS.get(f);
    if (declaredReason) {
      skipped.push({ path: f, reason: declaredReason, notable: true });
      continue;
    }
    let buffer;
    try {
      buffer = readFileSync(join(root, f));
    } catch (e) {
      errors.push(`cannot read tracked file ${f}: ${e.message}`); // fail safely
      continue;
    }
    if (isProbablyBinary(buffer)) {
      skipped.push({ path: f, reason: 'binary content', notable: !OBVIOUS_BINARY.test(f) });
      continue;
    }
    scanned++;
    findings.push(...findPrivacyViolations(buffer.toString('utf8'), f, denylist));
  }

  return { tracked: tracked.length, scanned, skipped, findings, errors };
}

const invokedDirectly =
  !!process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  const denylist = loadPrivateDenylist();
  const { tracked, scanned, skipped, findings, errors } = scanRepository(denylist);

  for (const s of skipped.filter((s) => s.notable)) {
    console.log(`  skipped: ${s.path} (${s.reason})`);
  }
  if (errors.length) {
    console.error('Privacy validation FAILED — unreadable tracked files:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  if (findings.length) {
    console.error('Privacy validation FAILED — personal data must not enter this public repo:');
    for (const f of findings) console.error(`  - ${f.path}:${f.line} [${f.name}] "${f.literal}"`);
    process.exit(1);
  }
  console.log(
    `Privacy validation OK — ${tracked} tracked files considered, ${scanned} scanned as text, ` +
      `${skipped.length} skipped (binary/generated/fixture); generic rules${denylist.length ? ` + ${denylist.length} private denylist entries` : ''}, no findings.`,
  );
}
