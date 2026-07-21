// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import AppErrorBoundary from '../../app/AppErrorBoundary';
import { STORAGE_KEY, RECOVERY_KEY_PREFIX } from '../../lib/storage/localStore';
import { JOURNAL_GENERATION_PREFIX, commitJournalState } from '../../lib/storage/stateJournal';
import type { ExclusiveLockCoordinator } from '../../lib/storage/stateJournal';
import type { AppState } from '../../lib/types';

/** Runs the callback immediately — no real Web Locks in happy-dom. */
const immediateLockCoordinator = (): ExclusiveLockCoordinator => ({
  requestExclusive: async (_name, callback) => ({ status: 'acquired', value: await callback() }),
});

// DOS-STAB-001A — the top-level crash boundary must replace a crashed app
// tree with a working recovery surface (reload + byte-exact exports) WITHOUT
// StoreProvider, routing, or hydrated state, must never delete or repair
// anything automatically, and must never display state contents. All values
// are synthetic.

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const SYN_RAW_BLOB = '{"schemaVersion":1,"syntheticSecret":"SYN-CRASH-SECRET-77"}';
const SYN_RECOVERY_A = '{"syn":"SYN-RECOVERY-BLOB-A"}';
const SYN_RECOVERY_B = 'SYN-RECOVERY-BLOB-B (not even JSON)';

type Op = ['set' | 'remove', string];

/** Fake localStorage with a real key(i) so the boundary can enumerate keys. */
function fakeLocalStorage() {
  const store = new Map<string, string>();
  const ops: Op[] = [];
  return {
    store,
    ops,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      ops.push(['set', k]);
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      ops.push(['remove', k]);
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

function Bomb(): never {
  throw new Error('SYN-ERROR-DETAIL-XYZ (synthetic test crash)');
}

let container: HTMLElement;
let root: Root | null = null;
let storage: ReturnType<typeof fakeLocalStorage>;
let downloads: Array<{ filename: string; text: Promise<string> }>;
let revokedUrls: string[];

beforeEach(() => {
  storage = fakeLocalStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  // React logs caught errors — keep test output clean and capturable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // Capture downloads: URL.createObjectURL receives the Blob; anchor click is a no-op.
  downloads = [];
  revokedUrls = [];
  const urlAny = URL as unknown as Record<string, unknown>;
  urlAny.createObjectURL = (blob: Blob) => {
    downloads.push({ filename: '', text: blob.text() });
    return `blob:syn-url-${downloads.length}`;
  };
  urlAny.revokeObjectURL = (url: string) => {
    revokedUrls.push(url);
  };
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    if (downloads.length > 0) downloads[downloads.length - 1].filename = this.download;
  });
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
});

async function mount(children: React.ReactNode) {
  root = createRoot(container);
  await act(async () => {
    root!.render(<AppErrorBoundary>{children}</AppErrorBoundary>);
  });
}

function fallbackButton(re: RegExp): HTMLButtonElement {
  const b = [...container.querySelectorAll('button')].find((x) => re.test(x.textContent ?? ''));
  if (!b) throw new Error(`fallback button ${re} not found`);
  return b as HTMLButtonElement;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('crash containment', () => {
  it('renders healthy children untouched', async () => {
    await mount(<p data-testid="healthy-child">syn-healthy</p>);
    expect(container.querySelector('[data-testid="healthy-child"]')).not.toBeNull();
    expect(container.querySelector('h1')).toBeNull();
  });

  it('a child render exception is caught: recovery surface instead of a blank page', async () => {
    await mount(<Bomb />);
    expect(container.textContent).toContain('DavidOS encountered an application error');
    expect(container.querySelector('button')).not.toBeNull(); // not blank
  });

  it('the fallback has a clear accessible heading that receives focus', async () => {
    await mount(<Bomb />);
    const h1 = container.querySelector('h1')!;
    expect(h1.textContent).toContain('DavidOS encountered an application error');
    expect(document.activeElement).toBe(h1);
  });

  it('the fallback is keyboard-accessible: all actions are native buttons', async () => {
    storage.store.set(STORAGE_KEY, SYN_RAW_BLOB);
    storage.store.set(`${RECOVERY_KEY_PREFIX}2026-01-01T00-00-00-000Z`, SYN_RECOVERY_A);
    await mount(<Bomb />);
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const b of buttons) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.disabled).toBe(false);
      expect((b.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
  });
});

describe('recovery exports (no StoreProvider required)', () => {
  it('exports the raw primary storage blob byte-for-byte', async () => {
    storage.store.set(STORAGE_KEY, SYN_RAW_BLOB);
    await mount(<Bomb />);
    await click(fallbackButton(/Download saved data/));

    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toMatch(/^davidos-raw-state-.*\.json$/);
    expect(await downloads[0].text).toBe(SYN_RAW_BLOB);
  });

  it('offers no raw-data download when nothing is stored', async () => {
    await mount(<Bomb />);
    expect([...container.querySelectorAll('button')].some((b) => /Download saved data/.test(b.textContent ?? ''))).toBe(false);
  });

  // Regression (found in Phase 2B browser acceptance): a journal-backed device
  // has NO legacy blob, so reading only the legacy key offered the user either
  // nothing or stale bytes on the crash screen. The export must be the CURRENT
  // committed generation.
  it('exports the committed journal generation, not the legacy blob, when the journal is authoritative', async () => {
    const committed = '{"schemaVersion":1,"syntheticSecret":"SYN-CRASH-JOURNAL-88"}';
    const result = await commitJournalState(JSON.parse(committed) as AppState, {
      storage: storage as unknown as Storage,
      expectedGeneration: null,
      coordinator: immediateLockCoordinator(),
      idFactory: (() => {
        let n = 0;
        return () => `syn-crash-gen-${String(++n).padStart(8, '0')}`;
      })(),
    });
    if (!result.ok) throw new Error('synthetic journal setup failed');
    // A STALE legacy blob is also present — it must not be what gets exported.
    storage.store.set(STORAGE_KEY, SYN_RAW_BLOB);

    await mount(<Bomb />);
    await click(fallbackButton(/Download saved data/));

    expect(downloads).toHaveLength(1);
    expect(await downloads[0].text).toBe(committed);
    expect(await downloads[0].text).not.toBe(SYN_RAW_BLOB);
  });

  it('falls back to the legacy blob when no journal authority exists', async () => {
    storage.store.set(STORAGE_KEY, SYN_RAW_BLOB);
    // An ORPHAN generation with no valid head must not become the export.
    storage.store.set(`${JOURNAL_GENERATION_PREFIX}syn-crash-orphan-0001`, '{"schemaVersion":1,"orphan":true}');

    await mount(<Bomb />);
    await click(fallbackButton(/Download saved data/));

    expect(await downloads[0].text).toBe(SYN_RAW_BLOB);
  });

  it('surfaces every preserved recovery blob as its own byte-exact download', async () => {
    const keyA = `${RECOVERY_KEY_PREFIX}2026-01-01T00-00-00-000Z`;
    const keyB = `${RECOVERY_KEY_PREFIX}2026-02-02T00-00-00-000Z`;
    storage.store.set(keyA, SYN_RECOVERY_A);
    storage.store.set(keyB, SYN_RECOVERY_B);
    await mount(<Bomb />);

    await click(fallbackButton(/Download recovery copy 1/));
    await click(fallbackButton(/Download recovery copy 2/));
    expect(downloads).toHaveLength(2);
    expect(await downloads[0].text).toBe(SYN_RECOVERY_A);
    expect(await downloads[1].text).toBe(SYN_RECOVERY_B);
    // Fixed-format, index-based filenames — never derived from storage keys.
    expect(downloads[0].filename).toMatch(/^davidos-recovery-copy-1-[\dTZ-]+-\d+\.json$/);
    expect(downloads[1].filename).toMatch(/^davidos-recovery-copy-2-[\dTZ-]+-\d+\.json$/);
    expect(downloads[0].filename).not.toContain(keyA);
  });

  it('Reload triggers a page reload', async () => {
    const reload = vi.fn();
    const loc = window.location as unknown as Record<string, unknown>;
    const original = loc.reload;
    loc.reload = reload;
    try {
      await mount(<Bomb />);
      await click(fallbackButton(/Reload DavidOS/));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      loc.reload = original;
    }
  });
});

describe('independent, guarded, bounded storage discovery', () => {
  it('a throwing localStorage.length still lets the primary blob be discovered and exported', async () => {
    storage.store.set(STORAGE_KEY, SYN_RAW_BLOB);
    Object.defineProperty(storage, 'length', {
      get() {
        throw new DOMException('busy', 'InvalidStateError');
      },
      configurable: true,
    });
    await mount(<Bomb />);

    await click(fallbackButton(/Download saved data/));
    expect(await downloads[0].text).toBe(SYN_RAW_BLOB);
    // Recovery list degrades to empty without crashing the fallback.
    expect(container.textContent).not.toContain('Preserved recovery copies');
  });

  it('a throwing localStorage.key() still lets the primary blob be exported', async () => {
    storage.store.set(STORAGE_KEY, SYN_RAW_BLOB);
    (storage as unknown as Record<string, unknown>).key = () => {
      throw new DOMException('busy', 'InvalidStateError');
    };
    await mount(<Bomb />);

    await click(fallbackButton(/Download saved data/));
    expect(await downloads[0].text).toBe(SYN_RAW_BLOB);
  });

  it('key enumeration throwing MIDWAY keeps the recovery copies found so far', async () => {
    storage.store.set(`${RECOVERY_KEY_PREFIX}2026-01-01T00-00-00-000Z`, SYN_RECOVERY_A);
    storage.store.set(`${RECOVERY_KEY_PREFIX}2026-02-02T00-00-00-000Z`, SYN_RECOVERY_B);
    const realKey = storage.key.bind(storage);
    // The first slot reads fine; every later slot throws (mid-scan failure).
    (storage as unknown as Record<string, unknown>).key = (i: number) => {
      if (i > 0) throw new DOMException('busy', 'InvalidStateError');
      return realKey(i);
    };
    await mount(<Bomb />);

    // One key was seen before the throw — it is still offered.
    expect(container.textContent).toContain('Recovery copy 1');
    expect(container.textContent).not.toContain('Recovery copy 2');
  });

  it('excessive matching recovery keys are hard-bounded (20 listed at most)', async () => {
    for (let i = 0; i < 60; i++) {
      storage.store.set(`${RECOVERY_KEY_PREFIX}2026-01-01T00-00-${String(i).padStart(2, '0')}Z`, `syn-blob-${i}`);
    }
    await mount(<Bomb />);

    const buttons = [...container.querySelectorAll('button')].filter((b) =>
      /Download recovery copy/.test(b.textContent ?? ''),
    );
    expect(buttons.length).toBe(20);
    expect(container.textContent).toContain('only the first 20');
  });

  it('a recovery discovery failure does not prevent exporting a readable primary blob', async () => {
    storage.store.set(STORAGE_KEY, SYN_RAW_BLOB);
    const realGet = storage.getItem.bind(storage);
    // Enumeration fails entirely; direct primary reads still work.
    Object.defineProperty(storage, 'length', {
      get() {
        throw new DOMException('busy', 'InvalidStateError');
      },
      configurable: true,
    });
    (storage as unknown as Record<string, unknown>).getItem = (k: string) => realGet(k);
    await mount(<Bomb />);

    await click(fallbackButton(/Download saved data/));
    expect(await downloads[0].text).toBe(SYN_RAW_BLOB);
  });

  it('a primary discovery failure does not prevent exporting readable recovery copies', async () => {
    const keyA = `${RECOVERY_KEY_PREFIX}2026-01-01T00-00-00-000Z`;
    storage.store.set(keyA, SYN_RECOVERY_A);
    const realGet = storage.getItem.bind(storage);
    // Reading the PRIMARY key throws; recovery keys stay readable.
    (storage as unknown as Record<string, unknown>).getItem = (k: string) => {
      if (k === STORAGE_KEY) throw new DOMException('busy', 'InvalidStateError');
      return realGet(k);
    };
    await mount(<Bomb />);

    expect([...container.querySelectorAll('button')].some((b) => /Download saved data/.test(b.textContent ?? ''))).toBe(false);
    await click(fallbackButton(/Download recovery copy 1/));
    expect(await downloads[0].text).toBe(SYN_RECOVERY_A);
  });
});

describe('filenames are fixed, sanitized, and never key-derived', () => {
  const MALICIOUS_KEYS = [
    `${RECOVERY_KEY_PREFIX}../../etc/passwd`,
    `${RECOVERY_KEY_PREFIX}..\\..\\windows\\system32`,
    `${RECOVERY_KEY_PREFIX}SYN-PRIVATE-DIAGNOSIS-XYZ`,
  ];

  it('malicious recovery key names never reach a filename or the visible page', async () => {
    for (const k of MALICIOUS_KEYS) storage.store.set(k, SYN_RECOVERY_A);
    await mount(<Bomb />);

    // Keys with path separators / private-looking text are listed only as
    // neutral numbered entries.
    const visible = container.textContent ?? '';
    expect(visible).not.toContain('passwd');
    expect(visible).not.toContain('system32');
    expect(visible).not.toContain('SYN-PRIVATE-DIAGNOSIS-XYZ');

    await click(fallbackButton(/Download recovery copy 1/));
    await click(fallbackButton(/Download recovery copy 2/));
    await click(fallbackButton(/Download recovery copy 3/));
    for (const d of downloads) {
      expect(d.filename).toMatch(/^davidos-recovery-copy-\d+-[\dTZ-]+-\d+\.json$/);
      expect(d.filename).not.toContain('..');
      expect(d.filename).not.toContain('/');
      expect(d.filename).not.toContain('\\');
      expect(d.filename).not.toContain('SYN-PRIVATE-DIAGNOSIS-XYZ');
    }
    // The bytes themselves are still exported exactly.
    expect(await downloads[0].text).toBe(SYN_RECOVERY_A);
  });

  it('repeated primary exports produce unique filenames (beyond the calendar day)', async () => {
    storage.store.set(STORAGE_KEY, SYN_RAW_BLOB);
    await mount(<Bomb />);
    await click(fallbackButton(/Download saved data/));
    await click(fallbackButton(/Download saved data/));
    await click(fallbackButton(/Download saved data/));

    const names = downloads.map((d) => d.filename);
    expect(new Set(names).size).toBe(3);
    for (const n of names) expect(n).toMatch(/^davidos-raw-state-[\dTZ-]+-\d+\.json$/);
  });

  it('every download revokes its Blob URL', async () => {
    storage.store.set(STORAGE_KEY, SYN_RAW_BLOB);
    storage.store.set(`${RECOVERY_KEY_PREFIX}2026-01-01T00-00-00-000Z`, SYN_RECOVERY_A);
    await mount(<Bomb />);
    await click(fallbackButton(/Download saved data/));
    await click(fallbackButton(/Download recovery copy 1/));

    expect(revokedUrls).toEqual(['blob:syn-url-1', 'blob:syn-url-2']);
  });
});

describe('safety and privacy of the fallback', () => {
  it('never deletes, writes, or repairs anything automatically', async () => {
    storage.store.set(STORAGE_KEY, SYN_RAW_BLOB);
    const before = new Map(storage.store);
    await mount(<Bomb />);
    expect(storage.ops).toEqual([]); // zero writes/removes
    expect(storage.store).toEqual(before);
  });

  it('does not display state contents, error details, or stack traces', async () => {
    storage.store.set(STORAGE_KEY, SYN_RAW_BLOB);
    storage.store.set(`${RECOVERY_KEY_PREFIX}2026-01-01T00-00-00-000Z`, SYN_RECOVERY_A);
    await mount(<Bomb />);
    const visible = container.textContent ?? '';
    expect(visible).not.toContain('SYN-CRASH-SECRET-77');
    expect(visible).not.toContain('SYN-RECOVERY-BLOB-A');
    expect(visible).not.toContain('SYN-ERROR-DETAIL-XYZ');
    expect(visible).not.toContain('at Bomb'); // no stack frames
  });

  it('its own crash log line is generic — no error message contents', async () => {
    const lines: string[] = [];
    (console.error as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));
    });
    await mount(<Bomb />);
    const own = lines.filter((l) => l.startsWith('DavidOS:'));
    expect(own.length).toBeGreaterThan(0);
    for (const l of own) expect(l).not.toContain('SYN-ERROR-DETAIL-XYZ');
  });
});
