import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * Cross-tab stale-state dialog (F-08). Shown when another tab has written
 * newer state. Accessibility contract:
 *  - focus moves into the dialog when it opens (and on every reopen);
 *  - the dialog has an accessible name and description;
 *  - keyboard focus is trapped inside while it is open (the background is
 *    additionally made inert by Layout);
 *  - Escape dismisses the DIALOG ONLY. The stale condition itself lives in
 *    the store (`externalChange`) and keeps persistence suppressed, so
 *    dismissing this dialog can never permit an overwrite — Layout swaps in
 *    a persistent warning banner with a control to reopen this dialog.
 */
interface Props {
  /** Dismiss the dialog view; the stale condition remains in force. */
  onDismiss: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function StaleTabDialog({ onDismiss }: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onDismiss();
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modal-overlay">
      <div
        className="modal"
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="stale-dialog-title"
        aria-describedby="stale-dialog-desc"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-testid="crosstab-guard"
      >
        <h2 id="stale-dialog-title">⚠️ Updated in another tab</h2>
        <div id="stale-dialog-desc">
          <p className="muted">
            DavidOS was changed in another tab or window. To avoid overwriting those newer changes,
            this tab has stopped saving. Nothing here has been lost — it simply won't be written.
          </p>
          <p className="muted small">Reload to continue with the latest saved data.</p>
        </div>
        <div className="btn-row">
          <button className="primary" onClick={() => window.location.reload()}>Reload with latest</button>
          <button onClick={onDismiss}>Keep reviewing without saving</button>
        </div>
      </div>
    </div>
  );
}
