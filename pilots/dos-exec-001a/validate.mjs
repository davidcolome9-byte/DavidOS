/* global process, URL, document, HTMLElement, window, console */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(packageRoot, '..', '..');
const authorizedBase = '497fab9abb06df86e20ef1e9fe4585d7c7274ab9';
const roundOneCandidate = 'e6939ebcd38bb9946bdb5170c6a195e07d39f5f6';
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
const roundTwoAllowlist = [
  'BUSINESS_PACKAGE.md',
  'OUTREACH_AND_PROPOSAL.md',
  'FINAL_APPROVAL.md',
  'README.md',
  'INDEPENDENT_REVIEW_PACKET.md',
  'VALIDATION_REPORT.md',
  'WORK_LOG.md',
  'validate.mjs',
].map((file) => `pilots/dos-exec-001a/${file}`);
const errors = [];

const expectBrowser = (condition, message) => {
  if (!condition) throw new Error(message);
};

const relativeLuminance = (hex) => {
  const channels = hex
    .replace('#', '')
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrastRatio = (foreground, background) => {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

const testedWidths = [320, 360, 375, 390, 414, 480, 540, 600, 620, 640, 768, 800, 820, 900, 1024, 1440];

async function assertResponsiveGeometry(page, label) {
  const geometry = await page.evaluate(() => {
    const rectangle = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return undefined;
      const box = element.getBoundingClientRect();
      return {
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
        width: box.width,
        height: box.height,
      };
    };
    const overlaps = (first, second) =>
      first &&
      second &&
      first.left < second.right &&
      first.right > second.left &&
      first.top < second.bottom &&
      first.bottom > second.top;
    const main = rectangle('.display-card-main');
    const productName = rectangle('.display-card-main strong');
    const descriptor = rectangle('.display-card-main small');
    const note = rectangle('.display-card-note');
    const navHeights = [...document.querySelectorAll('nav a')].map(
      (link) => link.getBoundingClientRect().height,
    );
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      main,
      productName,
      descriptor,
      note,
      noteOverlapsName: overlaps(note, productName),
      noteOverlapsDescriptor: overlaps(note, descriptor),
      navHeights,
    };
  });

  expectBrowser(
    geometry.scrollWidth <= geometry.clientWidth,
    `${label}: horizontal overflow ${geometry.scrollWidth}px > ${geometry.clientWidth}px`,
  );
  expectBrowser(geometry.main?.width > 0 && geometry.main.height > 0, `${label}: main display card is not visible`);
  expectBrowser(
    geometry.productName?.width > 0 && geometry.productName.height > 0,
    `${label}: product name is not visible`,
  );
  expectBrowser(
    geometry.descriptor?.width > 0 && geometry.descriptor.height > 0,
    `${label}: product descriptor is not visible`,
  );
  expectBrowser(geometry.note?.width > 0 && geometry.note.height > 0, `${label}: oven note is not visible`);
  expectBrowser(!geometry.noteOverlapsName, `${label}: oven note overlaps the product name`);
  expectBrowser(!geometry.noteOverlapsDescriptor, `${label}: oven note overlaps the product descriptor`);
  expectBrowser(
    geometry.productName.top >= geometry.main.top - 1 &&
      geometry.productName.bottom <= geometry.main.bottom + 1,
    `${label}: product name is clipped by its card`,
  );
  expectBrowser(
    geometry.descriptor.top >= geometry.main.top - 1 &&
      geometry.descriptor.bottom <= geometry.main.bottom + 1,
    `${label}: product descriptor is clipped by its card`,
  );
  expectBrowser(
    geometry.navHeights.every((height) => height >= 44),
    `${label}: primary navigation has a touch target shorter than 44px`,
  );
}

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
  const screenshotHashes = {};
  try {
    browser = await chromium.launch({ headless: true });
    const viewports = testedWidths.map((width) => ({
      name: width === 375 ? 'mobile' : width === 1440 ? 'desktop' : `width-${width}`,
      width,
      height: width === 375 ? 812 : 900,
      screenshot: width === 375 || width === 1440,
    }));

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

      await assertResponsiveGeometry(page, `${viewport.width}px`);

      if (viewport.screenshot) {
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
        expectBrowser(
          estimate?.includes('nothing was ordered, sent, or saved'),
          `${viewport.name}: estimator boundary is missing`,
        );

        const firstQuestion = page.locator('details').first();
        const summary = firstQuestion.locator('summary');
        await summary.focus();
        await page.keyboard.press('Enter');
        expectBrowser(
          await firstQuestion.evaluate((details) => details.open),
          `${viewport.name}: FAQ is not keyboard operable`,
        );
      }

      expectBrowser(consoleErrors.length === 0, `${viewport.name}: console errors: ${consoleErrors.join(' | ')}`);
      expectBrowser(pageErrors.length === 0, `${viewport.name}: page errors: ${pageErrors.join(' | ')}`);
      expectBrowser(failedRequests.length === 0, `${viewport.name}: failed requests: ${failedRequests.join(' | ')}`);
      expectBrowser(externalRequests.length === 0, `${viewport.name}: external requests: ${externalRequests.join(' | ')}`);

      if (viewport.screenshot) {
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          window.scrollTo(0, 0);
        });
        const screenshotPath = join(evidenceRoot, `${viewport.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        const regenerated = await page.screenshot({ fullPage: true });
        const saved = readFileSync(screenshotPath);
        expectBrowser(saved.equals(regenerated), `${viewport.name}: regenerated screenshot is not byte-identical`);
        screenshotHashes[`${viewport.name}.png`] = createHash('sha256').update(saved).digest('hex').toUpperCase();
      }
      await context.close();
    }

    for (const zoomCase of [
      { width: 375, percent: 125 },
      { width: 800, percent: 150 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: zoomCase.width, height: 900 },
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.evaluate((percent) => {
        document.documentElement.style.fontSize = `${percent}%`;
      }, zoomCase.percent);
      await assertResponsiveGeometry(page, `${zoomCase.width}px at ${zoomCase.percent}% text zoom`);
      await context.close();
    }

    const noScriptContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
      javaScriptEnabled: false,
    });
    const noScriptPage = await noScriptContext.newPage();
    await noScriptPage.goto(baseUrl, { waitUntil: 'networkidle' });
    const initialUrl = noScriptPage.url();
    const initialOutput = await noScriptPage.getByRole('status').textContent();
    const noScriptNote = noScriptPage.locator('.no-script-note');
    expectBrowser(await noScriptNote.isVisible(), 'no-JS: inactive estimator disclosure is not visible');
    expectBrowser(
      (await noScriptNote.textContent())?.includes('this local estimator is inactive'),
      'no-JS: inactive estimator disclosure is incomplete',
    );
    await noScriptPage.getByRole('button', { name: 'Calculate fictional estimate' }).click();
    expectBrowser(noScriptPage.url() === initialUrl, 'no-JS: estimator changed or reloaded the URL');
    expectBrowser(!new URL(noScriptPage.url()).search, 'no-JS: estimator added a query string');
    expectBrowser(
      (await noScriptPage.getByRole('status').textContent()) === initialOutput,
      'no-JS: estimator appeared to calculate or submit',
    );
    await noScriptContext.close();
  } finally {
    await browser?.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
  const validationReport = readFileSync(join(packageRoot, 'VALIDATION_REPORT.md'), 'utf8');
  for (const [file, hash] of Object.entries(screenshotHashes)) {
    expectBrowser(
      validationReport.includes(hash),
      `${file}: regenerated SHA-256 does not match the expected hash in VALIDATION_REPORT.md`,
    );
  }
  return screenshotHashes;
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
    'Monday-morning action list',
    'Do-nothing alternative',
    'Manual measurement plan',
    'Re-verification map before real use',
    'Assumptions and limitations',
  ];
  for (const marker of businessMarkers) requireText('BUSINESS_PACKAGE.md', marker);

  for (const marker of ['Website strategy', 'Website copy', 'Branding and imagery plan']) {
    requireText('WEBSITE_BRIEF.md', marker);
  }
  for (const marker of [
    'Draft outreach email',
    'Call or meeting talking points',
    'Bakery-owner objection handling',
    'Proposal outline',
    'Fictional revision policy',
  ]) {
    requireText('OUTREACH_AND_PROPOSAL.md', marker);
  }
  for (const marker of ['Accessibility validation', 'Responsiveness validation', 'Technical validation']) {
    requireText('VALIDATION_REPORT.md', marker);
  }
  for (const marker of ['User-value scorecard', 'Round 2 decision-readiness additions', 'Gate 2 remains unauthorized']) {
    requireText('FINAL_APPROVAL.md', marker);
  }
  requireText('README.md', 'Original command and required-output traceability');

  const businessPackage = text('BUSINESS_PACKAGE.md');
  const outreachProposal = text('OUTREACH_AND_PROPOSAL.md');
  const readme = text('README.md');
  const section = (documentText, heading) =>
    documentText.split(`## ${heading}`)[1]?.split(/\n## /)[0] ?? '';
  const mondayActions = section(businessPackage, 'Monday-morning action list');
  const actionRows = mondayActions.match(/^\| [1-5] \|/gm) ?? [];
  if (actionRows.length !== 5) {
    errors.push(`Monday-morning action list must contain exactly five actions; found ${actionRows.length}`);
  }
  const actionTimes = mondayActions.match(/≤15 min/g) ?? [];
  if (actionTimes.length !== 5) {
    errors.push(`each Monday-morning action must state a ≤15 minute limit; found ${actionTimes.length}`);
  }
  for (const marker of [
    'What remains unchanged',
    'Risks that remain',
    'Costs avoided',
    'Low-effort manual alternatives',
    'Why no action may be reasonable',
  ]) {
    if (!section(businessPackage, 'Do-nothing alternative').includes(marker)) {
      errors.push(`do-nothing alternative is missing: ${marker}`);
    }
  }
  const measurementPlan = section(businessPackage, 'Manual measurement plan');
  const syntheticBaselines = measurementPlan.match(/Synthetic placeholder:/g) ?? [];
  if (syntheticBaselines.length !== 7) {
    errors.push(`manual measurement plan must contain seven synthetic baselines; found ${syntheticBaselines.length}`);
  }
  for (const marker of [
    'Custom-order inquiries',
    'Wholesale conversations',
    'Phone calls mentioning the website',
    'Counter questions about featured products',
    'Order counts recorded manually',
    'Day-old inventory counts',
    'Repeat catering inquiries',
  ]) {
    if (!measurementPlan.includes(marker)) errors.push(`manual measurement plan is missing: ${marker}`);
  }
  const verificationMap = section(businessPackage, 'Re-verification map before real use');
  for (const marker of [
    'Bakery name',
    'Owner identity',
    'Address',
    'Phone number',
    'Email',
    'Website domain',
    'Business hours',
    'Product names',
    'Product prices',
    'Ingredient and allergen information',
    'Wholesale terms',
    'Lead times',
    'Capacity',
    'Margins',
    'Customer segments',
    'Operational bottlenecks',
    'Testimonials, ratings, awards, press, and customer counts',
  ]) {
    if (!verificationMap.includes(marker)) errors.push(`re-verification map is missing: ${marker}`);
  }
  for (const objection of [
    'We already have Instagram.',
    'I do not have time to manage another system.',
    'I cannot justify spending money on this yet.',
  ]) {
    if (!outreachProposal.includes(objection)) errors.push(`objection handling is missing: ${objection}`);
  }
  for (const marker of [
    'Included rounds:',
    'A revision means:',
    'Not a revision:',
    'Client-supplied inputs:',
    'New estimate or separate scope:',
  ]) {
    if (!outreachProposal.includes(marker)) errors.push(`revision policy is missing: ${marker}`);
  }
  const traceability = section(readme, 'Original command and required-output traceability');
  const traceabilityRows = traceability.match(/^\| (?:[1-9]|1[0-9]|20) \|/gm) ?? [];
  if (traceabilityRows.length !== 20) {
    errors.push(`required-output traceability must contain 20 mapped rows; found ${traceabilityRows.length}`);
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
  if (html.includes('<form class="estimator"')) errors.push('estimator must not expose no-JS form submission behavior');
  if (!html.includes('id="calculate-estimate" type="button"')) {
    errors.push('estimator trigger must be an explicit non-submit button');
  }
  if (!html.includes('<noscript>') || !html.includes('this local estimator is inactive')) {
    errors.push('estimator must explain its honest no-JS inactive state');
  }
  if (!html.includes('Skip to main content')) errors.push('site/index.html is missing its skip link');
  if (!html.includes('Synthetic concept quote—not a customer testimonial')) {
    errors.push('synthetic quote is not clearly labeled');
  }
  if (!html.includes('Fictional contact details')) errors.push('fictional contact block is not labeled');
  if (!css.includes(':focus-visible')) errors.push('site/styles.css is missing visible focus styling');
  if (!css.includes('prefers-reduced-motion')) errors.push('site/styles.css is missing reduced-motion handling');
  for (const [foreground, background, label] of [
    ['#9a3e25', '#fff9ed', 'eyebrow on cream'],
    ['#9a3e25', '#fffdf8', 'card kicker on paper'],
    ['#4d5b39', '#e9cad4', 'product type on darkest product-card background'],
    ['#f4b75e', '#5b273d', 'visit eyebrow on plum'],
  ]) {
    const ratio = contrastRatio(foreground, background);
    if (ratio < 4.5) errors.push(`${label} contrast must be at least 4.5:1; found ${ratio.toFixed(2)}:1`);
  }

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

  const untrackedFiles = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replaceAll('\\', '/'));
  if (untrackedFiles.length) errors.push(`new untracked files are forbidden: ${untrackedFiles.join(', ')}`);

  if (finalMode) {
    const missingFromChangeSet = allowlist.filter((file) => !changedFiles.includes(file));
    if (missingFromChangeSet.length) {
      errors.push(`final changed-file set is incomplete: ${missingFromChangeSet.join(', ')}`);
    }
    if (changedFiles.length !== allowlist.length) {
      errors.push(`final changed-file count must be ${allowlist.length}; found ${changedFiles.length}`);
    }
    const roundTwoChangedFiles = execFileSync('git', ['diff', '--name-only', roundOneCandidate], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split(/\r?\n/)
      .filter(Boolean)
      .map((file) => file.replaceAll('\\', '/'));
    const unexpectedRoundTwo = roundTwoChangedFiles.filter((file) => !roundTwoAllowlist.includes(file));
    if (unexpectedRoundTwo.length) {
      errors.push(`Round 2 changed files outside its document allowlist: ${unexpectedRoundTwo.join(', ')}`);
    }
    if (!roundTwoChangedFiles.length) errors.push('Round 2 correction delta is empty');
  }
}

if (!errors.length && browserMode) {
  try {
    const screenshotHashes = await runBrowserValidation();
    console.log(
      `Responsive widths passed: ${testedWidths.join(', ')}px; text zoom passed: 375px/125%, 800px/150%; ` +
        `screenshot SHA-256: mobile=${screenshotHashes['mobile.png']}, desktop=${screenshotHashes['desktop.png']}`,
    );
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
    '; business actions, objections, no-action option, revisions, measurement, re-verification, and traceability passed' +
    `${browserMode ? '; Chromium 16-width responsive, zoom, no-JS, interaction, and screenshot checks passed' : ''}.`,
);
