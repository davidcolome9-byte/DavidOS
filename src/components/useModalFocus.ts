import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * OL-015 shared modal focus management. One hook per dialog gives every
 * modal the same keyboard contract:
 *  - focus moves into the dialog on open (initialFocusRef, else the card);
 *  - Tab / Shift+Tab wrap inside the dialog and never reach the background;
 *  - Escape stops propagating and invokes the caller's SAFE action only —
 *    a modal's Escape handler must never approve, commit, or delete;
 *  - body scrolling is locked while any modal is open (counted, so stacked
 *    dialogs don't unlock early);
 *  - on close, focus returns to the element that opened the dialog while it
 *    is still connected (restoreFocus controls this).
 *
 * The caller attaches the returned ref to the dialog CARD (not the overlay)
 * and gives that element tabIndex={-1} so it can take programmatic focus.
 */

/** Centralized focusable-control selector; disabled controls are skipped. */
export const MODAL_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface UseModalFocusOptions {
  open: boolean;
  /** The dialog's safe close action (Cancel / Dismiss / Deny). */
  onEscape: () => void;
  /** Focused on open; defaults to the dialog card itself. */
  initialFocusRef?: RefObject<HTMLElement>;
  /** Return focus to the opener on close (default true). */
  restoreFocus?: boolean;
}

// Module-level count of open modals: body scrolling is restored only when
// the LAST open modal closes, so stacked dialogs never unlock it early.
let openModalCount = 0;
let bodyOverflowBeforeLock = '';

function lockBodyScroll() {
  if (openModalCount === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openModalCount += 1;
}

function unlockBodyScroll() {
  openModalCount -= 1;
  if (openModalCount === 0) {
    document.body.style.overflow = bodyOverflowBeforeLock;
  }
}

export function useModalFocus<T extends HTMLElement>(
  options: UseModalFocusOptions,
): RefObject<T> {
  const { open, onEscape, initialFocusRef, restoreFocus = true } = options;
  const dialogRef = useRef<T>(null);
  // Latest-callback ref: the keydown listener stays attached across renders
  // even when the caller passes a new onEscape closure each render.
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockBodyScroll();
    (initialFocusRef?.current ?? dialog).focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Safe action ONLY — never a destructive default.
        e.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const focusables = [...dialog.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR)];
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      unlockBodyScroll();
      if (restoreFocus && opener && opener.isConnected) opener.focus();
    };
  }, [open, initialFocusRef, restoreFocus]);

  return dialogRef;
}
