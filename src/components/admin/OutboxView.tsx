"use client";

import { useState } from "react";
import { api, useApi, type Me } from "@/lib/api";
import { AdminShell, Badge, btn, ErrorNote, statusText, statusTone } from "./ui";

type Msg = {
  id: number;
  local_date: string;
  channel: string;
  status: string;
  subject: string;
  body: string;
  attempts: number;
  provider_ref: string | null;
  last_error: string | null;
  created_at: string;
  learner: string;
};

export function OutboxView() {
  const me = useApi<Me>("/api/me").data;
  const { data, error, reload } = useApi<{ messages: Msg[]; adapters: { channel: string; name: string; configured: boolean }[] }>("/api/admin/outbox");
  const [err, setErr] = useState<string | null>(null);

  const reconcile = async (id: number, outcome: "accepted" | "requeue") => {
    try {
      await api("/api/admin/outbox", { body: { id, outcome } });
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <AdminShell title="Notifications">
      {error && <ErrorNote text={error} />}
      {err && <ErrorNote text={err} />}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.adapters.map((a) => (
              <div key={a.channel} className="rounded-3xl border border-line p-4">
                <p className="flex items-center gap-2 font-semibold">
                  {a.name} <Badge tone={a.configured ? "good" : "warn"}>{a.configured ? "Configured" : "Not configured"}</Badge>
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  {a.channel === "email"
                    ? a.configured
                      ? "Messages go to the configured provider with an idempotency key."
                      : "Set EMAIL_WEBHOOK_URL (and EMAIL_WEBHOOK_TOKEN) on the server to send. Until then, digests are kept here as previews and never marked delivered."
                    : "Prepared adapter. Connect an SMS provider before enabling this channel."}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-ink-muted">
            At most one ordinary learning digest per person per local day. “Provider accepted” isn’t proof that someone received or read a message. Unknown outcomes need
            reconciling before any resend.
          </p>
          {data.messages.length === 0 ? (
            <p className="mt-6 rounded-2xl bg-muted p-4">No messages yet. They’re queued when the worker releases a follow up inside the learner’s delivery window.</p>
          ) : (
            <ul className="mt-6 flex flex-col gap-3">
              {data.messages.map((m) => (
                <li key={m.id} className="rounded-3xl border border-line p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone(m.status)}>{statusText[m.status] ?? m.status}</Badge>
                    <span className="text-sm text-ink-muted">
                      {m.learner} · {m.channel} · local day {m.local_date} · attempts {m.attempts}
                      {m.provider_ref && ` · ref ${m.provider_ref}`}
                    </span>
                  </div>
                  <p className="mt-2 font-semibold">{m.subject}</p>
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer text-accent">Message preview</summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-muted p-3 font-sans">{m.body}</pre>
                  </details>
                  {m.last_error && <p className="mt-1 text-sm text-ink-muted">{m.last_error}</p>}
                  {me?.canAuthor && ["unknown", "failed"].includes(m.status) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className={btn.secondary} onClick={() => reconcile(m.id, "accepted")}>
                        Provider confirms it was accepted
                      </button>
                      <button type="button" className={btn.secondary} onClick={() => reconcile(m.id, "requeue")}>
                        Provider has no record: send again
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </AdminShell>
  );
}
