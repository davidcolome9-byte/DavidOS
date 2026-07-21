import { Component, createRef } from 'react';
import type { ErrorInfo, ReactNode, RefObject } from 'react';
import { STORAGE_KEY, RECOVERY_KEY_PREFIX } from '../lib/storage/localStore';
import { selectJournalAuthority } from '../lib/storage/stateJournal';
import { downloadTextFile } from '../lib/storage/exportImport';

/**
 * Top-level crash recovery (DOS-STAB-001A). This boundary sits OUTSIDE
 * StoreProvider, routing, and Layout, so a crash anywhere in the app tree —
 * including state hydration and render paths — lands on a working recovery
 * surface instead of a permanent blank page.
 *
 * The fallback:
 *  - names the failure plainly, without stack traces, raw state, storage
 *    keys, or any user content;
 *  - offers Reload;
 *  - offers a byte-exact download of the raw primary storage blob (works
 *    with nothing but localStorage — no store, router, or hydrated state);
 *  - offers byte-exact downloads of any preserved recovery copies;
 *  - NEVER deletes, repairs, or resets anything automatically.
 *
 * Discovery is split into two INDEPENDENTLY guarded probes: a failure while
 * enumerating recovery copies must not hide a readable primary blob, and an
 * unreadable primary blob must not hide readable recovery copies. Recovery
 * enumeration is hard-bounded, and download filenames are fixed-format
 * (stem + timestamp + counter / list index) — storage keys, record ids, or
 * any other stored text never reach a filename.
 *
 * Known, deliberate limitations (React error boundaries): module-evaluation
 * failures, createRoot failures, event-handler errors, arbitrary async
 * errors, and anything thrown before this boundary mounts are NOT caught.
 * This component is not a global browser-error capture system.
 */

interface Props {
  children: ReactNode;
}

interface State {
  crashed: boolean;
}

/** Most recovery copies ever listed — a hard bound on what the UI offers. */
const MAX_RECOVERY_COPIES = 20;
/** Hard upper limit on key slots examined, whatever `length` claims. */
const MAX_KEYS_SCANNED = 1000;

/**
 * The user's CURRENT canonical data, byte-exact: the verified journal
 * generation when the journal is authoritative (DOS-STAB-001A), else the
 * legacy blob for devices that have not migrated. Reading only the legacy key
 * would offer a journal-backed device an export of stale bytes, or none at
 * all. The two sources are guarded INDEPENDENTLY so a failure in either
 * cannot hide the other.
 */
function readPrimaryRaw(): string | null {
  try {
    const authority = selectJournalAuthority(localStorage).authority;
    if (authority) return authority.raw;
  } catch {
    /* journal unreadable — fall through to the legacy blob */
  }
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Enumerate preserved recovery keys with a hard iteration bound and a cap on
 * results. Guarded independently of the primary probe; a throw mid-scan
 * keeps whatever was found up to that point.
 */
function scanRecoveryKeys(): string[] {
  const keys: string[] = [];
  let slots: number;
  try {
    slots = Math.min(localStorage.length, MAX_KEYS_SCANNED);
  } catch {
    return keys;
  }
  for (let i = 0; i < slots && keys.length < MAX_RECOVERY_COPIES; i++) {
    let key: string | null;
    try {
      key = localStorage.key(i);
    } catch {
      break;
    }
    if (key !== null && key.startsWith(RECOVERY_KEY_PREFIX)) keys.push(key);
  }
  keys.sort();
  return keys;
}

let exportSequence = 0;

/**
 * Fixed-format unique filename: sanitized stem + timestamp + monotonic
 * counter. Never derived from storage keys, record ids, or stored text, so
 * repeated exports on the same day still get distinct names and a malicious
 * key name can never reach the filesystem.
 */
function exportFilename(stem: string): string {
  exportSequence += 1;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `${stem}-${ts}-${exportSequence}.json`;
}

/** Byte-exact download of one stored key. Failures degrade to a no-op. */
function downloadStoredKey(key: string, filename: string): void {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return;
    downloadTextFile(raw, filename);
  } catch {
    /* storage unavailable — nothing to download */
  }
}

/** Byte-exact download of already-read text. Failures degrade to a no-op. */
function downloadRaw(raw: string, filename: string): void {
  try {
    downloadTextFile(raw, filename);
  } catch {
    /* download unavailable — nothing else to do here */
  }
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };
  private headingRef: RefObject<HTMLHeadingElement> = createRef();

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo): void {
    // Deliberately generic: the thrown error can contain state values, so
    // this line adds no details of its own (the browser/React already
    // surface the error itself).
    console.error(
      'DavidOS: the app view crashed during render. Saved data was not modified by this crash; the recovery screen is now shown.',
    );
  }

  componentDidMount(): void {
    // A crash during the very first render commits the fallback directly.
    if (this.state.crashed) this.headingRef.current?.focus();
  }

  componentDidUpdate(_prevProps: Props, prevState: State): void {
    // Move focus to the heading so keyboard and screen-reader users land on
    // the explanation, not in a void.
    if (!prevState.crashed && this.state.crashed) this.headingRef.current?.focus();
  }

  render(): ReactNode {
    if (!this.state.crashed) return this.props.children;

    // Two independent probes: either can fail without hiding the other.
    const primaryRaw = readPrimaryRaw();
    const recoveryKeys = scanRecoveryKeys();
    return (
      <main className="crash-recovery" style={{ padding: '1.5rem', maxWidth: 640, margin: '0 auto' }}>
        <div className="card" role="alert">
          <h1 ref={this.headingRef} tabIndex={-1} style={{ fontSize: '1.25rem' }}>
            ⚠️ DavidOS encountered an application error
          </h1>
          <p className="muted">
            The app view crashed and cannot be shown right now. Your saved data was not
            changed by this error, and nothing will be deleted or repaired automatically.
          </p>
          <p className="muted small">
            You can reload to try again, and you can download an exact copy of the data
            saved on this device first if you want a safety copy.
          </p>
          <div className="btn-row">
            <button className="primary" onClick={() => window.location.reload()}>
              Reload DavidOS
            </button>
            {primaryRaw !== null && (
              <button onClick={() => downloadRaw(primaryRaw, exportFilename('davidos-raw-state'))}>
                Download saved data (exact copy)
              </button>
            )}
          </div>
          {recoveryKeys.length > 0 && (
            <>
              <h2 style={{ fontSize: '1rem' }}>Preserved recovery copies</h2>
              <p className="muted small">
                Earlier data-recovery events preserved {recoveryKeys.length} untouched
                {recoveryKeys.length === 1 ? ' copy' : ' copies'} of previous data on this
                device{recoveryKeys.length >= MAX_RECOVERY_COPIES ? ' (only the first ' + MAX_RECOVERY_COPIES + ' are listed here)' : ''}.
                Each can be downloaded exactly as it was preserved.
              </p>
              <ul className="plain small">
                {recoveryKeys.map((key, i) => (
                  <li key={i} className="row">
                    <span className="muted">Recovery copy {i + 1}</span>
                    <button onClick={() => downloadStoredKey(key, exportFilename(`davidos-recovery-copy-${i + 1}`))}>
                      Download recovery copy {i + 1}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </main>
    );
  }
}
