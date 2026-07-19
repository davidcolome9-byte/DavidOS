// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { useModalFocus } from '../useModalFocus';

// OL-015 shared modal focus management — the one contract every migrated
// dialog relies on: focus moves in, Tab wraps, Escape is the safe action
// only, focus returns to a surviving opener, and body scroll stays locked
// until the LAST open modal closes.

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

interface DialogProps {
  open: boolean;
  onEscape: () => void;
  useInitial?: boolean;
  restoreFocus?: boolean;
  testId?: string;
}

/** Minimal dialog: enabled controls first/initial/last, two disabled traps. */
function TestDialog({ open, onEscape, useInitial, restoreFocus, testId = 'dialog' }: DialogProps) {
  const initialRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalFocus<HTMLDivElement>({
    open,
    onEscape,
    initialFocusRef: useInitial ? initialRef : undefined,
    restoreFocus,
  });
  if (!open) return null;
  return (
    <div ref={dialogRef} tabIndex={-1} data-testid={testId}>
      <button data-testid="first">First</button>
      <button data-testid="mid-disabled" disabled>Mid disabled</button>
      <button data-testid="initial" ref={initialRef}>Initial</button>
      <button data-testid="last">Last</button>
      <button data-testid="end-disabled" disabled>End disabled</button>
    </div>
  );
}

function Harness(props: { useInitial?: boolean; restoreFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  const [openerGone, setOpenerGone] = useState(false);
  return (
    <div>
      {!openerGone && (
        <button data-testid="opener" onClick={() => setOpen(true)}>Open</button>
      )}
      <button data-testid="remove-opener" onClick={() => setOpenerGone(true)}>Remove opener</button>
      <button data-testid="close" onClick={() => setOpen(false)}>Close</button>
      <TestDialog
        open={open}
        onEscape={() => setOpen(false)}
        useInitial={props.useInitial}
        restoreFocus={props.restoreFocus}
      />
    </div>
  );
}

/** Two independent hook instances open at once (stacked dialogs). */
function TwoModalHarness() {
  const [openA, setOpenA] = useState(true);
  const [openB, setOpenB] = useState(true);
  return (
    <div>
      <button data-testid="close-a" onClick={() => setOpenA(false)}>Close A</button>
      <button data-testid="close-b" onClick={() => setOpenB(false)}>Close B</button>
      <TestDialog open={openA} onEscape={() => setOpenA(false)} testId="dialog-a" />
      <TestDialog open={openB} onEscape={() => setOpenB(false)} testId="dialog-b" />
    </div>
  );
}

let container: HTMLElement;
let root: Root | null = null;

beforeEach(() => {
  document.body.style.overflow = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
});

async function mount(ui: React.ReactElement) {
  root = createRoot(container);
  await act(async () => {
    root!.render(ui);
  });
}

const byTestId = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  container.querySelector<T>(`[data-testid="${id}"]`);

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function focusEl(el: HTMLElement) {
  await act(async () => el.focus());
}

async function pressKey(target: Element, key: string, shiftKey = false) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
    );
  });
}

/** Open the harness dialog with the opener button focused (like a real click). */
async function openDialog() {
  const opener = byTestId('opener')!;
  await focusEl(opener);
  await click(opener);
  const dialog = byTestId('dialog');
  expect(dialog).not.toBeNull();
  return dialog!;
}

describe('initial focus', () => {
  it('falls back to the dialog container when no initialFocusRef is given', async () => {
    await mount(<Harness />);
    const dialog = await openDialog();
    expect(document.activeElement).toBe(dialog);
  });

  it('focuses initialFocusRef.current when supplied', async () => {
    await mount(<Harness useInitial />);
    await openDialog();
    expect(document.activeElement).toBe(byTestId('initial'));
  });
});

describe('Tab wrapping (disabled controls skipped)', () => {
  it('Tab on the last enabled control wraps to the first, skipping a trailing disabled one', async () => {
    await mount(<Harness />);
    await openDialog();
    const last = byTestId('last')!;
    await focusEl(last);
    await pressKey(last, 'Tab');
    expect(document.activeElement).toBe(byTestId('first'));
  });

  it('Shift+Tab on the first control wraps to the last enabled control', async () => {
    await mount(<Harness />);
    await openDialog();
    const first = byTestId('first')!;
    await focusEl(first);
    await pressKey(first, 'Tab', true);
    expect(document.activeElement).toBe(byTestId('last'));
  });

  it('Shift+Tab while the container itself is focused wraps to the last enabled control', async () => {
    await mount(<Harness />);
    const dialog = await openDialog();
    expect(document.activeElement).toBe(dialog);
    await pressKey(dialog, 'Tab', true);
    expect(document.activeElement).toBe(byTestId('last'));
  });
});

describe('Escape', () => {
  it('invokes onEscape (the safe action)', async () => {
    await mount(<Harness />);
    const dialog = await openDialog();
    await pressKey(dialog, 'Escape');
    expect(byTestId('dialog')).toBeNull();
  });

  it('does not propagate outside the dialog', async () => {
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    try {
      await mount(<Harness />);
      const dialog = await openDialog();
      await pressKey(dialog, 'Escape');
      expect(outside).not.toHaveBeenCalled();
      // A key pressed outside the (now closed) dialog still bubbles normally.
      await pressKey(byTestId('opener')!, 'a');
      expect(outside).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', outside);
    }
  });
});

describe('focus restoration', () => {
  it('returns focus to the opener on close', async () => {
    await mount(<Harness />);
    const dialog = await openDialog();
    await pressKey(dialog, 'Escape');
    expect(document.activeElement).toBe(byTestId('opener'));
  });

  it('restoreFocus: false leaves focus alone', async () => {
    await mount(<Harness restoreFocus={false} />);
    const dialog = await openDialog();
    await pressKey(dialog, 'Escape');
    expect(document.activeElement).not.toBe(byTestId('opener'));
  });

  it('a disconnected opener is not focused and causes no error', async () => {
    await mount(<Harness />);
    const dialog = await openDialog();
    const opener = byTestId('opener')!;
    await click(byTestId('remove-opener')!);
    expect(opener.isConnected).toBe(false);
    await pressKey(dialog, 'Escape');
    expect(byTestId('dialog')).toBeNull();
    expect(document.activeElement).not.toBe(opener);
  });
});

describe('body scroll lock', () => {
  it('locks body scroll while open and restores the previous value on close', async () => {
    document.body.style.overflow = 'auto';
    await mount(<Harness />);
    expect(document.body.style.overflow).toBe('auto');
    await openDialog();
    expect(document.body.style.overflow).toBe('hidden');
    await click(byTestId('close')!);
    expect(document.body.style.overflow).toBe('auto');
  });

  it('two simultaneous modals keep the lock until the LAST one closes', async () => {
    await mount(<TwoModalHarness />);
    expect(document.body.style.overflow).toBe('hidden');
    await click(byTestId('close-a')!);
    expect(byTestId('dialog-a')).toBeNull();
    expect(byTestId('dialog-b')).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    await click(byTestId('close-b')!);
    expect(document.body.style.overflow).toBe('');
  });

  it('locks again on unmount-free reopen and unlocks on unmount', async () => {
    await mount(<Harness />);
    await openDialog();
    expect(document.body.style.overflow).toBe('hidden');
    await act(async () => root!.unmount());
    root = null;
    expect(document.body.style.overflow).toBe('');
  });
});
