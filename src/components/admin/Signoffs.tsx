"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { AdminShell, Badge, btn, ErrorNote } from "./ui";
import { Icon } from "../Icon";

/* Manager sign-off: confirm that someone who finished a spaced lesson is applying it at work. */

type Result = { stage: string; title: string; completedAt: string | null; firstTry: boolean | null; extraPractice: boolean };
type Item = {
  enrolmentId: number;
  learner: { id: string; name: string; role: string; org: string };
  manager: string | null;
  lesson: { slug: string; title: string; outcome: string; action: string };
  finishedAt: string | null;
  results: Result[];
};
type Decided = Item & { outcome: "confirmed" | "support"; note: string; decidedBy: string; decidedAt: string };

export function Signoffs() {
  const { data, error, reload } = useApi<{ waiting: Item[]; history: Decided[] }>("/api/admin/signoffs");
  return (
    <AdminShell title="Sign-offs">
      <p className="max-w-3xl text-ink-muted">
        When someone finishes a lesson’s spaced follow ups, their manager confirms they’re putting it into practice at work, or says what support would help. Switch
        sign-off on for a lesson on the{" "}
        <Link href="/admin/lessons" className="font-medium text-accent underline-offset-4 hover:underline">
          Lessons
        </Link>{" "}
        page.
      </p>
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}
      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : (
        <>
          <section aria-labelledby="waiting" className="mt-6">
            <h2 id="waiting" className="mb-3 font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
              Waiting for you {data.waiting.length > 0 && <span className="text-accent">· {data.waiting.length}</span>}
            </h2>
            {!data.waiting.length ? (
              <p className="rounded-3xl border border-dashed border-line-strong p-6 text-center text-ink-muted">Nobody is waiting for sign-off.</p>
            ) : (
              <ul className="grid gap-4 xl:grid-cols-2">
                {data.waiting.map((item) => (
                  <SignoffCard key={item.enrolmentId} item={item} onDone={reload} />
                ))}
              </ul>
            )}
          </section>

          {data.history.length > 0 && (
            <section aria-labelledby="history" className="mt-10">
              <h2 id="history" className="mb-3 font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
                Signed off
              </h2>
              <ul className="flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface">
                {data.history.map((h) => (
                  <li key={h.enrolmentId} className="flex flex-wrap items-start gap-3 p-4">
                    <span className={cx("mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full", h.outcome === "confirmed" ? "bg-action text-on-action" : "bg-gold/30")}>
                      <Icon name={h.outcome === "confirmed" ? "check" : "chat"} className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {h.learner.name} · {h.lesson.title}
                      </p>
                      <p className="text-sm text-ink-muted">
                        {h.outcome === "confirmed" ? "Applying it at work" : "Needs support"} · {h.decidedBy}, {formatDate(h.decidedAt)}
                      </p>
                      {h.note && <p className="mt-1 text-[0.95rem]">“{h.note}”</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </AdminShell>
  );
}

function SignoffCard({ item, onDone }: { item: Item; onDone: () => void }) {
  const [mode, setMode] = useState<null | "confirmed" | "support">(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const struggled = item.results.some((r) => r.firstTry === false);

  async function send(outcome: "confirmed" | "support") {
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/signoffs", { body: { enrolmentId: item.enrolmentId, outcome, note } });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-serif text-xl font-semibold">{item.learner.name}</h3>
          <p className="text-sm text-ink-muted">
            {item.learner.org} · {item.learner.role}
          </p>
        </div>
        {item.finishedAt && <Badge tone="info">Finished {formatDate(item.finishedAt)}</Badge>}
      </div>

      <div>
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{item.lesson.title}</p>
        <ol className="mt-2 flex flex-col gap-1.5">
          {item.results.map((r) => (
            <li key={r.stage} className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2 text-sm">
              <span
                className={cx(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-full",
                  r.firstTry === false ? "bg-gold/40 text-ink" : "bg-action text-on-action",
                )}
                aria-hidden
              >
                <Icon name={r.firstTry === false ? "refresh" : "check"} className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{r.stage}</span>
                {r.extraPractice && <span className="text-ink-muted"> · given extra practice</span>}
              </span>
              <span className="shrink-0 text-ink-muted">{r.firstTry === null ? "Done" : r.firstTry ? "Right first time" : "Needed a second go"}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-2xl border-2 border-dashed border-line-strong p-3 text-[0.95rem]">
        <p className="font-semibold">What to look for at work</p>
        <p className="mt-1">{item.lesson.action || item.lesson.outcome}</p>
        {struggled && <p className="mt-2 text-sm text-ink-muted">They needed a second go on at least one follow up, so it’s worth a quick chat about this.</p>}
      </div>

      {mode ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">{mode === "confirmed" ? "Anything to add? (optional)" : "What support would help?"}</span>
            <textarea
              rows={3}
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[0.98rem]"
              placeholder={mode === "confirmed" ? "For example: saw them check with the coordinator before staying longer." : "For example: go through the change process together on the next visit."}
            />
          </label>
          {error && <ErrorNote text={error} />}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.primary} disabled={busy || (mode === "support" && !note.trim())} onClick={() => send(mode)}>
              {busy ? "Saving…" : mode === "confirmed" ? "Sign off" : "Send"}
            </button>
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => setMode(null)}>
              Back
            </button>
          </div>
          <p className="text-xs text-ink-muted">{item.learner.name} sees this on the lesson’s tile.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn.primary} onClick={() => setMode("confirmed")}>
            <Icon name="check" className="size-4" /> Applying it at work
          </button>
          <button type="button" className={btn.secondary} onClick={() => setMode("support")}>
            Needs more support
          </button>
        </div>
      )}
    </li>
  );
}
