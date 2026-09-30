// Validates DavidOS Skills (DOS-AI-001B): repository-authored procedure files
// at skills/<id>/SKILL.md, using a bounded DavidOS profile of the Agent Skills
// SKILL.md convention. Skills are NOT loaded by the app, routed to, or executed
// by DavidOS; this script is the only thing that reads them.
//
// The frontmatter parser below accepts a deliberately restricted YAML subset
// (flat keys plus one `metadata:` block of string values) and FAILS CLOSED on
// anything else. It exists so no YAML dependency is needed; files it accepts
// remain valid YAML for any standard Agent Skills reader.
//
// Deterministic only: structure, closed vocabularies, id/reference rules,
// tier/risk/tool consistency, size caps, hidden-character and credential-shape
// rejection. Quality, duplication of doctrine, and provider-independence are
// HUMAN/AI JUDGMENT, performed under skills/skill-authoring review mode.
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// DAVIDOS_ROOT is a test-only override (same contract as validate-seed.mjs)
// so CLI failure paths can run against an isolated fixture tree.
const root = process.env.DAVIDOS_ROOT
  ? resolve(process.env.DAVIDOS_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), '..');

export const SKILL_CONTRACT_VERSION = '1';
export const SKILL_STATUSES = ['draft', 'active', 'deprecated'];
// tier_1_local is deliberately absent: Tier 1 is deterministic local DavidOS
// code/navigation, and a Skill is a prose procedure for an assistant/executor.
export const SKILL_TIERS = ['tier_2_assistant', 'tier_3_executor'];
// external_write and above are deliberately absent: DOS-AI-001B Skills describe
// procedures, not gated external actions.
export const SKILL_RISKS = ['read_only', 'draft_only', 'local_write'];
const REJECTED_RISKS = ['external_write', 'sensitive_external_write', 'high_risk'];
// Capability DESCRIPTIONS, not permission grants.
export const SKILL_TOOLS = ['none', 'web_search', 'repo_read', 'repo_write', 'shell_run'];
export const REQUIRED_SECTIONS = [
  'Purpose', 'When to use', 'Inputs', 'Procedure', 'Constraints',
  'Tool requirements', 'Output', 'Verification', 'Stop conditions', 'Authority',
];
export const OPTIONAL_SECTIONS = ['Examples'];
export const AUTHORITY_MARKER = 'No authority is granted by this skill.';
export const MAX_SKILL_LINES = 400;
export const MAX_SKILL_BYTES = 20 * 1024;

const FRONTMATTER_KEYS = ['name', 'description', 'metadata'];
const REQUIRED_METADATA = [
  'davidos-contract', 'davidos-version', 'davidos-status', 'davidos-tiers', 'davidos-risk',
];
const METADATA_KEYS = [...REQUIRED_METADATA, 'davidos-related'];
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
// Plain (unquoted) metadata values YAML would type as non-strings; Agent Skills
// metadata is a string->string map, so these must be quoted.
const NON_STRING_PLAIN = /^(?:[-+]?(?:\d[\d_]*)(?:\.\d*)?(?:[eE][-+]?\d+)?|\.\d+|0x[0-9a-fA-F]+|0o[0-7]+|true|false|yes|no|on|off|null|~)$/i;

const SECRET_SHAPES = [
  ['API-key-shaped token', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['bearer token', /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['credential assignment', /\b(?:api[_-]?key|secret|password|passwd|access[_-]?token|auth[_-]?token)\b["']?\s*[:=]\s*["']?[A-Za-z0-9/+_-]{16,}/i],
];

const normalizeId = (id) => String(id).toLowerCase().replace(/_/g, '-');

/** Zero-width, bidi-control, and C0 control characters hide or reorder text. */
function isHiddenCharCode(c) {
  return (
    c <= 0x08 || c === 0x0b || c === 0x0c || (c >= 0x0e && c <= 0x1f) || c === 0x7f ||
    c === 0x061c ||
    (c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) ||
    (c >= 0x2060 && c <= 0x2064) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff
  );
}

function findHiddenCharacters(text) {
  const found = [];
  let line = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x0a) { line++; continue; }
    if (isHiddenCharCode(c)) found.push({ line, code: c });
  }
  return found;
}

/**
 * Parse one frontmatter scalar. Double-quoted strings allow only \" and \\;
 * plain scalars reject every construct that would change YAML meaning.
 */
function parseScalar(rawValue) {
  const value = (rawValue ?? '').trim();
  if (value === '') return { error: 'value is empty' };
  if (value.startsWith('"')) {
    let out = '';
    let i = 1;
    let closed = false;
    for (; i < value.length; i++) {
      const ch = value[i];
      if (ch === '\\') {
        const next = value[i + 1];
        if (next === '"' || next === '\\') { out += next; i++; continue; }
        return { error: 'unsupported escape sequence (only \\" and \\\\ are allowed)' };
      }
      if (ch === '"') { closed = true; i++; break; }
      out += ch;
    }
    if (!closed) return { error: 'unterminated double-quoted string' };
    if (value.slice(i).trim() !== '') return { error: 'unexpected text after the closing quote' };
    return { value: out, quoted: true };
  }
  if (/^[[\]{}&*!|>'%@`#]/.test(value) || /^[-?](?: |$)/.test(value)) {
    return { error: `unsupported YAML syntax at the start of the value ("${value[0]}")` };
  }
  if (/ #/.test(value)) return { error: 'inline comments are not supported' };
  if (/:(?: |$)/.test(value)) return { error: 'a plain value containing ": " must be double-quoted' };
  return { value, quoted: false };
}

/**
 * Split a SKILL.md into frontmatter (restricted YAML subset) and body.
 * Returns { errors, frontmatter, body }; frontmatter is null when it cannot be
 * parsed at all. Unsupported structure is an error, never silently skipped.
 */
export function parseSkillFile(rawText) {
  const errors = [];
  const text = rawText.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  if (lines[0] !== '---') {
    return { errors: ['missing frontmatter: the file must start with a "---" line'], frontmatter: null, body: text };
  }
  const end = lines.indexOf('---', 1);
  if (end === -1) {
    return { errors: ['unterminated frontmatter: no closing "---" line'], frontmatter: null, body: text };
  }
  const body = lines.slice(end + 1).join('\n');
  const frontmatter = Object.create(null);
  let metadata = null;
  let inMetadata = false;

  for (let idx = 1; idx < end; idx++) {
    const line = lines[idx];
    const where = `frontmatter line ${idx + 1}`;
    if (line.includes('\t')) { errors.push(`${where}: tabs are not allowed`); continue; }
    if (line.trim() === '') { errors.push(`${where}: blank lines are not allowed in frontmatter`); continue; }
    if (line.trimStart().startsWith('#')) { errors.push(`${where}: comments are not supported`); continue; }
    const indent = line.length - line.trimStart().length;

    if (indent === 0) {
      inMetadata = false;
      const m = /^([A-Za-z][A-Za-z0-9_-]*):(?: (.*))?$/.exec(line);
      if (!m) { errors.push(`${where}: unsupported syntax (expected "key: value")`); continue; }
      const key = m[1];
      if (key in frontmatter) { errors.push(`${where}: duplicate key "${key}"`); continue; }
      if (key === 'metadata') {
        if ((m[2] ?? '').trim() !== '') {
          errors.push(`${where}: "metadata" must be a block map of indented key/value lines`);
          continue;
        }
        metadata = Object.create(null);
        frontmatter.metadata = metadata;
        inMetadata = true;
        continue;
      }
      const scalar = parseScalar(m[2]);
      if (scalar.error) { errors.push(`${where}: "${key}" ${scalar.error}`); continue; }
      frontmatter[key] = scalar.value;
    } else if (inMetadata && indent === 2) {
      const m = /^ {2}([A-Za-z][A-Za-z0-9_-]*):(?: (.*))?$/.exec(line);
      if (!m) { errors.push(`${where}: unsupported syntax (expected "  key: value" under metadata)`); continue; }
      const key = m[1];
      if (key in metadata) { errors.push(`${where}: duplicate metadata key "${key}"`); continue; }
      const scalar = parseScalar(m[2]);
      if (scalar.error) { errors.push(`${where}: metadata "${key}" ${scalar.error}`); continue; }
      if (!scalar.quoted && NON_STRING_PLAIN.test(scalar.value)) {
        errors.push(`${where}: metadata "${key}" is ambiguous as a YAML type; double-quote it so it stays a string`);
        continue;
      }
      metadata[key] = scalar.value;
    } else if (inMetadata && indent > 2) {
      errors.push(`${where}: nested structure under metadata is not supported (string values only)`);
    } else {
      errors.push(`${where}: unexpected indentation`);
    }
  }
  return { errors, frontmatter, body };
}

/**
 * Split the body into H2 sections. Headings and list markers inside fenced code
 * blocks do not count; each line keeps its `fenced` flag so structure checks can
 * ignore quoted examples (e.g. the Meta-Skill's embedded template).
 */
export function parseSkillBody(body) {
  const errors = [];
  const sections = [];
  let current = null;
  let fence = null;
  for (const text of body.split('\n')) {
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    let fenced = false;
    if (fence) {
      fenced = true;
      if (open && open[1][0] === fence.char && open[1].length >= fence.len && open[2].trim() === '') fence = null;
    } else if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = { char: open[1][0], len: open[1].length };
      fenced = true;
    }
    if (!fenced) {
      const h = /^## +(.+?)\s*$/.exec(text);
      if (h) { current = { title: h[1], lines: [] }; sections.push(current); continue; }
    }
    if (current) current.lines.push({ text, fenced });
  }
  if (fence) errors.push('unterminated code fence in the body');
  return { errors, sections };
}

const proseLines = (section) => section.lines.filter((l) => !l.fenced);
const BULLET = /^ {0,3}[-*+]\s+(\S.*)$/;

function validateSections(sections, add) {
  const titles = sections.map((s) => s.title);
  const allowed = [...REQUIRED_SECTIONS, ...OPTIONAL_SECTIONS];
  let structural = false;
  for (const title of allowed) {
    const n = titles.filter((t) => t === title).length;
    if (n === 0 && REQUIRED_SECTIONS.includes(title)) { add(`missing required section "## ${title}"`); structural = true; }
    if (n > 1) { add(`section "## ${title}" appears ${n} times (must appear exactly once)`); structural = true; }
  }
  for (const title of titles) {
    if (!allowed.includes(title)) { add(`unknown section "## ${title}" (allowed: ${allowed.join(', ')})`); structural = true; }
  }
  if (!structural) {
    const expected = [...REQUIRED_SECTIONS, ...(titles.includes('Examples') ? ['Examples'] : [])];
    if (titles.join('|') !== expected.join('|')) {
      add(`sections are out of order: expected ${expected.join(' > ')}; found ${titles.join(' > ')}`);
    }
  }

  const byTitle = new Map(sections.map((s) => [s.title, s]));
  for (const title of allowed) {
    const section = byTitle.get(title);
    if (section && section.lines.every((l) => l.text.trim() === '')) add(`section "## ${title}" is empty`);
  }

  const procedure = byTitle.get('Procedure');
  if (procedure) {
    const steps = proseLines(procedure).filter((l) => /^ {0,3}\d+\.\s+\S/.test(l.text));
    if (steps.length < 2) add('"## Procedure" needs at least two numbered steps');
  }
  for (const title of ['Constraints', 'Verification', 'Stop conditions']) {
    const section = byTitle.get(title);
    if (section && !proseLines(section).some((l) => BULLET.test(l.text))) {
      add(`"## ${title}" needs at least one bullet`);
    }
  }
  const authority = byTitle.get('Authority');
  if (authority && !proseLines(authority).some((l) => l.text.includes(AUTHORITY_MARKER))) {
    add(`"## Authority" must contain the exact sentence: ${AUTHORITY_MARKER}`);
  }
}

/** Returns the capability labels declared under "## Tool requirements". */
function validateToolRequirements(section, add) {
  const labels = [];
  let sawBullet = false;
  for (const { text } of proseLines(section)) {
    if (text.trim() === '') continue;
    const bullet = BULLET.exec(text);
    if (bullet) {
      sawBullet = true;
      const m = /^`?([a-z][a-z_]*)`?(?=\s|$|:)/.exec(bullet[1]);
      if (!m || !SKILL_TOOLS.includes(m[1])) {
        add(`"## Tool requirements" bullet must start with a capability label (${SKILL_TOOLS.join(', ')}): "${bullet[1].slice(0, 40)}"`);
      } else {
        labels.push(m[1]);
      }
    } else if (!(sawBullet && /^ {2,}\S/.test(text))) {
      add('"## Tool requirements" may contain only capability bullets (indented lines may continue a bullet)');
      break;
    }
  }
  if (!sawBullet) add('"## Tool requirements" must list at least one capability (use "none" if no tools are needed)');
  if (labels.includes('none') && labels.length > 1) add('"## Tool requirements": "none" cannot be combined with other capabilities');
  return labels;
}

function validateRelated(value, ctx, add) {
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) { add('davidos-related is present but empty (omit the key instead)'); return; }
  for (const token of tokens) {
    const ref = /^(workflow|agent):([A-Za-z0-9_-]+)$/.exec(token);
    if (ref) {
      const known = ref[1] === 'workflow' ? ctx.workflowIds : ctx.agentIds;
      if (!known.has(ref[2])) add(`davidos-related "${token}" does not resolve to an existing ${ref[1]} id`);
      continue;
    }
    const doc = /^doc:(.+)$/.exec(token);
    if (doc) {
      const p = doc[1];
      if (/^(?:[A-Za-z]:|\/)/.test(p) || p.includes('\\') || p.split('/').some((seg) => seg === '..' || seg === '')) {
        add(`davidos-related "${token}" must be a repository-relative path without "..", backslashes, or a leading slash`);
      } else if (!ctx.docExists(p)) {
        add(`davidos-related "${token}" does not resolve to an existing file`);
      }
      continue;
    }
    add(`davidos-related "${token}" is malformed (expected workflow:<id>, agent:<id>, or doc:<relative-path>)`);
  }
}

function validateMetadata(metadata, add) {
  const tiers = [];
  let risk = null;
  for (const key of Object.keys(metadata)) {
    if (!METADATA_KEYS.includes(key)) add(`unknown metadata key "${key}" (allowed: ${METADATA_KEYS.join(', ')})`);
  }
  for (const key of REQUIRED_METADATA) {
    if (!(key in metadata)) add(`missing required metadata "${key}"`);
  }
  if ('davidos-contract' in metadata && metadata['davidos-contract'] !== SKILL_CONTRACT_VERSION) {
    add(`davidos-contract "${metadata['davidos-contract']}" is not supported (this validator supports "${SKILL_CONTRACT_VERSION}")`);
  }
  if ('davidos-version' in metadata && !SEMVER_PATTERN.test(metadata['davidos-version'])) {
    add(`davidos-version "${metadata['davidos-version']}" is not a semantic version`);
  }
  if ('davidos-status' in metadata && !SKILL_STATUSES.includes(metadata['davidos-status'])) {
    add(`davidos-status "${metadata['davidos-status']}" is not one of ${SKILL_STATUSES.join(', ')}`);
  }
  if ('davidos-tiers' in metadata) {
    const tokens = metadata['davidos-tiers'].split(/\s+/).filter(Boolean);
    if (tokens.length === 0) add('davidos-tiers must list at least one tier');
    const seen = new Set();
    for (const token of tokens) {
      if (token === 'tier_1_local') {
        add('davidos-tiers "tier_1_local" is not permitted: Tier 1 is deterministic local DavidOS code, not a prose Skill');
      } else if (!SKILL_TIERS.includes(token)) {
        add(`davidos-tiers "${token}" is not one of ${SKILL_TIERS.join(', ')}`);
      } else if (seen.has(token)) {
        add(`davidos-tiers lists "${token}" twice`);
      } else {
        seen.add(token);
        tiers.push(token);
      }
    }
  }
  if ('davidos-risk' in metadata) {
    const value = metadata['davidos-risk'];
    if (REJECTED_RISKS.includes(value)) {
      add(`davidos-risk "${value}" is not permitted: DOS-AI-001B Skills describe procedures, not gated external actions`);
    } else if (!SKILL_RISKS.includes(value)) {
      add(`davidos-risk "${value}" is not one of ${SKILL_RISKS.join(', ')}`);
    } else {
      risk = value;
    }
  }
  return { tiers, risk };
}

/**
 * Validate one SKILL.md. `ctx` supplies the repo facts the rules need:
 * { agentIds:Set, workflowIds:Set, docExists:(relPath)=>boolean }.
 * Returns { errors, frontmatter } with every message prefixed by `relPath`.
 */
export function validateSkillText({ text, dirName, relPath, ctx }) {
  const errors = [];
  const add = (message) => errors.push(`${relPath}: ${message}`);

  const lineCount = text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
  if (lineCount > MAX_SKILL_LINES) add(`file has ${lineCount} lines (limit ${MAX_SKILL_LINES})`);
  const byteCount = Buffer.byteLength(text, 'utf8');
  if (byteCount > MAX_SKILL_BYTES) add(`file is ${byteCount} bytes (limit ${MAX_SKILL_BYTES})`);

  for (const { line, code } of findHiddenCharacters(text)) {
    add(`line ${line}: hidden or control character U+${code.toString(16).toUpperCase().padStart(4, '0')} is not allowed`);
  }
  text.split('\n').forEach((lineText, i) => {
    for (const [label, pattern] of SECRET_SHAPES) {
      if (pattern.test(lineText)) add(`line ${i + 1}: ${label} shape detected; Skills must never contain credentials`);
    }
  });

  const parsed = parseSkillFile(text);
  for (const e of parsed.errors) add(e);
  const frontmatter = parsed.frontmatter;
  if (!frontmatter) return { errors, frontmatter: null };

  for (const key of Object.keys(frontmatter)) {
    if (!FRONTMATTER_KEYS.includes(key)) {
      add(`unexpected frontmatter key "${key}" (allowed: ${FRONTMATTER_KEYS.join(', ')}; skills cannot pre-approve tools)`);
    }
  }
  const name = frontmatter.name;
  if (name === undefined) {
    add('missing required field "name"');
  } else {
    if (name.length > 64 || !NAME_PATTERN.test(name)) {
      add(`name "${name}" must be 1-64 lowercase letters, digits, and single hyphens (no leading, trailing, or doubled hyphens)`);
    }
    if (name !== dirName) add(`name "${name}" must equal its directory name "${dirName}"`);
    const taken = new Set([...ctx.agentIds, ...ctx.workflowIds].map(normalizeId));
    if (taken.has(normalizeId(name))) {
      add(`name "${name}" collides with an existing agent or workflow id; reference it via davidos-related instead of duplicating it`);
    }
  }
  const description = frontmatter.description;
  if (description === undefined) {
    add('missing required field "description"');
  } else if (description.length > 1024) {
    add(`description is ${description.length} characters (limit 1024)`);
  }

  let tiers = [];
  let risk = null;
  const metadata = frontmatter.metadata;
  if (metadata === undefined) {
    add('missing required field "metadata"');
  } else {
    ({ tiers, risk } = validateMetadata(metadata, add));
    if ('davidos-related' in metadata) validateRelated(metadata['davidos-related'], ctx, add);
  }

  const body = parseSkillBody(parsed.body);
  for (const e of body.errors) add(e);
  validateSections(body.sections, add);
  const toolsSection = body.sections.find((s) => s.title === 'Tool requirements');
  const tools = toolsSection ? validateToolRequirements(toolsSection, add) : [];

  // Capability descriptions must agree with the declared tier and risk.
  const tier3 = tiers.includes('tier_3_executor');
  if (tools.includes('repo_write') && !tier3) add('repo_write requires tier_3_executor in davidos-tiers');
  if (tools.includes('repo_write') && risk !== null && risk !== 'local_write') add('repo_write requires davidos-risk "local_write"');
  if (tools.includes('shell_run') && !tier3) add('shell_run requires tier_3_executor in davidos-tiers');
  if (risk === 'local_write' && !tier3) add('davidos-risk "local_write" requires tier_3_executor in davidos-tiers');

  return { errors, frontmatter };
}

/** Case-insensitive duplicate-id detection over [{path, name}]. */
export function findDuplicateSkillIds(entries) {
  const seen = new Map();
  const errors = [];
  for (const { path, name } of entries) {
    if (typeof name !== 'string' || name === '') continue;
    const key = name.toLowerCase();
    if (seen.has(key)) {
      errors.push(`${path}: duplicate skill id "${name}" (also in ${seen.get(key)})`);
    } else {
      seen.set(key, path);
    }
  }
  return errors;
}

function readSeedIds(dir) {
  const abs = join(root, 'seed', dir);
  const ids = new Set();
  if (!existsSync(abs)) return ids;
  for (const f of readdirSync(abs).filter((x) => x.endsWith('.json'))) {
    try {
      const id = JSON.parse(readFileSync(join(abs, f), 'utf8'))?.id;
      if (typeof id === 'string') ids.add(id);
    } catch {
      // Invalid seed JSON is reported by validate-seed.mjs, not here.
    }
  }
  return ids;
}

/** Validate every skills/<id>/SKILL.md under the repo root (or DAVIDOS_ROOT). */
export function validateSkills() {
  const errors = [];
  const skills = [];
  const skillsDir = join(root, 'skills');
  if (!existsSync(skillsDir)) return { errors, skills, directoryPresent: false };
  if (!statSync(skillsDir).isDirectory()) {
    return { errors: ['skills: expected a directory of skills/<id>/SKILL.md'], skills, directoryPresent: true };
  }

  const ctx = {
    agentIds: readSeedIds('agents'),
    workflowIds: readSeedIds('workflows'),
    docExists: (rel) => {
      const abs = join(root, rel);
      return existsSync(abs) && statSync(abs).isFile();
    },
  };
  const named = [];
  const entries = readdirSync(skillsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      errors.push(`skills/${entry.name}: unexpected file at the skills/ root (skills live in skills/<id>/SKILL.md)`);
      continue;
    }
    const relPath = `skills/${entry.name}/SKILL.md`;
    const inner = readdirSync(join(skillsDir, entry.name), { withFileTypes: true });
    for (const item of inner) {
      if (item.name !== 'SKILL.md') {
        errors.push(`skills/${entry.name}/${item.name}: unexpected entry (DOS-AI-001B skills contain only SKILL.md; no scripts/, references/, or assets/)`);
      }
    }
    const skillFile = inner.find((item) => item.name === 'SKILL.md' && item.isFile());
    if (!skillFile) {
      errors.push(`${relPath}: missing (every skills/<id>/ directory needs a SKILL.md)`);
      continue;
    }
    const result = validateSkillText({
      text: readFileSync(join(skillsDir, entry.name, 'SKILL.md'), 'utf8'),
      dirName: entry.name,
      relPath,
      ctx,
    });
    errors.push(...result.errors);
    skills.push(entry.name);
    named.push({ path: relPath, name: entry.name });
    if (result.frontmatter?.name && result.frontmatter.name !== entry.name) {
      named.push({ path: relPath, name: result.frontmatter.name });
    }
  }
  errors.push(...findDuplicateSkillIds(named));
  return { errors, skills, directoryPresent: true };
}

// Cross-platform direct-invocation check (same pattern as the other validators).
const invokedDirectly =
  !!process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  const { errors, skills, directoryPresent } = validateSkills();
  if (errors.length) {
    console.error(`Skills validation FAILED (${skills.length} skills found):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    directoryPresent
      ? `Skills validation OK — ${skills.length} skills (${skills.join(', ')}); contract v${SKILL_CONTRACT_VERSION}, structure, closed vocabularies, references, and content-safety rules verified.`
      : 'Skills validation OK — no skills/ directory; nothing to validate.',
  );
}
