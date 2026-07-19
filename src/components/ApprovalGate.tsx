import { useRef } from 'react';
import type { RiskLevel } from '../lib/types';
import { isBlockedInV1 } from '../lib/safety/approvalRules';
import RiskBadge from './RiskBadge';
import { useModalFocus } from './useModalFocus';

export interface ApprovalRequest {
  title: string;
  description: string;
  risk: RiskLevel;
}

interface Props {
  request: ApprovalRequest | null;
  onDecision: (approved: boolean) => void;
}

/**
 * Blocking modal for external / sensitive / high-risk actions.
 * Nothing behind this gate runs until the user explicitly approves.
 * High-risk actions cannot be approved at all in v1.
 * Keyboard safety: the safe control (Deny / Close) takes initial focus and
 * Escape ALWAYS denies — no key path can approve.
 */
export default function ApprovalGate({ request, onDecision }: Props) {
  const safeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalFocus<HTMLDivElement>({
    open: request !== null,
    onEscape: () => onDecision(false),
    initialFocusRef: safeButtonRef,
  });
  if (!request) return null;
  const blocked = isBlockedInV1(request.risk);
  return (
    <div className="modal-overlay">
      <div
        className="modal"
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="approval-gate-title"
        aria-describedby="approval-gate-desc"
        tabIndex={-1}
      >
        <h2 id="approval-gate-title">⚠️ Approval required</h2>
        <p><strong>{request.title}</strong></p>
        <p className="muted" id="approval-gate-desc">{request.description}</p>
        <p><RiskBadge risk={request.risk} /></p>
        {blocked ? (
          <>
            <p className="muted">
              Financial, medical, and legal actions are blocked in v1 and cannot be approved here.
            </p>
            <div className="btn-row">
              <button ref={safeButtonRef} onClick={() => onDecision(false)}>Close</button>
            </div>
          </>
        ) : (
          <div className="btn-row">
            <button className="primary" onClick={() => onDecision(true)}>Approve</button>
            <button ref={safeButtonRef} onClick={() => onDecision(false)}>Deny</button>
          </div>
        )}
      </div>
    </div>
  );
}
