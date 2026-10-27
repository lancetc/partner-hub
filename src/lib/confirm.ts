"use client";

import { useSyncExternalStore } from "react";

/*
  "Are you sure?" questions, shown in the page by <ConfirmHost /> (in the root layout). Used instead
  of the browser's own confirm pop-up, which some browsers and embedded views never show, silently
  answering "Cancel".
*/

export type ConfirmOptions = {
  title?: string;
  /** The button that goes ahead, e.g. "Delete". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the go-ahead button as destructive. */
  danger?: boolean;
};
export type ConfirmRequest = { message: string; opts: ConfirmOptions; resolve: (ok: boolean) => void };

let current: ConfirmRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Asks the question in the page; resolves true if they go ahead. */
export function confirmAction(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  // One question at a time: a new one cancels any still open.
  current?.resolve(false);
  return new Promise((resolve) => {
    current = {
      message,
      opts,
      resolve: (ok) => {
        current = null;
        emit();
        resolve(ok);
      },
    };
    emit();
  });
}

export function useConfirmRequest() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
}
