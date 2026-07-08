import type { RiskLevel } from '../types';

/**
 * The DavidOS safety model:
 *  - read_only / draft_only          → proceed freely
 *  - local_write                     → proceed, but the UI must show a clear notice
 *  - external_write                  → explicit approval required
 *  - sensitive_external_write        → explicit approval + review required
 *  - high_risk                       → blocked in v1 (financial/medical/legal)
 */
export function requiresApproval(risk: RiskLevel): boolean {
  return risk === 'external_write' || risk === 'sensitive_external_write' || risk === 'high_risk';
}

export function isBlockedInV1(risk: RiskLevel): boolean {
  return risk === 'high_risk';
}

export function requiresLocalNotice(risk: RiskLevel): boolean {
  return risk === 'local_write';
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  read_only: 'Read-only',
  draft_only: 'Draft only',
  local_write: 'Local only',
  external_write: 'Approval required',
  sensitive_external_write: 'Approval + review required',
  high_risk: 'High risk — blocked in v1',
};

/** CSS class suffix for risk badges. */
export const RISK_TONE: Record<RiskLevel, string> = {
  read_only: 'ok',
  draft_only: 'ok',
  local_write: 'info',
  external_write: 'warn',
  sensitive_external_write: 'warn',
  high_risk: 'danger',
};
