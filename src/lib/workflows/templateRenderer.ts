import type { Workflow } from '../types';

/**
 * Render a workflow template. v1 templates are plain strings with
 * three placeholders: {{input}}, {{style}}, {{date}}.
 */
export function renderTemplate(workflow: Workflow, input: string, style: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return workflow.template
    .replaceAll('{{input}}', input.trim() || '(no input provided)')
    .replaceAll('{{style}}', style)
    .replaceAll('{{date}}', date);
}

/** First ~90 chars of input, for audit log and handoff summaries. */
export function summarizeInput(input: string): string {
  const clean = input.trim().replace(/\s+/g, ' ');
  return clean.length > 90 ? clean.slice(0, 87) + '…' : clean || '(empty)';
}
