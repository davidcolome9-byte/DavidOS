import { useModalFocus } from './useModalFocus';

/**
 * Cross-tab stale-state dialog (F-08). Shown when another tab has written
 * newer state. Accessibility contract (via useModalFocus, OL-015):
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

export default function StaleTabDialog({ onDismiss }: Props) {
  // Mounted only while shown, so the dialog is always open from the hook's
  // perspective; Layout owns open/close and the focus hand-off after dismiss.
  const dialogRef = useModalFocus<HTMLDivElement>({ open: true, onEscape: onDismiss });

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
