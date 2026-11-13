"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi, type Me } from "@/lib/api";
import { lessons } from "@/content/lessons";
import { AdminShell, Badge, btn, ErrorNote, statusText, statusTone } from "./ui";
import { Icon } from "../Icon";

type PathRow = {
  id: string;
  name: string;
  audience: string[];
  trigger: { type: string; lessonSlug?: string; lessonVersion?: string };
  mode: "scheduled" | "after_completion";
  steps: number;
  liveVersion: number | null;
  paused: boolean;
  draftVersion: number | null;
  draftStatus: string | null;
  totals: {
    enrolments: number;
    active: number;
    paused: number;
    completed: number;
    availableNow: number;
    waitingOnPrevious: number;
    notificationFailures: number;
  };
};

type WorkerState = {
  clock: string;
  offsetDays: number;
  background: { running: boolean; intervalMinutes: number; lastRun: string | null; lastError: string | null };
  runs: { id: number; started_at: string; clock: string; released: number; digests: number; dispatched: number; note: string }[];
};

export function AdminHome() {
  const me = useApi<Me>("/api/me").data;
  const paths = useApi<{ paths: PathRow[] }>("/api/admin/paths");
  const worker = useApi<WorkerState>("/api/admin/worker");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);

  async function workerAction(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ released: number; digests: number; dispatched: number; outcomes: Record<string, number> }>("/api/admin/worker", { body });
      setLastRun(
        `Worker ran: ${r.released} released, ${r.digests} digest${r.digests === 1 ? "" : "s"} queued, ${r.dispatched} dispatched${
          Object.keys(r.outcomes).length
            ? ` (${Object.entries(r.outcomes)
                .map(([k, v]) => `${v} ${statusText[k] ?? k}`)
                .join(", ")})`
            : ""
        }.`,
      );
      worker.reload();
      paths.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (paths.error) {
    return (
      <AdminShell title="Spaced schedules">
        <ErrorNote text={paths.error} />
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Spaced schedules">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Spaced schedules" className="flex flex-col gap-4">
          <p className="max-w-3xl text-ink-muted">
            The schedules behind spaced learning. Each one is switched on from a topic’s Spaced learning checkbox on the{" "}
            <Link href="/admin/lessons" className="font-medium text-accent underline-offset-4 hover:underline">
              Topics
            </Link>{" "}
            page and runs automatically after someone finishes that topic. Learners never pick these. To group topics for a person, use My Training.
          </p>
          {error && <ErrorNote text={error} />}
          {!paths.data ? (
            <p className="text-ink-muted">Loading…</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {paths.data.paths.map((p) => (
                <li key={p.id} className="relative rounded-3xl border border-line bg-surface p-5 hover:border-line-strong">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.liveVersion ? <Badge tone="good">Published v{p.liveVersion}</Badge> : <Badge>Not published</Badge>}
                    {p.paused && <Badge tone="warn">Paused</Badge>}
                    {p.draftVersion && (
                      <Badge tone={statusTone(p.draftStatus!)}>
                        {statusText[p.draftStatus!]} v{p.draftVersion}
                      </Badge>
                    )}
                  </div>
                  <h2 className="mt-2 font-serif text-xl font-semibold">
                    <Link href={`/admin/schedules/${p.id}`} className="after:absolute after:inset-0 after:content-['']">
                      {p.name}
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    {p.steps} activities · {p.mode === "scheduled" ? "Scheduled" : "After completion"} · {p.audience.join(", ")} ·{" "}
                    {p.trigger.type === "lesson_completion"
                      ? `starts when “${lessons.find((l) => l.slug === p.trigger.lessonSlug)?.title}” is completed`
                      : "manual assignment"}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                    {[
                      ["Active enrolments", p.totals.active],
                      ["Available now", p.totals.availableNow],
                      ["Waiting on previous", p.totals.waitingOnPrevious],
                      ["Completed paths", p.totals.completed],
                      ["Paused", p.totals.paused],
                      ["Notification failures", p.totals.notificationFailures],
                    ].map(([k, v]) => (
                      <div key={k as string}>
                        <dt className="text-ink-muted">{k}</dt>
                        <dd className="font-semibold">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-3xl border border-line p-5">
            <h2 className="font-semibold">Background worker</h2>
            {worker.data && (
              <>
                <p className="mt-1 text-sm text-ink-muted">
                  {worker.data.background.running
                    ? `Runs every ${worker.data.background.intervalMinutes} minutes while the server is up.${worker.data.background.lastRun ? ` Last run ${new Date(worker.data.background.lastRun).toLocaleTimeString("en-AU")}.` : ""}`
                    : "Not running in this server process. Use Run now, or restart the dev server."}
                </p>
                {worker.data.background.lastError && <ErrorNote text={worker.data.background.lastError} />}
              </>
            )}
            {me?.canAuthor && (
              <button type="button" disabled={busy} className={btn.secondary + " mt-3 w-full"} onClick={() => workerAction({ action: "run" })}>
                <Icon name="refresh" className="size-4" /> Run worker now
              </button>
            )}
            {lastRun && (
              <p role="status" className="mt-2 text-sm">
                {lastRun}
              </p>
            )}
          </div>

          <div className="rounded-3xl border-2 border-dashed border-line-strong p-5">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-warm">Prototype control</p>
            <h2 className="mt-1 font-semibold">Demo clock</h2>
            {worker.data && (
              <p className="mt-1 text-sm">
                {new Intl.DateTimeFormat("en-AU", { dateStyle: "full", timeStyle: "short", timeZone: "Australia/Brisbane" }).format(
                  new Date(worker.data.clock),
                )}{" "}
                (Brisbane)
                {worker.data.offsetDays ? ` · ${Math.round(worker.data.offsetDays * 10) / 10} days ahead` : " · real time"}
              </p>
            )}
            <p className="mt-1 text-xs text-ink-muted">
              Moves the server clock forward so a 30 day path can be walked through, then runs the worker. Not part of a production build.
            </p>
            {me?.canAuthor && (
              <div className="mt-3 flex flex-wrap gap-2">
                {[1, 2, 7].map((d) => (
                  <button key={d} type="button" disabled={busy} className={btn.secondary} onClick={() => workerAction({ action: "advance", days: d })}>
                    +{d} day{d === 1 ? "" : "s"}
                  </button>
                ))}
                <button type="button" disabled={busy} className={btn.quiet} onClick={() => workerAction({ action: "reset" })}>
                  Reset
                </button>
              </div>
            )}
          </div>

          {worker.data && worker.data.runs.length > 0 && (
            <div className="rounded-3xl border border-line p-5 text-sm">
              <h2 className="font-semibold">Recent runs</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {worker.data.runs.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className="text-ink-muted">
                      {new Intl.DateTimeFormat("en-AU", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: "Australia/Brisbane",
                      }).format(new Date(r.clock))}
                    </span>
                    <span>
                      {r.released} released · {r.digests} digests · {r.dispatched} sent
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </AdminShell>
  );
}
