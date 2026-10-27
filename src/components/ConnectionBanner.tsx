"use client";

import { dismissRejected, flush, useOutbox } from "@/lib/outbox";
import { Icon } from "./Icon";

/* Says when the device is offline, when saves are waiting to sync, and if the server turned any down. */
export function ConnectionBanner() {
  const { offline, pending, syncing, rejected } = useOutbox();
  const n = pending.length;
  if (!offline && !n && !rejected.length) return null;
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 pt-3 sm:px-6" role="status">
      {(offline || n > 0) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-gold/15 px-4 py-2.5 text-sm ring-1 ring-gold/60">
          <Icon name={offline ? "alert" : "refresh"} className={offline || !syncing ? "size-4 shrink-0" : "size-4 shrink-0 animate-spin"} />
          <span className="min-w-0 flex-1">
            {offline ? (
              <>
                <strong>You’re offline.</strong> Downloaded lessons still work, and what you do is saved on this device
                {n ? `: ${n} ${n === 1 ? "save is" : "saves are"} waiting to sync.` : "."}
              </>
            ) : (
              <>
                {syncing ? "Syncing" : "Waiting to sync"} {n} {n === 1 ? "save" : "saves"} made while you were offline…
              </>
            )}
          </span>
          {n > 0 && !syncing && (
            <button type="button" onClick={() => void flush()} className="font-semibold underline-offset-4 hover:underline">
              Try now
            </button>
          )}
        </p>
      )}
      {rejected.length > 0 && (
        <p className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-2xl bg-danger/10 px-4 py-2.5 text-sm ring-1 ring-danger/40" role="alert">
          <span className="min-w-0 flex-1">
            {rejected.length === 1
              ? "A save from while you were offline couldn’t be recorded:"
              : "Some saves from while you were offline couldn’t be recorded:"}{" "}
            {rejected.map((r) => `${r.label} (${r.error})`).join("; ")}
          </span>
          <button type="button" onClick={dismissRejected} className="font-semibold underline-offset-4 hover:underline">
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}
