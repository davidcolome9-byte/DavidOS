/**
 * Logs tab resolution (DOS-WF-001R Phase 1G). The Logs page's active tab is a
 * pure function of the URL `tab` query parameter so browser Back/Forward move
 * between tabs. An invalid or missing value falls back honestly to the audit
 * log rather than rendering a blank page.
 */
export type LogsTab = 'audit' | 'handoffs' | 'artifacts';

export const LOGS_TABS: readonly LogsTab[] = ['audit', 'handoffs', 'artifacts'];

export function isLogsTab(value: string | null | undefined): value is LogsTab {
  return value != null && (LOGS_TABS as readonly string[]).includes(value);
}

export function resolveLogsTab(value: string | null | undefined): LogsTab {
  return isLogsTab(value) ? value : 'audit';
}
