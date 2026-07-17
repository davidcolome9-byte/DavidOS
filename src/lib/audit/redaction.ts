/**
 * Privacy-safe audit redaction (targeted correction pass — Priority 5).
 *
 * Audit records are local, but they are still user data: a routed command, a
 * workflow request, or an import filename can contain personal free text. New
 * audit records therefore store only SAFE metadata about such input — an event
 * type, a non-reversible fingerprint, and a length — never the raw content.
 *
 * The fingerprint is a truncated SHA-256 of the trimmed input: stable enough to
 * correlate repeated commands, but not reversible to the original text.
 */
import { sha256Hex } from '../utils/hash';

/** Non-reversible short fingerprint of free-text input; 'empty' for blanks. */
export function fingerprintInput(text: string): string {
  const t = (text ?? '').trim();
  return t === '' ? 'empty' : sha256Hex(t).slice(0, 12);
}

/**
 * A privacy-safe audit `command` label for a piece of free-text input: an event
 * type plus a fingerprint and character count. The raw text never appears.
 */
export function redactedCommandLabel(eventType: string, text: string): string {
  const t = text ?? '';
  return `${eventType} · fp ${fingerprintInput(t)} · ${t.length} chars`;
}
