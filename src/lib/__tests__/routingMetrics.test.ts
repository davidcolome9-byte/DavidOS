import { describe, expect, it } from 'vitest';
import { routeIntent } from '../router/intentRouter';

/**
 * Metric-separation lock for the routing acceptance corpus
 * (C:\dev\backups\DavidOS-functional-acceptance-corpus.json, 153 routing
 * cases, sha256 897b9afc…0ff45 — read-only ground truth, never edited here).
 *
 * Two DIFFERENT metrics are reported against that corpus and must never be
 * conflated:
 *
 *   - HISTORICAL STRICT SCORE: exact classification match only
 *     (supported / unsupported / ambiguous / multi_domain / unknown).
 *   - TUPLE CONFORMANCE: a stricter diagnostic — classification AND domain
 *     set AND workflow must all match the registered expectation.
 *
 * Tuple conformance is always ≤ the strict score and MUST NOT be reported as
 * the strict score. Before the daily-use trio fixes, the two metrics diverged
 * on exactly five known cases — locked below. Each one matches its expected
 * CLASSIFICATION (strict pass) while its emitted domain set or workflow
 * deviates from the registered tuple (tuple fail):
 *
 *   C-week-3  supported, but a concrete workflow where none is registered
 *   R-3       supported, but a concrete workflow where none is registered
 *   M-1       multi_domain, but a smaller domain set than registered
 *   M-2       multi_domain, but a smaller domain set than registered
 *   L-2       multi_domain, but a smaller domain set than registered
 *
 * C-week-3, M-1, M-2, and L-2 are OUT OF SCOPE here and must not drift. R-3 IS
 * in scope for the Training Readiness package: its concrete workflow changed
 * from the unsafe/dishonest Fitness Handoff to the fitness-readiness workflow.
 * The strict/tuple relationship is unchanged (still strict-pass / tuple-fail,
 * because the corpus registers an honest-choice — no single workflow — for this
 * readiness case), only the emitted workflow is now the safe one. If any OTHER
 * assertion below starts failing, the strict-vs-tuple bookkeeping changed and
 * both metrics must be re-derived — do not paper over it by editing corpus
 * expectations.
 */
describe('routing metrics · strict score vs tuple conformance are separate', () => {
  it('C-week-3 · strict-pass (supported) with an unregistered concrete workflow', () => {
    const r = routeIntent('This weekend I need groceries');
    expect(r.classification).toBe('supported'); // strict: matches expectedClass
    expect(r.target).toBe('dogs_home_life_admin'); // domain within expectation
    // Tuple divergence: the corpus registers NO single workflow for this case,
    // yet a concrete one is emitted — a tuple fail that is NOT a strict fail.
    expect(r.suggestedWorkflowId).toBe('life-admin-checklist');
  });

  it('R-3 · strict-pass (supported) now routes to the SAFE readiness workflow', () => {
    const r = routeIntent('Fighting a cold, is it safe to lift heavy?');
    expect(r.classification).toBe('supported');
    expect(r.target).toBe('fitness');
    // Corrected: illness + "safe to lift" no longer reaches Fitness Handoff.
    // Still a tuple divergence (corpus registers an honest-choice, no single
    // workflow), but the emitted workflow is now the conservative readiness one.
    expect(r.suggestedWorkflowId).toBe('fitness-readiness');
  });

  it('M-1 · strict-pass (multi_domain) with a smaller domain set than registered', () => {
    const r = routeIntent('Plan my workout and my work presentation for the week');
    expect(r.classification).toBe('multi_domain');
    const domains = (r.domains ?? []).map((d) => d.agentId).sort();
    // Registered set: fitness | work_project | calendar_planning. The emitted
    // set is a strict subset — tuple fail, strict pass.
    expect(domains).toEqual(['fitness', 'work_project']);
  });

  it('M-2 · strict-pass (multi_domain) with a smaller domain set than registered', () => {
    const r = routeIntent('Log my food and remind me about the vet');
    expect(r.classification).toBe('multi_domain');
    const domains = (r.domains ?? []).map((d) => d.agentId).sort();
    // Registered set: fitness | calendar_planning | dogs_home_life_admin.
    expect(domains).toEqual(['dogs_home_life_admin', 'fitness']);
  });

  it('L-2 · strict-pass (multi_domain) with a smaller domain set than registered', () => {
    const r = routeIntent(
      'Hey, I have a huge day ahead with work stuff, the dogs need the vet, and I still have to plan my week, can you help me figure out what to focus on first',
    );
    expect(r.classification).toBe('multi_domain');
    const domains = (r.domains ?? []).map((d) => d.agentId).sort();
    // Registered set: daily_command | calendar_planning | dogs_home_life_admin
    // | work_project.
    expect(domains).toEqual(['calendar_planning', 'dogs_home_life_admin']);
  });

  it('the daily-use trio now conforms at the strict classification level', () => {
    expect(routeIntent('Review my fitness plan').classification).toBe('supported');
    expect(routeIntent('Give me a preview of my week').classification).toBe('supported');
    expect(routeIntent('I am awaiting a reply from my supervisor').classification).toBe('supported');
  });
});
