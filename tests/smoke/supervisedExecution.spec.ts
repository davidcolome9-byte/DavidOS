import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { canonicalStateRaw } from './helpers/journalState';

// DOS-AGT-001A — Supervised execution acceptance against the production
// build at the phone viewport (375×812 from playwright.config.ts).
// All values synthetic; ZZPRIV markers must never reach audit output.
// DavidOS sends and executes nothing — this suite also proves no request
// ever leaves the local preview origin.

const STORAGE_KEY = 'davidos-state-v1';
const PRIV = 'ZZPRIV';

// DOS-STAB-001A: read the committed journal generation, not the legacy key.
const storedState = async (page: Page) => {
  const raw = await canonicalStateRaw(page);
  return raw === null ? null : JSON.parse(raw);
};

function trackRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  return urls;
}

/** Every request must stay on the local preview origin — no provider, GitHub,
 *  credential, or other cross-origin call may ever occur. */
function expectLocalOnly(urls: string[]) {
  const external = urls.filter((u) => !u.startsWith('http://localhost:4174'));
  expect(external).toEqual([]);
}

// ---- reusable long-content geometry helpers (review correction 2) ---------------
//
// These make mobile-safety assertions NON-VACUOUS: instead of checking only
// fixed prefixes/labels, they confirm the actual long hostile value renders,
// stays inside its container horizontally, and does not overlap nearby
// controls — while still allowing ordinary vertical stacking.

interface Box { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator, label: string): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`no bounding box for "${label}" — is it visible?`);
  return box;
}

function assertWithinViewportX(box: Box, viewportWidth: number, label: string) {
  expect(box.x, `${label}: left edge within viewport`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${label}: right edge within viewport (width ${viewportWidth})`)
    .toBeLessThanOrEqual(viewportWidth + 1);
}

function assertWithinContainerX(inner: Box, outer: Box, label: string) {
  expect(inner.x, `${label}: left edge within its container`).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.x + inner.width, `${label}: right edge within its container`)
    .toBeLessThanOrEqual(outer.x + outer.width + 1);
}

/** Standard axis-aligned rectangle intersection — stacked (non-overlapping-y) boxes pass. */
function boxesOverlap(a: Box, b: Box): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

function assertNoOverlap(a: Box, b: Box, label: string) {
  expect(boxesOverlap(a, b), `${label}: must not geometrically overlap`).toBe(false);
}

async function assertNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() =>
    Math.max(
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      document.body.scrollWidth - document.body.clientWidth,
    ));
  expect(overflow, 'page-level horizontal overflow').toBeLessThanOrEqual(0);
}

/** Visible, within the viewport horizontally, and returns its box for further checks. */
async function assertVisibleWithinViewport(locator: Locator, viewportWidth: number, label: string): Promise<Box> {
  await expect(locator, label).toBeVisible();
  const box = await boxOf(locator, label);
  assertWithinViewportX(box, viewportWidth, label);
  return box;
}

/**
 * Locate a rendered long value UNAMBIGUOUSLY. The deterministic packet
 * preview is a real (always-mounted) `<pre class="output">` element — native
 * `<details>` hides its content visually when closed, but the text stays in
 * the DOM, so a plain `getByText` also matches the packet's copy of every
 * long value. Scoping to ordinary prose tags (`p`/`span`/`li`) excludes the
 * packet's `<pre>` entirely, so a match here is a genuine, separate render.
 */
function valueLocator(scope: Locator | Page, value: string): Locator {
  return scope.locator('p, span, li').filter({ hasText: value });
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('full supervised execution journey: draft → ready → packet → lifecycle → completed, local-only', async ({ page }) => {
  const urls = trackRequests(page);
  await page.goto('/#/agents');
  await expect(page.getByRole('heading', { name: /Supervised execution/ })).toBeVisible();
  await expect(page.getByText(/never sends or executes anything/).first()).toBeVisible();

  // Create a draft missing objective/scope/stop conditions → independent readiness errors.
  await page.getByRole('button', { name: '+ New record' }).click();
  await page.getByLabel('Task / package title').fill(`${PRIV}-task-title`);
  await page.getByRole('button', { name: 'Create draft (local)' }).click();
  await expect(page.getByText('Objective is required.')).toBeVisible();
  await expect(page.getByText('Bounded scope is required.')).toBeVisible();
  await expect(page.getByText('Stop conditions are required.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark ready' })).toBeDisabled();

  // Complete the three separate fields and satisfy readiness.
  await page.getByRole('button', { name: 'Edit draft' }).click();
  await page.getByLabel('Objective').fill(`${PRIV}-objective`);
  await page.getByLabel('Bounded scope').fill(`${PRIV}-scope`);
  await page.getByLabel('Stop conditions').fill(`${PRIV}-stop-conditions`);
  await page.getByLabel('Model (manual label)').fill(`${PRIV}-model`);
  await page.getByRole('button', { name: 'Save draft (local)' }).click();
  await expect(page.getByRole('button', { name: 'Mark ready' })).toBeEnabled();
  await page.getByRole('button', { name: 'Mark ready' }).click();
  await expect(page.locator('.badge', { hasText: 'Ready' })).toBeVisible();

  // Deterministic packet: preview shows the three separate sections and the
  // honesty notice; copying reports that nothing was sent or executed.
  await page.getByText('Execution packet (deterministic preview)').click();
  const packet = page.locator('pre.output');
  await expect(packet).toContainText('OBJECTIVE');
  await expect(packet).toContainText('BOUNDED SCOPE');
  await expect(packet).toContainText('STOP CONDITIONS');
  await expect(packet).toContainText('did not execute commands');
  await expect(packet).toContainText('NOT authorized');
  await page.getByRole('button', { name: 'Copy packet (nothing is sent)' }).click();
  await expect(page.getByText('Packet copied. Nothing was sent and nothing was executed by DavidOS.')).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('DAVIDOS EXECUTION PACKET');
  expect(clipboard).toContain(`${PRIV}-scope`);

  // Begin work, block, resume (blocker cleared), request approval, resume (decision cleared).
  await page.getByRole('button', { name: 'Begin work (external)' }).click();
  await page.getByLabel(/Blocker summary/).fill(`${PRIV}-blocker-text`);
  await page.getByRole('button', { name: 'Mark blocked' }).click();
  await expect(page.locator('p.notice', { hasText: `Blocked: ${PRIV}-blocker-text` })).toBeVisible();
  await page.getByRole('button', { name: 'Resume work' }).click();
  await expect(page.locator('p.notice', { hasText: `Blocked: ${PRIV}-blocker-text` })).toHaveCount(0);
  // The UI updates before the journal commit lands, so poll the COMMITTED
  // state rather than reading it once (DOS-STAB-001A: persistence is async).
  await expect
    .poll(() => storedState(page).then((s) => s.executionRecords[0].blockerSummary))
    .toBeUndefined();

  await page.getByLabel(/Decision needed/).fill(`${PRIV}-decision-text`);
  await page.getByRole('button', { name: 'Request approval' }).click();
  await expect(page.locator('p.notice', { hasText: `Required decision: ${PRIV}-decision-text` })).toBeVisible();
  await page.getByRole('button', { name: 'Resume work' }).click();
  await expect(page.locator('p.notice', { hasText: `Required decision: ${PRIV}-decision-text` })).toHaveCount(0);
  await expect
    .poll(() => storedState(page).then((s) => s.executionRecords[0].decisionSummary))
    .toBeUndefined();
  // The live packet preview also drops the stale summaries after resume.
  await expect(page.locator('pre.output')).not.toContainText('Required decision:');
  await expect(page.locator('pre.output')).not.toContainText('Blocker:');

  // Completion requires evidence.
  await expect(page.getByRole('button', { name: 'Complete' })).toBeDisabled();
  await page.getByText(/^Evidence \(0\)$/).click();
  await page.getByLabel('Evidence reference').fill(`${PRIV}-evidence-sha`);
  await page.getByRole('button', { name: 'Add evidence (local)' }).click();
  await expect(page.getByRole('button', { name: 'Complete' })).toBeEnabled();
  await page.getByRole('button', { name: 'Complete' }).click();
  await expect(page.locator('.badge', { hasText: 'Completed' })).toBeVisible();
  await expect(page.getByText(/terminal — read-only/)).toBeVisible();

  // Terminal immutability in the UI: no transition or mutation controls.
  for (const name of ['Complete', 'Mark blocked', 'Request approval', 'Resume work', 'Cancel record…', 'Edit draft']) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }

  // Reload → the completed record persisted exactly.
  await page.reload();
  await page.goto('/#/agents');
  await expect(page.locator('.badge', { hasText: 'Completed' })).toBeVisible();
  const state = await storedState(page);
  expect(state.executionRecords).toHaveLength(1);
  expect(state.executionRecords[0].status).toBe('completed');
  expect(state.executionRecords[0].closedAt).toBeTruthy();
  expect(state.executionRecords[0].evidence).toHaveLength(1);

  // Audit privacy: the log page and serialized entries carry no user text —
  // and no record ids (review correction 2): fixed event names only.
  const recordId: string = state.executionRecords[0].id;
  await page.goto('/#/logs');
  await expect(page.getByText('execution_record_created').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText(PRIV);
  await expect(page.locator('body')).not.toContainText(recordId);
  const audit = JSON.stringify((await storedState(page)).auditLog);
  expect(audit).not.toContain(PRIV);
  expect(audit).not.toContain(recordId);
  expect(audit).toContain('execution_status_changed');
  expect(audit).toContain('nothing sent or executed');

  // No horizontal overflow at the phone viewport.
  await page.goto('/#/agents');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // Nothing ever left the local origin — no provider, GitHub, credential,
  // shell, or cross-origin request of any kind.
  expectLocalOnly(urls);
});

test('legacy backup without executionRecords imports cleanly; malformed records are rejected unchanged', async ({ page }) => {
  const urls = trackRequests(page);
  const legacyState = {
    schemaVersion: 1,
    priorities: [{ id: 'p1', label: 'SENTINEL-LEGACY-PRIORITY', rank: 1 }],
    openLoops: [],
    reminders: [],
    projects: [],
    prompts: [],
    contextItems: [],
    handoffs: [],
    auditLog: [],
    settings: { theme: 'dark' as const },
  };

  await page.goto('/#/settings');
  page.once('dialog', (d) => void d.accept());
  await page.locator('input[type="file"]').setInputFiles({
    name: 'synthetic-legacy-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'davidos', schemaVersion: 1, state: legacyState })),
  });
  await expect(page.locator('.notice.flash')).toContainText(/Import complete/i);
  const state = await storedState(page);
  expect(state.executionRecords).toEqual([]);
  expect(state.priorities[0].label).toBe('SENTINEL-LEGACY-PRIORITY');

  // Malformed executionRecords → rejected with a value-free message and the
  // just-imported state stays byte-identical.
  const before = await canonicalStateRaw(page);
  const malformed = {
    ...legacyState,
    executionRecords: [{ id: 'x', executionAgentId: 'coding-coordinator', title: `${PRIV}-bad`, status: 'completed' }],
  };
  await page.locator('input[type="file"]').setInputFiles({
    name: 'synthetic-malformed-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'davidos', schemaVersion: 1, state: malformed })),
  });
  const flash = page.locator('.notice.flash');
  await expect(flash).toContainText(/Import failed/i);
  await expect(flash).toContainText(/executionRecords\[0\]/);
  await expect(flash).not.toContainText(PRIV);
  const after = await canonicalStateRaw(page);
  expect(after).toBe(before);
  expect(after).not.toContain(PRIV);

  expectLocalOnly(urls);
});

test('long unbroken user content never causes horizontal overflow at 375×812 (review correction 7)', async ({ page }) => {
  // Hostile unbroken token shapes, reused across fields below.
  const SHA_LIKE = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'; // 40 hex chars
  const PATH_LIKE = 'C:\\Users\\synthetic\\repos\\davidos\\src\\lib\\workflows\\extremely\\deeply\\nested\\module\\file-with-a-very-long-name.spec.ts';
  const URL_LIKE = 'https://synthetic.example.com/organization/repository/pull/12345/files#diff-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const BRANCH_LIKE = 'feature/synthetic-extremely-long-branch-name-that-never-contains-a-single-break-opportunity-anywhere-0123456789';

  // Each field gets a UNIQUE marker + hostile payload, so an assertion that
  // finds one field's exact long value cannot be satisfied by another
  // field's leftover text, a fixed label, or a truncated prefix.
  const TITLE_VALUE = `TITLEMARK-${SHA_LIKE}${SHA_LIKE}`;
  const MODEL_VALUE = `MODELMARK-${BRANCH_LIKE}`;
  const OBJECTIVE_VALUE = `OBJECTIVEMARK-${PATH_LIKE}`;
  const SCOPE_VALUE = `SCOPEMARK-${URL_LIKE}`;
  const STOP_VALUE = `STOPMARK-${PATH_LIKE}${URL_LIKE}`;
  const EVIDENCE_REF_VALUE = `EVIDENCEMARK-${SHA_LIKE}${URL_LIKE}`;
  const GATE_VALUE = `GATEMARK-${BRANCH_LIKE}${SHA_LIKE}`;
  const BLOCKER_VALUE = `BLOCKERMARK-${PATH_LIKE}${BRANCH_LIKE}`;
  const DECISION_VALUE = `DECISIONMARK-${URL_LIKE}${SHA_LIKE}`;

  const viewport = page.viewportSize()!;

  await page.goto('/#/agents');
  await page.getByRole('button', { name: '+ New record' }).click();

  // Authority rows are real touch targets (≥44px tall) while the editor is open.
  const authorityRow = page.locator('.exec-authority label.checkrow').first();
  expect((await boxOf(authorityRow, 'authority row')).height).toBeGreaterThanOrEqual(44);

  await page.getByLabel('Task / package title').fill(TITLE_VALUE);
  await page.getByLabel('Model (manual label)').fill(MODEL_VALUE);
  await page.getByLabel('Objective').fill(OBJECTIVE_VALUE);
  await page.getByLabel('Bounded scope').fill(SCOPE_VALUE);
  await page.getByLabel('Stop conditions').fill(STOP_VALUE);
  await page.getByRole('button', { name: 'Create draft (local)' }).click();
  await assertNoPageOverflow(page);

  const card = page.locator('.exec-record').first();
  const cardBox = await assertVisibleWithinViewport(card, viewport.width, 'record card');

  // Title and model render unconditionally — assert the exact long values.
  const titleBox = await assertVisibleWithinViewport(
    valueLocator(page, TITLE_VALUE), viewport.width, 'title',
  );
  assertWithinContainerX(titleBox, cardBox, 'title');
  const modelBox = await assertVisibleWithinViewport(
    valueLocator(page, MODEL_VALUE), viewport.width, 'model',
  );
  assertWithinContainerX(modelBox, cardBox, 'model');

  // Open the objective/scope/stop-conditions disclosure — assert each exact
  // long value individually, contained within the open details region, and
  // not overlapping the "Mark ready" action below it.
  await page.getByText('Objective, bounded scope, stop conditions & authority').click();
  const detailsRegion = page.locator('.exec-record details').first();
  const detailsBox = await assertVisibleWithinViewport(detailsRegion, viewport.width, 'details region');
  for (const value of [OBJECTIVE_VALUE, SCOPE_VALUE, STOP_VALUE]) {
    const box = await assertVisibleWithinViewport(valueLocator(detailsRegion, value), viewport.width, value.slice(0, 14));
    assertWithinContainerX(box, detailsBox, value.slice(0, 14));
  }
  const markReadyBox = await boxOf(page.getByRole('button', { name: 'Mark ready' }), 'Mark ready');
  const stopBox = await boxOf(valueLocator(page, STOP_VALUE), 'stop conditions');
  assertNoOverlap(stopBox, markReadyBox, 'stop conditions vs Mark ready button');
  await assertNoPageOverflow(page);

  await page.getByRole('button', { name: 'Mark ready' }).click();

  // Packet preview contains every long value verbatim and stays inside its container.
  await page.getByText('Execution packet (deterministic preview)').click();
  const packet = page.locator('pre.output');
  for (const value of [TITLE_VALUE, MODEL_VALUE, OBJECTIVE_VALUE, SCOPE_VALUE, STOP_VALUE]) {
    await expect(packet, `packet contains ${value.slice(0, 14)}`).toContainText(value);
  }
  const packetBox = await assertVisibleWithinViewport(packet, viewport.width, 'packet');
  const packetContainer = await boxOf(page.locator('.exec-record details').filter({ hasText: 'Execution packet' }), 'packet container');
  assertWithinContainerX(packetBox, packetContainer, 'packet');
  await assertNoPageOverflow(page);

  // Long evidence reference: visible while evidence details are open, exact match.
  await page.getByRole('button', { name: 'Begin work (external)' }).click();
  await page.getByText(/^Evidence \(0\)$/).click();
  await page.getByLabel('Evidence reference').fill(EVIDENCE_REF_VALUE);
  await page.getByRole('button', { name: 'Add evidence (local)' }).click();
  const evidenceBox = await assertVisibleWithinViewport(
    valueLocator(page, EVIDENCE_REF_VALUE), viewport.width, 'evidence reference',
  );
  const addEvidenceBtn = page.getByRole('button', { name: 'Add evidence (local)' });
  assertNoOverlap(evidenceBox, await boxOf(addEvidenceBtn, 'Add evidence button'), 'evidence reference vs Add evidence button');
  await assertNoPageOverflow(page);

  // Long approval-gate label: visible while gate details are open, exact match.
  await page.getByText(/^Approval gates \(0\)$/).click();
  await page.getByLabel('New approval gate').fill(GATE_VALUE);
  await page.getByRole('button', { name: 'Add gate (local)' }).click();
  await assertVisibleWithinViewport(valueLocator(page, GATE_VALUE), viewport.width, 'gate label');
  await assertNoPageOverflow(page);

  // Long blocker summary: visible (exact match) while blocked, before resuming.
  await page.getByLabel(/Blocker summary/).fill(BLOCKER_VALUE);
  await page.getByRole('button', { name: 'Mark blocked' }).click();
  const blockerBox = await assertVisibleWithinViewport(
    valueLocator(page, BLOCKER_VALUE), viewport.width, 'blocker summary',
  );
  assertWithinContainerX(blockerBox, await boxOf(card, 'card (blocked)'), 'blocker summary');
  const resumeBox = await boxOf(page.getByRole('button', { name: 'Resume work' }), 'Resume work');
  assertNoOverlap(blockerBox, resumeBox, 'blocker summary vs Resume work button');
  await assertNoPageOverflow(page);
  await page.getByRole('button', { name: 'Resume work' }).click();
  await expect(valueLocator(page, BLOCKER_VALUE)).toHaveCount(0); // cleared on resume

  // Long decision summary: visible (exact match) while awaiting approval, before resuming.
  await page.getByLabel(/Decision needed/).fill(DECISION_VALUE);
  await page.getByRole('button', { name: 'Request approval' }).click();
  const decisionBox = await assertVisibleWithinViewport(
    valueLocator(page, DECISION_VALUE), viewport.width, 'decision summary',
  );
  assertNoOverlap(decisionBox, await boxOf(page.getByRole('button', { name: 'Resume work' }), 'Resume work'), 'decision summary vs Resume work button');
  await assertNoPageOverflow(page);
  await page.getByRole('button', { name: 'Resume work' }).click();
  await expect(valueLocator(page, DECISION_VALUE)).toHaveCount(0); // cleared on resume
  await assertNoPageOverflow(page);

  // Final containment + reachability pass.
  const finalCardBox = await assertVisibleWithinViewport(card, viewport.width, 'record card (final)');
  const copyBtn = page.getByRole('button', { name: 'Copy packet (nothing is sent)' });
  const copyBox = await assertVisibleWithinViewport(copyBtn, viewport.width, 'Copy packet button');
  assertWithinContainerX(copyBox, finalCardBox, 'Copy packet button');
});

test('a completed record with a long unbroken outcome renders mobile-safe (seeded canonical state)', async ({ page }) => {
  // The UI intentionally has no outcome input in DOS-AGT-001A, so the
  // completed-outcome display path is exercised by seeding a CANONICAL
  // completed record (grammar id, exact authority shape, canonical
  // timestamps, evidence, closedAt) — the boot deep-validator must accept
  // it unchanged, proven by the absence of any recovery banner.
  const T = '2026-07-19T10:00:00.000Z';
  const LONG_OUTCOME =
    'OUTCOMEMARK-refs/heads/synthetic-outcome-branch-with-no-break-opportunity-' +
    'abcdef0123456789'.repeat(8);
  const viewport = page.viewportSize()!;
  const completedRecord = {
    id: 'seedcomp001',
    executionAgentId: 'coding-coordinator',
    title: 'Seeded completed task',
    objective: 'Seeded objective.',
    scope: 'Seeded scope.',
    stopConditions: 'Seeded stop conditions.',
    targetService: 'manual',
    model: 'seed-model',
    sessionMode: 'plan_only',
    authority: { editCode: false, runTests: false, editDocs: false, push: false, openPullRequests: false, merge: false },
    status: 'completed',
    evidence: [{ id: 'seedev0001', kind: 'note', reference: 'seed evidence reference', addedAt: T }],
    approvalGates: [],
    outcomeSummary: LONG_OUTCOME,
    createdAt: T,
    updatedAt: T,
    closedAt: T,
  };
  const seededState = {
    schemaVersion: 1,
    priorities: [],
    openLoops: [],
    reminders: [],
    projects: [],
    prompts: [],
    contextItems: [],
    handoffs: [],
    artifacts: [],
    executionRecords: [completedRecord],
    healthProfile: null,
    auditLog: [],
    settings: { theme: 'dark' },
  };
  await page.addInitScript(
    ([key, state]) => window.localStorage.setItem(String(key), String(state)),
    [STORAGE_KEY, JSON.stringify(seededState)],
  );

  await page.goto('/#/agents');
  // The canonical fixture passed the boot deep-validator: no recovery ran.
  await expect(page.getByTestId('recovery-banner')).toHaveCount(0);
  await expect(page.locator('.badge', { hasText: 'Completed' })).toBeVisible();

  // The exact long outcome value is visible, contained within the card, and
  // does not overlap the copy-packet button beneath it.
  const card = page.locator('.exec-record').first();
  const cardBox = await assertVisibleWithinViewport(card, viewport.width, 'record card');
  const outcomeBox = await assertVisibleWithinViewport(
    valueLocator(page, LONG_OUTCOME), viewport.width, 'outcome summary',
  );
  assertWithinContainerX(outcomeBox, cardBox, 'outcome summary');
  await assertNoPageOverflow(page);

  // Terminal read-only: no transition or mutation controls exist.
  for (const name of ['Complete', 'Mark blocked', 'Request approval', 'Resume work', 'Cancel record…', 'Edit draft']) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }

  // The packet renders the EXACT outcome value, contained and wrapped, at 375×812.
  await page.getByText('Execution packet (deterministic preview)').click();
  const packet = page.locator('pre.output');
  await expect(packet).toContainText(LONG_OUTCOME);
  const packetBox = await assertVisibleWithinViewport(packet, viewport.width, 'packet');
  assertWithinContainerX(packetBox, cardBox, 'packet');
  const copyBtn = page.getByRole('button', { name: 'Copy packet (nothing is sent)' });
  const copyBox = await assertVisibleWithinViewport(copyBtn, viewport.width, 'Copy packet button');
  assertNoOverlap(packetBox, copyBox, 'packet vs Copy packet button');
  await assertNoPageOverflow(page);

  // The seeded record survived the load byte-meaningfully (not repaired).
  const stored = await storedState(page);
  expect(stored.executionRecords).toHaveLength(1);
  expect(stored.executionRecords[0].outcomeSummary).toBe(LONG_OUTCOME);
  expect(stored.executionRecords[0].status).toBe('completed');
});

test('inline cancellation supports native keyboard activation (Enter/Space) with correct focus (safe hardening)', async ({ page }) => {
  await page.goto('/#/agents');
  await page.getByRole('button', { name: '+ New record' }).click();
  await page.getByLabel('Task / package title').fill('Keyboard cancel test');
  await page.getByRole('button', { name: 'Create draft (local)' }).click();

  // Enter on a focused native button activates it — no custom key handler.
  const cancelOpener = page.getByRole('button', { name: 'Cancel record…' });
  await cancelOpener.focus();
  await page.keyboard.press('Enter');
  const confirmBtn = page.getByRole('button', { name: 'Confirm cancel (terminal)' });
  await expect(confirmBtn).toBeFocused();

  // Space on "Keep record" activates it and restores focus to the opener.
  const keepBtn = page.getByRole('button', { name: 'Keep record' });
  await keepBtn.focus();
  await page.keyboard.press('Space');
  await expect(confirmBtn).toHaveCount(0);
  await expect(cancelOpener).toBeFocused();

  // Nothing was cancelled by the Keep-record path.
  const state = await storedState(page);
  expect(state.executionRecords[0].status).toBe('draft');
});
