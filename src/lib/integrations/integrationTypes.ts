import type { IntegrationAdapter } from '../types';
export type { IntegrationAdapter, IntegrationMethod } from '../types';

/**
 * Every stubbed integration method returns this shape.
 * Stubs NEVER pretend an external action happened — ok is always false
 * until a real implementation lands behind an approval gate.
 */
export interface StubResult {
  ok: false;
  message: string;
}

export function stubResult(adapter: IntegrationAdapter, method: string): StubResult {
  return {
    ok: false,
    message:
      `${adapter.name}.${method}() is a v1 stub — no external call was made. ` +
      `See docs/roadmap.md for when this integration lands.`,
  };
}
