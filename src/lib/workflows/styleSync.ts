/**
 * Workflow output-style ↔ URL synchronization (DOS-WF-001R Phase 1G).
 *
 * The URL is authoritative for style ON NAVIGATION: a `style` param selects and
 * validates a style, and REMOVING the param (including via browser Back/Forward
 * to an entry without it) restores the workflow's default. A purely in-page
 * manual selection changes local state only — it does not touch the URL, so it
 * is never immediately overwritten by this sync.
 *
 * This module is a pure decision function so the rules can be unit-tested
 * without mounting the Runner.
 */
import type { Workflow } from '../types';
import { resolveWorkflowOutputStyle } from './workflowRegistry';

export interface StyleSyncInput {
  wf: Workflow;
  /** The URL `style` param, or null when absent. */
  requestedStyle: string | null;
  /** The currently-selected workflow id (undefined on first mount). */
  currentWorkflowId: string | undefined;
  /** The currently-selected style. */
  currentStyle: string;
  /** The `style` param seen on the previous navigation (null when absent). */
  lastStyleParam: string | null;
}

export interface StyleSyncDecision {
  workflowChanged: boolean;
  /** The style to apply — a valid style for `wf` (default when none requested). */
  nextStyle: string;
  /** True when `nextStyle` should be applied. */
  shouldSetStyle: boolean;
  /** True when the built result should be invalidated (workflow or style moved). */
  shouldInvalidate: boolean;
}

export function computeStyleSync(inp: StyleSyncInput): StyleSyncDecision {
  const { wf, requestedStyle, currentWorkflowId, currentStyle, lastStyleParam } = inp;
  const workflowChanged = wf.id !== currentWorkflowId;
  // resolveWorkflowOutputStyle validates against wf.outputStyles and falls back
  // to the default — so an invalid style from a previous workflow can't survive.
  const nextStyle = resolveWorkflowOutputStyle(wf, requestedStyle);
  const styleParamPresent = requestedStyle !== null;
  const styleParamRemoved = requestedStyle === null && lastStyleParam !== null;
  const shouldSetStyle =
    workflowChanged ||
    (styleParamPresent && nextStyle !== currentStyle) ||
    styleParamRemoved;
  return {
    workflowChanged,
    nextStyle,
    shouldSetStyle,
    shouldInvalidate: workflowChanged || shouldSetStyle,
  };
}
