// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import ApprovalGate from '../ApprovalGate';
import type { ApprovalRequest } from '../ApprovalGate';

// OL-015 — the ApprovalGate must be keyboard-safe: the safe control takes
// initial focus, Escape always DENIES, Tab stays trapped, and no keyboard
// path can ever approve.

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const EXTERNAL_REQUEST: ApprovalRequest = {
  title: 'Send test payload',
  description: 'Writes a file to an external service.',
  risk: 'external_write',
};

const BLOCKED_REQUEST: ApprovalRequest = {
  title: 'Pay an invoice',
  description: 'A financial action.',
  risk: 'high_risk',
};

let container: HTMLElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
});

async function mountGate(request: ApprovalRequest | null, onDecision: (approved: boolean) => void) {
  root = createRoot(container);
  await act(async () => {
    root!.render(<ApprovalGate request={request} onDecision={onDecision} />);
  });
}

const dialog = () => container.querySelector<HTMLElement>('[role="alertdialog"]');

function button(label: string): HTMLButtonElement {
  const b = [...dialog()!.querySelectorAll('button')].find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error(`button "${label}" not found`);
  return b as HTMLButtonElement;
}

async function pressKey(target: Element, key: string, shiftKey = false) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
    );
  });
}

describe('ApprovalGate accessibility and keyboard safety (OL-015)', () => {
  it('renders an alertdialog with an accessible title and description', async () => {
    await mountGate(EXTERNAL_REQUEST, () => {});
    const d = dialog();
    expect(d).not.toBeNull();
    expect(d!.getAttribute('aria-modal')).toBe('true');
    const title = container.querySelector(`#${d!.getAttribute('aria-labelledby')}`);
    const desc = container.querySelector(`#${d!.getAttribute('aria-describedby')}`);
    expect(title?.textContent).toContain('Approval required');
    expect(desc?.textContent).toContain('external service');
  });

  it('initial focus is on Deny for an approvable request', async () => {
    await mountGate(EXTERNAL_REQUEST, () => {});
    expect(document.activeElement).toBe(button('Deny'));
  });

  it('initial focus is on Close for a blocked request (no Approve rendered)', async () => {
    await mountGate(BLOCKED_REQUEST, () => {});
    expect(document.activeElement).toBe(button('Close'));
    expect([...dialog()!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Close']);
  });

  it('Escape calls onDecision(false)', async () => {
    const onDecision = vi.fn();
    await mountGate(EXTERNAL_REQUEST, onDecision);
    await pressKey(document.activeElement!, 'Escape');
    expect(onDecision).toHaveBeenCalledTimes(1);
    expect(onDecision).toHaveBeenCalledWith(false);
  });

  it('no key path approves: keys pressed on the safe control never yield onDecision(true)', async () => {
    const onDecision = vi.fn();
    await mountGate(EXTERNAL_REQUEST, onDecision);
    for (const key of ['Enter', ' ', 'Escape', 'Tab', 'a']) {
      await pressKey(document.activeElement!, key);
    }
    expect(onDecision).not.toHaveBeenCalledWith(true);
  });

  it('Tab is trapped: forward wraps last→first, Shift+Tab wraps first→last', async () => {
    await mountGate(EXTERNAL_REQUEST, () => {});
    const approve = button('Approve');
    const deny = button('Deny');

    // Deny is the last focusable — Tab wraps to Approve (first).
    await act(async () => deny.focus());
    await pressKey(deny, 'Tab');
    expect(document.activeElement).toBe(approve);

    // Shift+Tab from the first wraps back to the last.
    await pressKey(approve, 'Tab', true);
    expect(document.activeElement).toBe(deny);

    // Shift+Tab from the container itself stays inside.
    await act(async () => dialog()!.focus());
    await pressKey(dialog()!, 'Tab', true);
    expect(document.activeElement).toBe(deny);
  });
});
