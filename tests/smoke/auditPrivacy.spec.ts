import { test, expect } from '@playwright/test';

// POST-H-PRIV-01 / POST-M-PRIV-01 — privacy of audit records and schema
// diagnostics, exercised through the real UI against the production build.
// All values below are synthetic; never use personal data in tests.

const STORAGE_KEY = 'davidos-state-v1';

const auditLogSerialized = (page: import('@playwright/test').Page) =>
  page.evaluate(([key]) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return '';
    return JSON.stringify(JSON.parse(raw).auditLog ?? []);
  }, [STORAGE_KEY]);

test('project create/delete audit records never carry the project name (POST-H-PRIV-01)', async ({ page }) => {
  const SECRET = 'ZZPRIV-browser-project-custody-hearing';
  await page.goto('/#/projects');
  await page.getByRole('button', { name: '+ New' }).click();
  await page.getByLabel(/Name/).fill(SECRET);
  await page.getByRole('button', { name: 'Save (local)' }).click();
  await expect(page.getByText(SECRET)).toBeVisible(); // the vault itself shows it

  // The audit log page shows a safe event label — never the name.
  await page.goto('/#/logs');
  await expect(page.getByRole('heading', { name: /Audit log/ })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('ZZPRIV');
  await expect(page.getByText(/project_created · fp [0-9a-f]{12} · \d+ chars/).first()).toBeVisible();
  expect(await auditLogSerialized(page)).not.toContain('ZZPRIV');

  // Delete it and re-check.
  await page.goto('/#/projects');
  await page.getByText(SECRET).click(); // expand the item
  await page.getByRole('button', { name: 'Edit' }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete' }).click();

  await page.goto('/#/logs');
  await expect(page.getByText(/project_deleted · fp [0-9a-f]{12} · \d+ chars/).first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText('ZZPRIV');
  expect(await auditLogSerialized(page)).not.toContain('ZZPRIV');
});

test('prompt create audit records never carry the title or body (POST-H-PRIV-01)', async ({ page }) => {
  const SECRET_TITLE = 'ZZPRIV-browser-prompt-medical-appeal';
  const SECRET_BODY = 'ZZPRIV-browser-body-diagnosis-details-42';
  await page.goto('/#/prompts');
  await page.getByRole('button', { name: '+ New' }).click();
  await page.getByLabel(/Title/).fill(SECRET_TITLE);
  // The body label has no htmlFor wiring; the editor shows a single textarea.
  await page.locator('textarea').fill(SECRET_BODY);
  await page.getByRole('button', { name: 'Save (local)' }).click();
  await expect(page.getByText(SECRET_TITLE)).toBeVisible();

  await page.goto('/#/logs');
  await expect(page.locator('body')).not.toContainText('ZZPRIV');
  await expect(page.getByText(/prompt_created · fp [0-9a-f]{12} · \d+ chars/).first()).toBeVisible();
  const audit = await auditLogSerialized(page);
  expect(audit).not.toContain('ZZPRIV');

  // The prompt itself is stored (that is the vault's purpose) — only the
  // audit records must be clean.
  const stored = await page.evaluate(([key]) => window.localStorage.getItem(key) ?? '', [STORAGE_KEY]);
  expect(stored).toContain(SECRET_BODY);
});

test('context save audit records never carry the title or body (POST-H-PRIV-01)', async ({ page }) => {
  const SECRET_BODY = 'ZZPRIV-browser-context-immigration-status-notes';
  await page.goto('/#/context');
  await expect(page.getByRole('heading', { name: 'Context Vault' })).toBeVisible();
  // Capture the first item's real (seeded) title, then edit its body.
  const firstItem = page.locator('details').first();
  const title = (await firstItem.locator('strong').first().textContent()) ?? '';
  expect(title).not.toBe('');
  await firstItem.locator('summary').click();
  await firstItem.getByRole('button', { name: 'Edit' }).click();
  await firstItem.locator('textarea').fill(SECRET_BODY);
  await firstItem.getByRole('button', { name: 'Save (local)' }).click();

  // The audit log page shows a safe event label — never the title or body.
  await page.goto('/#/logs');
  await expect(page.getByRole('heading', { name: /Audit log/ })).toBeVisible();
  await expect(page.getByText(/context_updated · fp [0-9a-f]{12} · \d+ chars/).first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText('ZZPRIV');
  const audit = await auditLogSerialized(page);
  expect(audit).not.toContain('ZZPRIV');
  expect(audit).not.toContain(title);

  // The context body itself is stored (that is the vault's purpose) — only
  // the audit records must be clean.
  const stored = await page.evaluate(([key]) => window.localStorage.getItem(key) ?? '', [STORAGE_KEY]);
  expect(stored).toContain(SECRET_BODY);
});

test('boot-time future-schema banner never echoes the stored version (POST-M-PRIV-01)', async ({ page }) => {
  const SYNTH_VERSION = 987654;
  await page.addInitScript(
    ([key, v]) => window.localStorage.setItem(String(key), JSON.stringify({ schemaVersion: Number(v) })),
    [STORAGE_KEY, SYNTH_VERSION],
  );
  await page.goto('/');
  const banner = page.getByTestId('recovery-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/newer version/i);
  await expect(banner).not.toContainText(String(SYNTH_VERSION));
  await expect(page.locator('body')).not.toContainText(String(SYNTH_VERSION));
});

test('import of a future-schema backup fails without echoing the version (POST-M-PRIV-01)', async ({ page }) => {
  const SYNTH_VERSION = 424242;
  await page.goto('/#/settings');
  const payload = JSON.stringify({ app: 'davidos', state: { schemaVersion: SYNTH_VERSION } });
  await page.locator('input[type="file"]').setInputFiles({
    name: 'synthetic-future-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(payload),
  });
  const flash = page.locator('.notice.flash');
  await expect(flash).toContainText(/Import failed/i);
  await expect(flash).toContainText(/newer/i);
  await expect(flash).not.toContainText(String(SYNTH_VERSION));
  // Nothing about the rejected file may be persisted.
  const stored = await page.evaluate(([key]) => window.localStorage.getItem(key) ?? '', [STORAGE_KEY]);
  expect(stored).not.toContain(String(SYNTH_VERSION));
});
