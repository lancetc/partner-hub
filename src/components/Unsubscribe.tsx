"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "./Icon";

export function Unsubscribe({ token }: { token: string }) {
  const [state, setState] = useState<"ask" | "off" | "on">("ask");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function set(subscribe: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/unsubscribe", { body: { token, subscribe } });
      setState(subscribe ? "on" : "off");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-3xl border border-line bg-surface p-6">
      <h1 className="font-serif text-3xl font-semibold">Newsletter emails</h1>
      {!token ? (
        <p className="mt-3 text-ink-muted">This link is missing its code. Use the unsubscribe link at the bottom of a newsletter.</p>
      ) : state === "off" ? (
        <>
          <p className="mt-3 flex items-start gap-2">
            <Icon name="check" className="mt-1 size-5 text-accent" /> You won’t get the monthly update or the quarterly newsletter any more.
          </p>
          <p className="mt-2 text-sm text-ink-muted">You’ll still get emails about your own learning, like follow ups that are ready.</p>
          <button type="button" className="mt-4 min-h-11 font-semibold text-accent" disabled={busy} onClick={() => set(true)}>
            Changed your mind? Subscribe again
          </button>
        </>
      ) : state === "on" ? (
        <p className="mt-3 flex items-start gap-2">
          <Icon name="check" className="mt-1 size-5 text-accent" /> You’re subscribed to newsletters again.
        </p>
      ) : (
        <>
          <p className="mt-3">Stop getting the Partner Hub monthly update and quarterly newsletter?</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => set(false)}
            className="mt-4 inline-flex min-h-12 items-center justify-center rounded-full bg-action px-6 font-semibold text-on-action hover:bg-action-hover disabled:opacity-50"
          >
            {busy ? "Saving…" : "Unsubscribe"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Link href="/" className="mt-6 block text-sm text-ink-muted underline-offset-4 hover:underline">
        Go to the Partner Hub
      </Link>
    </div>
  );
}
