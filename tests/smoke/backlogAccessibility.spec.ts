import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { canonicalState, canonicalStateRaw, seedCanonicalState, waitForCanonicalState } from './helpers/journalState';

// DOS-APP-20260919 — OL-016/017/018/019/020/028. Runs against the production
// build with SYNTHETIC data only. Persistence assertions wait on the committed
// journal generation (helpers/journalState) before any reload, never on a UI
// signal alone.

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const moreLink = (page: Page) => page.locator('nav.bottom-nav a', { hasText: 'More' });
const navLink = (page: Page, label: string) => page.locator('nav.bottom-nav a', { hasText: label });

/** Load a route from a clean document so hash-only navigation can't mask a stale page. */
async function open(page: Page, hash: string) {
  await page.goto('/');
  await page.goto(`/#${hash}`);
  await page.reload();
}

interface CommittedState {
  projects: unknown[];
  contextItems: { title: string; kind: string; body: string }[];
  auditLog: { command: string; resultSummary?: string }[];
  [key: string]: unknown;
}

/** Seed a mutation of the committed state and boot from it. */
async function seedState(page: Page, hash: string, mutate: (state: CommittedState) => void) {
  await page.goto('/#/');
  await waitForCanonicalState(page);
  const state = await canonicalState<CommittedState>(page);
  mutate(state);
  await seedCanonicalState(page, JSON.stringify(state));
  await page.goto(`/#${hash}`);
  await page.reload();
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    // ---- OL-016: top safe-area inset ----

    test('OL-016: sticky header reserves the top safe-area inset and never overlaps content', async ({ page }) => {
      await open(page, '/settings');

      // The built stylesheet must carry the inset on the header. Headless
      // Chromium reports env(safe-area-inset-top) as 0, so this asserts the
      // rule is present in the shipped CSS (software coverage only). Physical
      // notched-device acceptance was NOT RUN here.
      const css = await page.evaluate(async () => {
        const hrefs = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => (l as HTMLLinkElement).href);
        const texts = await Promise.all(hrefs.map((h) => fetch(h).then((r) => r.text())));
        return texts.join('\n');
      });
      expect(css).toMatch(/\.app-header\s*\{[^}]*env\(\s*safe-area-inset-top/);

      const header = page.locator('header.app-header');
      await expect(header).toBeVisible();
      const paddingTop = await header.evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
      expect(paddingTop).toBeGreaterThanOrEqual(14);

      // At rest the first card starts below the header.
      const at0 = await page.evaluate(() => ({
        headerBottom: document.querySelector('header.app-header')!.getBoundingClientRect().bottom,
        firstCardTop: document.querySelector('main .card')!.getBoundingClientRect().top,
      }));
      expect(at0.firstCardTop).toBeGreaterThanOrEqual(at0.headerBottom - 1);

      // Scrolled, the header stays pinned to the top edge and inside the viewport.
      await page.evaluate(() => window.scrollTo(0, 400));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      const pinned = await page.evaluate(() => {
        const r = document.querySelector('header.app-header')!.getBoundingClientRect();
        return { top: r.top, left: r.left, right: r.right, vw: window.innerWidth };
      });
      expect(pinned.top).toBeCloseTo(0, 0);
      expect(pinned.left).toBeGreaterThanOrEqual(0);
      expect(pinned.right).toBeLessThanOrEqual(pinned.vw);

      // No horizontal overflow, and the bottom nav still sits on the bottom edge.
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        vw: window.innerWidth,
        navBottom: document.querySelector('nav.bottom-nav')!.getBoundingClientRect().bottom,
        vh: window.innerHeight,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.vw);
      expect(overflow.navBottom).toBeCloseTo(overflow.vh, 0);
    });

    // ---- OL-017: More stays active on its sub-pages ----

    test('OL-017: More is active on every More sub-page, including Supervised execution', async ({ page }) => {
      await page.goto('/#/more');
      await expect(moreLink(page)).toHaveClass(/active/);
      await expect(moreLink(page)).toHaveAttribute('aria-current', 'page');

      for (const route of ['/agents', '/prompts', '/context', '/planning', '/health', '/settings']) {
        await page.goto(`/#${route}`);
        await expect(moreLink(page), route).toHaveClass(/active/);
        await expect(moreLink(page), route).toHaveAttribute('aria-current', 'true');
        for (const other of ['Home', 'Workflows', 'Projects', 'Logs']) {
          await expect(navLink(page, other), `${other} on ${route}`).not.toHaveClass(/active/);
        }
      }

      // The execution surface lives on /agents — More is highlighted there.
      await page.goto('/#/agents');
      await expect(page.locator('#supervised-execution-heading')).toBeVisible();
      await expect(moreLink(page)).toHaveClass(/active/);
    });

    test('OL-017: primary tabs keep their own highlight and do not light up More', async ({ page }) => {
      for (const [route, label] of [
        ['/', 'Home'],
        ['/workflows', 'Workflows'],
        ['/projects', 'Projects'],
        ['/logs', 'Logs'],
      ] as const) {
        await page.goto(`/#${route}`);
        await expect(navLink(page, label), route).toHaveClass(/active/);
        await expect(moreLink(page), route).not.toHaveClass(/active/);
        await expect(moreLink(page), route).not.toHaveAttribute('aria-current', /.+/);
      }
    });

    // ---- OL-018: Settings Data navigation ----

    test('OL-018: More → Export / Import / Reset scrolls to and focuses the Data card', async ({ page }) => {
      await page.goto('/#/more');
      await page.getByRole('link', { name: /Export \/ Import \/ Reset/ }).click();

      await expect(page).toHaveURL(/#\/settings\?section=data/);
      await expect(page.getByRole('heading', { name: /^Data/ })).toBeFocused();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

      const geo = await page.evaluate(() => ({
        headerBottom: document.querySelector('header.app-header')!.getBoundingClientRect().bottom,
        cardTop: document.getElementById('data')!.getBoundingClientRect().top,
        vh: window.innerHeight,
      }));
      expect(geo.cardTop).toBeGreaterThanOrEqual(geo.headerBottom - 1);
      expect(geo.cardTop).toBeLessThan(geo.vh);
    });

    test('OL-018: the legacy /settings#data link still reaches the Data card', async ({ page }) => {
      await page.goto('/#/settings#data');
      await expect(page.getByRole('heading', { name: /^Data/ })).toBeFocused();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    });

    test('OL-018: plain Settings does not scroll or steal focus', async ({ page }) => {
      await page.goto('/#/settings');
      await expect(page.getByRole('heading', { name: /^Appearance/ })).toBeVisible();
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page.getByRole('heading', { name: /^Data/ })).not.toBeFocused();
    });
  });
}

// ---- OL-019 / OL-020: empty states, Context create, label association ----

test('OL-019: an empty Project Vault shows a friendly empty state that clears once a project exists', async ({ page }) => {
  await seedState(page, '/projects', (s) => {
    s.projects = [];
  });
  await expect(page.getByTestId('projects-empty')).toContainText('No projects yet');

  await page.getByRole('button', { name: '+ New' }).click();
  await page.getByLabel(/Name/).fill('Synthetic empty-state project');
  await page.getByRole('button', { name: 'Save (local)' }).click();
  await expect(page.getByTestId('projects-empty')).toHaveCount(0);
  await expect(page.getByText('Synthetic empty-state project')).toBeVisible();
});

test('OL-019: an empty Context Vault shows a friendly empty state with a create action', async ({ page }) => {
  await seedState(page, '/context', (s) => {
    s.contextItems = [];
  });
  await expect(page.getByTestId('context-empty')).toContainText('No context items yet');
  await expect(page.getByRole('button', { name: '+ New context item' })).toBeVisible();
});

test('OL-019: Context create validates title/kind/body, shows the local-write notice, and cancels cleanly', async ({ page }) => {
  await page.goto('/#/context');
  await waitForCanonicalState(page);
  const before = (await canonicalState<CommittedState>(page)).contextItems.length;

  const newButton = page.getByRole('button', { name: '+ New context item' });
  await newButton.click();

  await expect(page.getByTestId('context-local-write-notice')).toContainText('local write');
  await expect(page.getByLabel(/Title/)).toBeFocused();

  const save = page.getByRole('button', { name: 'Save (local)' });
  await expect(save).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('title, a kind, and a body are all required');

  // Each field is required on its own.
  await page.getByLabel(/Title/).fill('Synthetic cancelled item');
  await expect(save).toBeDisabled();
  await page.getByLabel(/Kind/).selectOption('workflow');
  await expect(save).toBeDisabled();
  await page.getByLabel(/^Body/).fill('   ');
  await expect(save).toBeDisabled(); // whitespace-only body is still empty
  await page.getByLabel(/^Body/).fill('Synthetic cancelled body');
  await expect(save).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);

  // Cancel discards everything and returns focus to the opener.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('context-new-form')).toHaveCount(0);
  await expect(newButton).toBeFocused();
  await expect(page.getByText('Synthetic cancelled item')).toHaveCount(0);
  expect((await canonicalState<CommittedState>(page)).contextItems).toHaveLength(before);

  // Reopening starts from an empty draft, not the cancelled one.
  await newButton.click();
  await expect(page.getByLabel(/Title/)).toHaveValue('');
  await expect(page.getByLabel(/Kind/)).toHaveValue('');
});

for (const width of [375, 320]) {
  test(`OL-019: Context header and create form fit ${width}px without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/#/context');
    await page.getByRole('button', { name: '+ New context item' }).click();
    await expect(page.getByTestId('context-new-form')).toBeVisible();
    // Trigger the required-field alert too, so the tallest form state is measured.
    await expect(page.getByRole('alert')).toBeVisible();

    const geo = await page.evaluate(() => {
      const rect = (el: Element | null) => {
        const r = el!.getBoundingClientRect();
        return { left: r.left, right: r.right };
      };
      const heading = document.querySelector('h2.wrap')!;
      return {
        scrollWidth: document.documentElement.scrollWidth,
        vw: window.innerWidth,
        card: rect(heading.closest('.card')),
        button: rect(heading.querySelector('button')),
        form: rect(document.querySelector('[data-testid="context-new-form"]')),
      };
    });
    expect(geo.scrollWidth).toBeLessThanOrEqual(geo.vw);
    expect(geo.button.left).toBeGreaterThanOrEqual(geo.card.left);
    expect(geo.button.right).toBeLessThanOrEqual(geo.card.right + 0.5);
    expect(geo.form.right).toBeLessThanOrEqual(geo.vw);
  });
}

test('OL-019: Context create persists across reload, audits redacted, then edit/cancel/save', async ({ page }) => {
  const TITLE = 'ZZPRIV-synthetic-context-title';
  const BODY = 'ZZPRIV-synthetic-context-body';
  const EDITED = 'ZZPRIV-synthetic-context-body-edited';

  await page.goto('/#/context');
  await waitForCanonicalState(page);
  await page.getByRole('button', { name: '+ New context item' }).click();
  await page.getByLabel(/Title/).fill(TITLE);
  await page.getByLabel(/Kind/).selectOption('session');
  await page.getByLabel(/^Body/).fill(BODY);
  await page.getByRole('button', { name: 'Save (local)' }).click();

  await expect(page.getByTestId('context-new-form')).toHaveCount(0);
  // The flash must not claim durability; persistence is asserted below from the committed journal.
  await expect(page.getByRole('status')).toContainText('Context item added. Device saving follows the app storage status.');
  await expect(page.getByRole('status')).not.toContainText('saved on this device');
  await expect(page.getByText(TITLE)).toBeVisible();

  // Durable before reload: wait for the committed generation, not the DOM.
  await expect.poll(async () => (await canonicalStateRaw(page)) ?? '').toContain(BODY);
  const committed = await canonicalState<CommittedState>(page);
  const created = committed.contextItems.find((c) => c.title === TITLE);
  expect(created?.kind).toBe('session');

  // Audit is redacted: event type + fingerprint + length, never title/body.
  const audit = committed.auditLog.find((a) => a.command.startsWith('context_created'));
  expect(audit?.command).toMatch(/^context_created · fp [0-9a-f]{12} · \d+ chars$/);
  expect(audit?.resultSummary).toMatch(/^Context item created · kind session · body \d+ chars\.$/);
  expect(JSON.stringify(committed.auditLog)).not.toContain('ZZPRIV');

  await page.reload();
  const item = page.locator('details', { hasText: TITLE });
  await expect(item).toBeVisible();

  // Edit → Cancel leaves the body untouched; the textarea is labelled.
  await item.locator('summary').click();
  await item.getByRole('button', { name: 'Edit' }).click();
  await item.getByLabel('Context body').fill(EDITED);
  await item.getByRole('button', { name: 'Cancel' }).click();
  await expect(item.locator('pre.output')).toHaveText(BODY);

  // Edit → Save persists.
  await item.getByRole('button', { name: 'Edit' }).click();
  await item.getByLabel('Context body').fill(EDITED);
  await item.getByRole('button', { name: 'Save (local)' }).click();
  await expect(item.locator('pre.output')).toHaveText(EDITED);
  await expect.poll(async () => (await canonicalStateRaw(page)) ?? '').toContain(EDITED);
  const after = await canonicalState<CommittedState>(page);
  expect(JSON.stringify(after.auditLog)).not.toContain('ZZPRIV');

  await page.reload();
  const reloaded = page.locator('details', { hasText: TITLE });
  await reloaded.locator('summary').click();
  await expect(reloaded.locator('pre.output')).toHaveText(EDITED);
});

test('OL-020: every vault editor label is associated with its control', async ({ page }) => {
  // Project editor
  await page.goto('/#/projects');
  await page.getByRole('button', { name: '+ New' }).click();
  await expect(page.getByLabel('Status')).toBeVisible();
  await expect(page.getByLabel('Area')).toBeVisible();
  await expect(page.getByLabel('Next action')).toBeVisible();
  await expect(page.getByLabel('Notes')).toBeVisible();
  await expectNoOrphanLabels(page, 'Project');

  // Prompt editor
  await page.goto('/#/prompts');
  await page.getByRole('button', { name: '+ New' }).click();
  await expect(page.getByLabel('Category')).toBeVisible();
  await expect(page.getByLabel(/Tags/)).toBeVisible();
  await expect(page.getByLabel('Agent')).toBeVisible();
  await expect(page.getByLabel('Prompt body')).toBeVisible();
  await expectNoOrphanLabels(page, 'Prompt');

  // Context create form and inline edit
  await page.goto('/#/context');
  await page.getByRole('button', { name: '+ New context item' }).click();
  await expect(page.getByLabel(/Title/)).toBeVisible();
  await expect(page.getByLabel(/Kind/)).toBeVisible();
  await expect(page.getByLabel(/^Body/)).toBeVisible();
  await expectNoOrphanLabels(page, 'Context create');
  await page.getByRole('button', { name: 'Cancel' }).click();

  const first = page.locator('details').first();
  await first.locator('summary').click();
  await first.getByRole('button', { name: 'Edit' }).click();
  await expect(first.getByLabel('Context body')).toBeVisible();
  await expectNoOrphanLabels(page, 'Context edit');
});

/** Every `label.field` must resolve to a real control (label.control non-null). */
async function expectNoOrphanLabels(page: Page, where: string) {
  const orphans = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLLabelElement>('label.field')]
      .filter((l) => l.control === null)
      .map((l) => l.textContent?.trim() ?? ''),
  );
  expect(orphans, `${where}: labels with no associated control`).toEqual([]);
}

// ---- OL-028: reveal toggles stay mounted; revealed panel is labelled and scrollable ----

/**
 * The revealed panel genuinely overflows (scrollHeight > clientHeight), is the
 * next Tab stop after its toggle, and scrolls when the keyboard sends End.
 * Shared so both disclosure paths (planning + Health Profile) prove the same thing.
 */
async function expectKeyboardScrollable(page: Page, panel: Locator) {
  const metrics = await panel.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  await page.keyboard.press('Tab');
  await expect(panel).toBeFocused();
  expect(await panel.evaluate((el) => el.scrollTop)).toBe(0);
  await page.keyboard.press('End');
  await expect.poll(() => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
}

test('OL-028: planning reveal keeps the toggle mounted and focused, and the panel scrolls by keyboard', async ({ page }) => {
  // A short viewport plus a long synthetic planning state guarantees the
  // revealed <pre> (max-height 45vh) actually overflows.
  await page.setViewportSize({ width: 375, height: 500 });
  await seedState(page, '/workflows?wf=daily-brief', (s) => {
    const now = new Date().toISOString();
    s.priorities = Array.from({ length: 30 }, (_, i) => ({
      id: `syn-pri-${i}`, label: `Synthetic priority ${i + 1}`, rank: i + 1,
    }));
    s.openLoops = Array.from({ length: 30 }, (_, i) => ({
      id: `syn-loop-${i}`, label: `Synthetic open loop ${i + 1}`, status: 'open', createdAt: now,
    }));
    s.reminders = Array.from({ length: 30 }, (_, i) => ({
      id: `syn-rem-${i}`, label: `Synthetic reminder ${i + 1}`, due: '', done: false,
    }));
  });

  await page.getByText('Current DavidOS state included').click(); // open the <details>
  const toggle = page.getByRole('button', { name: /Inserted Planning State Text/ });
  await expect(toggle).toHaveText('Show Inserted Planning State Text');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-controls', 'planning-state-text');
  await expect(page.locator('#planning-state-text')).toHaveCount(0); // text absent until asked

  // Keyboard activation: focus stays on the toggle, never falls to <body>.
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveText('Hide Inserted Planning State Text');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  const panel = page.getByRole('region', { name: 'Inserted Planning State Text' });
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('id', 'planning-state-text');
  await expect(panel).toHaveAttribute('tabindex', '0');
  await expect(panel).toContainText('Priorities:');

  // The panel really overflows, is reachable by Tab, and scrolls by keyboard.
  await expectKeyboardScrollable(page, panel);

  // Hide: toggle stays mounted and focused; the text leaves the DOM.
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#planning-state-text')).toHaveCount(0);
});

test('OL-028: Health Profile reveal behaves identically (mounted toggle, labelled focusable panel, keyboard scroll)', async ({ page }) => {
  // A short viewport plus a long SYNTHETIC promptSummary (it is inserted into
  // the prompt block uncapped) guarantees the revealed <pre> overflows.
  await page.setViewportSize({ width: 375, height: 500 });
  await seedState(page, '/workflows?wf=fitness-handoff', (s) => {
    const profile = s.healthProfile as { promptSummary?: string } | null | undefined;
    if (!profile) throw new Error('the default state is expected to carry a generic seeded Health Profile');
    profile.promptSummary = Array.from({ length: 60 }, (_, i) => `SYN-PROFILE-LINE-${i + 1}: synthetic profile note, no real data.`).join('\n');
  });
  await page.locator('#wf-input').fill('Synthetic workout note');
  await page.getByRole('button', { name: 'Build Prompt' }).click();

  await page.getByText(/Health Profile included/).click(); // open the <details>
  const toggle = page.getByRole('button', { name: /Inserted Health Profile Text/ });
  await expect(toggle).toHaveText('Show Inserted Health Profile Text');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-controls', 'health-profile-text');
  await expect(page.locator('#health-profile-text')).toHaveCount(0);

  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveText('Hide Inserted Health Profile Text');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  const panel = page.getByRole('region', { name: 'Inserted Health Profile Text' });
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('id', 'health-profile-text');
  await expect(panel).toHaveAttribute('tabindex', '0');
  await expect(panel).toContainText('SYN-PROFILE-LINE-1:');
  await expectKeyboardScrollable(page, panel);

  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#health-profile-text')).toHaveCount(0);
});
