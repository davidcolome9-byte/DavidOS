import type { RiskLevel } from '../lib/types';
import { RISK_LABELS, RISK_TONE } from '../lib/safety/approvalRules';

export default function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <span className={`badge ${RISK_TONE[risk]}`}>{RISK_LABELS[risk]}</span>;
}
