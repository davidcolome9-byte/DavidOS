// Stamps a unique version into dist/sw.js after every build, so the browser
// always sees a byte-different service worker and actually installs the
// update. Without this, a service worker whose source never changes is
// permanently stuck once installed — the browser has no other signal that
// a new app version exists.
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'sw.js');
const version = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14); // e.g. 20260708225530

const content = readFileSync(dist, 'utf8');
if (!content.includes('__SW_VERSION__')) {
  throw new Error('sw.js is missing the __SW_VERSION__ placeholder — check public/sw.js.');
}
writeFileSync(dist, content.replaceAll('__SW_VERSION__', version));
console.log(`Stamped service worker cache version: ${version}`);
