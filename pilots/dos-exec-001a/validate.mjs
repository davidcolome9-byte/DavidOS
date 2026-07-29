/* global process, URL, document, HTMLElement, window, console */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(packageRoot, '..', '..');
const authorizedBase = '497fab9abb06df86e20ef1e9fe4585d7c7274ab9';
const finalMode = process.argv.includes('--final');
const browserMode = process.argv.includes('--browser');

const authoredFiles = [
  'WORK_LOG.md',
  'README.md',
  'BUSINESS_PACKAGE.md',
  'WEBSITE_BRIEF.md',
  'OUTREACH_AND_PROPOSAL.md',
  'VALIDATION_REPORT.md',
  'FINAL_APPROVAL.md',
  'INDEPENDENT_REVIEW_PACKET.md',
  'validate.mjs',
  'site/index.html',
  'site/styles.css',
  'site/script.js',
  'site/assets/logo.svg',
];
const evidenceFiles = ['evidence/desktop.png', 'evidence/mobile.png'];
const allowlist = [...authoredFiles, ...evidenceFiles].map((file) =>
  `pilots/dos-exec-001a/${file}`.replaceAll('\\', '/'),
);
const errors = [];

const expectBrowser = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function runBrowserValidation() {
  const localRequire = createRequire(join(repoRoot, 'package.json'));
  let playwright;
  try {
    playwright = localRequire('@playwright/test');
  } catch {
    const worktreeLines = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).split(/\r?\n/);
    let currentPath;
    let mainWorktree;
    for (const line of worktreeLines) {
      if (line.startsWith('worktree ')) currentPath = line.slice('worktree '.length);
      if (line === 'branch refs/heads/main') mainWorktree = currentPath;
    }
    if (!mainWorktree) throw new Error('could not locate the canonical main worktree for existing dependencies');
    playwright = createRequire(join(mainWorktree, 'package.json'))('@playwright/test');
  }
  const { chromium } = playwright;
  const siteRoot = resolve(packageRoot, 'site');
  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
  };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      const requestedPath = pathname === '/' ? '/index.html' : pathname;
      const filePath = resolve(siteRoot, `.${requestedPath}`);
      if (filePath !== siteRoot && !filePath.startsWith(`${siteRoot}${sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  expectBrowser(address && typeof address === 'object', 'local validation server did not expose an address');
  const baseUrl = `http://127.0.0.1:${address.port}/`;
  const evidenceRoot = join(packageRoot, 'evidence');
  mkdirSync(evidenceRoot, { recursive: true });

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const viewports = [
      { name: 'mobile', width: 375, height: 812 },
      { name: 'desktop', width: 1440, height: 900 },
    ];

    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];
      const externalRequests = [];

      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('requestfailed', (request) => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`));
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin !== new URL(baseUrl).origin) externalRequests.push(request.url());
      });

      const response = await page.goto(baseUrl, { waitUntil: 'networkidle' });
      expectBrowser(response?.status() === 200, `${viewport.name}: page did not return HTTP 200`);
      expectBrowser(await page.getByRole('heading', { level: 1 }).isVisible(), `${viewport.name}: h1 is not visible`);
      expectBrowser(await page.getByRole('navigation', { name: 'Primary navigation' }).isVisible(), `${viewport.name}: primary navigation is not visible`);
      expectBrowser((await page.locator('img').count()) === 2, `${viewport.name}: expected two local logo images`);

      const imageStatus = await page.locator('img').evaluateAll((images) =>
        images.map((image) => ({ complete: image.complete, width: image.naturalWidth })),
      );
      expectBrowser(
        imageStatus.every((image) => image.complete && image.width > 0),
        `${viewport.name}: at least one local image did not load`,
      );

      const geometry = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expectBrowser(
        geometry.scrollWidth <= geometry.clientWidth,
        `${viewport.name}: horizontal overflow ${geometry.scrollWidth}px > ${geometry.clientWidth}px`,
      );

      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
      await page.keyboard.press('Tab');
      expectBrowser(
        (await page.locator(':focus').textContent())?.includes('Skip to main content'),
        `${viewport.name}: skip link is not the first keyboard target`,
      );

      await page.getByRole('link', { name: 'Plan a pickup box' }).click();
      expectBrowser(new URL(page.url()).hash === '#preorder', `${viewport.name}: preorder navigation did not resolve`);
      await page.getByLabel('Sample product').selectOption('12');
      await page.getByLabel('Quantity').fill('3');
      await page.getByRole('button', { name: 'Calculate fictional estimate' }).click();
      const estimate = await page.getByRole('status').textContent();
      expectBrowser(estimate?.includes('3 × Honey hearth loaf: $36'), `${viewport.name}: estimator result is incorrect`);
      expectBrowser(estimate?.includes('nothing was ordered, sent, or saved'), `${viewport.name}: estimator boundary is missing`);

      const firstQuestion = page.locator('details').first();
      const summary = firstQuestion.locator('summary');
      await summary.focus();
      await page.keyboard.press('Enter');
      expectBrowser(await firstQuestion.evaluate((details) => details.open), `${viewport.name}: FAQ is not keyboard operable`);

      expectBrowser(consoleErrors.length === 0, `${viewport.name}: console errors: ${consoleErrors.join(' | ')}`);
      expectBrowser(pageErrors.length === 0, `${viewport.name}: page errors: ${pageErrors.join(' | ')}`);
      expectBrowser(failedRequests.length === 0, `${viewport.name}: failed requests: ${failedRequests.join(' | ')}`);
      expectBrowser(externalRequests.length === 0, `${viewport.name}: external requests: ${externalRequests.join(' | ')}`);

      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: join(evidenceRoot, `${viewport.name}.png`),
        fullPage: true,
      });
      await context.close();
    }
  } finally {
    await browser?.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

const text = (file) => readFileSync(join(packageRoot, file), 'utf8');
const requireText = (file, marker) => {
  if (!text(file).toLowerCase().includes(marker.toLowerCase())) {
    errors.push(`${file} is missing required marker: ${marker}`);
  }
};

for (const file of authoredFiles) {
  if (!existsSync(join(packageRoot, file))) errors.push(`missing authored file: ${file}`);
}
if (finalMode) {
  for (const file of evidenceFiles) {
    if (!existsSync(join(packageRoot, file))) errors.push(`missing generated evidence: ${file}`);
  }
}

if (!errors.length) {
  const markdownFiles = authoredFiles.filter((file) => file.endsWith('.md'));
  for (const file of markdownFiles) requireText(file, 'fictional');

  const businessMarkers = [
    'Fictional bakery profile',
    'Synthetic evidence record',
    'Opportunity analysis',
    'Weakness and improvement assessment',
    'Recommended service offer',
    'Resale-product ideas',
    'Assumptions and limitations',
  ];
  for (const marker of businessMarkers) requireText('BUSINESS_PACKAGE.md', marker);

  for (const marker of ['Website strategy', 'Website copy', 'Branding and imagery plan']) {
    requireText('WEBSITE_BRIEF.md', marker);
  }
  for (const marker of ['Draft outreach email', 'Call or meeting talking points', 'Proposal outline']) {
    requireText('OUTREACH_AND_PROPOSAL.md', marker);
  }
  for (const marker of ['Accessibility validation', 'Responsiveness validation', 'Technical validation']) {
    requireText('VALIDATION_REPORT.md', marker);
  }
  for (const marker of ['User-value scorecard', 'Gate 2 remains unauthorized']) {
    requireText('FINAL_APPROVAL.md', marker);
  }

  const html = text('site/index.html');
  const css = text('site/styles.css');
  const js = text('site/script.js');
  const allText = authoredFiles
    .filter((file) => file !== 'validate.mjs' && /\.(?:md|html|css|js|svg)$/.test(file))
    .map(text)
    .join('\n');

  const h1Count = (html.match(/<h1(?:\s|>)/g) ?? []).length;
  if (h1Count !== 1) errors.push(`site/index.html must contain exactly one h1; found ${h1Count}`);
  for (const landmark of ['<header', '<nav', '<main', '<footer']) {
    if (!html.includes(landmark)) errors.push(`site/index.html is missing landmark ${landmark}`);
  }
  for (const id of ['main-content', 'bake-case', 'preorder', 'story', 'visit', 'product', 'quantity']) {
    if (!html.includes(`id="${id}"`)) errors.push(`site/index.html is missing id="${id}"`);
  }
  for (const control of ['product', 'quantity']) {
    if (!html.includes(`for="${control}"`)) errors.push(`site/index.html is missing a label for ${control}`);
  }
  if (!html.includes('aria-live="polite"')) errors.push('estimator output must expose polite live status');
  if (!html.includes('Skip to main content')) errors.push('site/index.html is missing its skip link');
  if (!html.includes('Synthetic concept quote—not a customer testimonial')) {
    errors.push('synthetic quote is not clearly labeled');
  }
  if (!html.includes('Fictional contact details')) errors.push('fictional contact block is not labeled');
  if (!css.includes(':focus-visible')) errors.push('site/styles.css is missing visible focus styling');
  if (!css.includes('prefers-reduced-motion')) errors.push('site/styles.css is missing reduced-motion handling');

  const localRefs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  for (const ref of localRefs) {
    if (ref.startsWith('#')) {
      if (!ids.has(ref.slice(1))) errors.push(`broken same-page reference: ${ref}`);
    } else if (!/^(?:data:|javascript:)/i.test(ref)) {
      const cleanRef = ref.split(/[?#]/)[0];
      if (!existsSync(join(packageRoot, 'site', cleanRef))) errors.push(`missing local site asset: ${ref}`);
    }
  }

  const externalRefs = localRefs.filter((ref) => /^(?:https?:|mailto:|tel:|\/\/)/i.test(ref));
  if (externalRefs.length) errors.push(`external site references are forbidden: ${externalRefs.join(', ')}`);

  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage']) {
    if (js.includes(forbidden)) errors.push(`site/script.js contains forbidden network/storage primitive: ${forbidden}`);
  }
  for (const placeholder of ['lorem ipsum', 'TODO', 'TBD', 'your bakery name']) {
    if (allText.toLowerCase().includes(placeholder.toLowerCase())) {
      errors.push(`package contains placeholder text: ${placeholder}`);
    }
  }

  const secretPatterns = [
    ['OpenAI-style key', /\bsk-[A-Za-z0-9_-]{16,}\b/],
    ['Google-style key', /\bAIza[A-Za-z0-9_-]{20,}\b/],
    ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ];
  for (const [name, pattern] of secretPatterns) {
    if (pattern.test(allText)) errors.push(`package contains credential-like material: ${name}`);
  }

  if (!html.includes('@starwhisk.example')) errors.push('contact email must use the reserved .example domain');
  if (!html.includes('(555) 010-0142')) errors.push('contact phone must use the reserved fictional range');
  if (!html.includes('Exampletown, ZZ 00000')) errors.push('address must remain obviously fictional');

  const changedFiles = (
    finalMode
      ? execFileSync('git', ['diff', '--name-only', authorizedBase], {
          cwd: repoRoot,
          encoding: 'utf8',
        })
      : execFileSync('git', ['status', '--short', '--untracked-files=all'], {
          cwd: repoRoot,
          encoding: 'utf8',
        })
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => line.slice(3))
          .join('\n')
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replaceAll('\\', '/'));
  const unexpected = changedFiles.filter((file) => !allowlist.includes(file));
  if (unexpected.length) errors.push(`changed files outside allowlist: ${unexpected.join(', ')}`);

  if (finalMode) {
    const missingFromChangeSet = allowlist.filter((file) => !changedFiles.includes(file));
    if (missingFromChangeSet.length) {
      errors.push(`final changed-file set is incomplete: ${missingFromChangeSet.join(', ')}`);
    }
    if (changedFiles.length !== allowlist.length) {
      errors.push(`final changed-file count must be ${allowlist.length}; found ${changedFiles.length}`);
    }
  }
}

if (!errors.length && browserMode) {
  try {
    await runBrowserValidation();
  } catch (error) {
    errors.push(`browser validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (errors.length) {
  console.error('DOS-EXEC-001A pilot validation FAILED:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `DOS-EXEC-001A pilot validation OK — ${authoredFiles.length} authored files` +
    `${finalMode ? ` + ${evidenceFiles.length} generated evidence files` : ''}; ` +
    'synthetic labels, required sections, local links/assets, accessibility hooks, scope, and credential checks passed' +
    `${browserMode ? '; Chromium mobile/desktop interaction and screenshots passed' : ''}.`,
);
