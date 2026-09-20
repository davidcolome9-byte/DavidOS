/**
 * Show/Hide control plus the revealed text panel (OL-028). The toggle stays
 * mounted so keyboard focus is never dropped to <body> after the reveal, and
 * the panel is a labelled, focusable region so a keyboard-only user can scroll
 * overflowing output. The text is rendered only while revealed — it is never
 * present in the DOM (hidden or not) before the user asks to see it.
 */
export interface RevealToggleProps {
  /** Unique DOM id for the revealed panel (target of aria-controls). */
  panelId: string;
  /** What is being revealed, e.g. "Inserted Planning State Text". */
  subject: string;
  revealed: boolean;
  onToggle: () => void;
  text: string;
}

export default function RevealToggle({ panelId, subject, revealed, onToggle, text }: RevealToggleProps) {
  return (
    <>
      <button
        type="button"
        className="chip"
        aria-expanded={revealed}
        aria-controls={panelId}
        onClick={onToggle}
      >
        {revealed ? 'Hide' : 'Show'} {subject}
      </button>
      {revealed && (
        <pre id={panelId} className="output" role="region" aria-label={subject} tabIndex={0}>
          {text}
        </pre>
      )}
    </>
  );
}
