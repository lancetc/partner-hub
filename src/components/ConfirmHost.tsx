"use client";

import { useEffect, useRef } from "react";
import { useConfirmRequest } from "@/lib/confirm";
import { cx } from "@/lib/format";

/* The in-page "Are you sure?" box for confirmAction() (lib/confirm.ts). Escape or Cancel says no. */
export function ConfirmHost() {
  const req = useConfirmRequest();
  const dialog = useRef<HTMLDialogElement>(null);
  const goAhead = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (req && !d.open) {
      d.showModal();
      goAhead.current?.focus();
    }
    if (!req && d.open) d.close();
  }, [req]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      // Escape closes the dialog: treat it as Cancel.
      onCancel={(e) => {
        e.preventDefault();
        req?.resolve(false);
      }}
      onClick={(e) => e.target === dialog.current && req?.resolve(false)}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-3xl bg-surface p-0 text-ink shadow-2xl backdrop:bg-[rgb(10_26_46/0.55)]"
    >
      {req && (
        <div className="flex flex-col gap-3 p-5">
          <h2 id="confirm-title" className="font-serif text-xl font-semibold">
            {req.opts.title ?? "Are you sure?"}
          </h2>
          <p id="confirm-message" className="whitespace-pre-line text-[0.98rem] text-ink-muted">
            {req.message}
          </p>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => req.resolve(false)}
              className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 font-medium hover:bg-muted"
            >
              {req.opts.cancelLabel ?? "Cancel"}
            </button>
            <button
              ref={goAhead}
              type="button"
              onClick={() => req.resolve(true)}
              className={cx(
                "inline-flex min-h-11 items-center rounded-full px-5 font-semibold",
                req.opts.danger ? "bg-danger text-white hover:bg-danger/90" : "bg-action text-on-action hover:bg-action-hover",
              )}
            >
              {req.opts.confirmLabel ?? "OK"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
