import type { RiskLevel } from '../lib/types';
import { isBlockedInV1 } from '../lib/safety/approvalRules';
import RiskBadge from './RiskBadge';

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
 */
export default function ApprovalGate({ request, onDecision }: Props) {
  if (!request) return null;
  const blocked = isBlockedInV1(request.risk);
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>⚠️ Approval required</h2>
        <p><strong>{request.title}</strong></p>
        <p className="muted">{request.description}</p>
        <p><RiskBadge risk={request.risk} /></p>
        {blocked ? (
          <>
            <p className="muted">
              Financial, medical, and legal actions are blocked in v1 and cannot be approved here.
            </p>
            <div className="btn-row">
              <button onClick={() => onDecision(false)}>Close</button>
            </div>
          </>
        ) : (
          <div className="btn-row">
            <button className="primary" onClick={() => onDecision(true)}>Approve</button>
            <button onClick={() => onDecision(false)}>Deny</button>
          </div>
        )}
      </div>
    </div>
  );
}
