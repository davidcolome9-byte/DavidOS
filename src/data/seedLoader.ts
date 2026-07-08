// Loads seed files (JSON + markdown) bundled from /seed at build time.
// Markdown files use a minimal frontmatter block:  ---\nkey: value\n---\nbody

export interface ParsedMarkdown {
  meta: Record<string, string>;
  body: string;
}

export function parseFrontmatter(raw: string): ParsedMarkdown {
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { meta: {}, body: normalized.trim() };
  }
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) {
    return { meta: {}, body: normalized.trim() };
  }
  const meta: Record<string, string> = {};
  for (const line of normalized.slice(4, end).split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return { meta, body: normalized.slice(end + 4).trim() };
}
