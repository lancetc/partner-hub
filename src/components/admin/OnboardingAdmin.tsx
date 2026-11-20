"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatBytes, formatDate } from "@/lib/format";
import { SETUP_STATES, type SetupState } from "@/lib/onboarding";
import type { funnel, reviewQueue } from "@/server/onboarding";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";
import { RequirementsTab } from "./OnboardingRequirements";
import { InstrumentsTab } from "./OnboardingInstruments";

/*
  Onboarding, for the people who run it (docs/onboarding.md): what's waiting for a reviewer, where everyone
  is up to and whose move it is, what each role has to do, and the starting-point checks. People & Culture
  see employees; Partner Operations see partners and their organisations; Quality sees what's marked for it.
*/

type Queue = ReturnType<typeof reviewQueue>;
type Progress = ReturnType<typeof funnel>;

const TABS = [
  { id: "queue", label: "Review queue" },
  { id: "progress", label: "Progress" },
  { id: "requirements", label: "Requirements" },
  { id: "instruments", label: "Starting-point checks" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function OnboardingAdmin() {
  const [tab, setTab] = useState<Tab>("queue");
  return (
    <AdminShell title="Onboarding">
      <p className="max-w-3xl text-ink-muted">
        Each person’s setup is a short list of tasks for their role. They’re ready when every required task is <strong>approved</strong>, not just submitted. A
        document waiting here is waiting on a reviewer, and the person is told so.
      </p>
      <div role="tablist" aria-label="Onboarding" className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`onb-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="onb-panel"
            onClick={() => setTab(t.id)}
            className={cx(
              "inline-flex min-h-11 items-center rounded-full border px-4 font-semibold",
              tab === t.id ? "border-action bg-action text-on-action" : "border-line-strong bg-surface hover:bg-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="onb-panel" role="tabpanel" aria-labelledby={`onb-tab-${tab}`} className="mt-5">
        {tab === "queue" && <QueueTab />}
        {tab === "progress" && <ProgressTab />}
        {tab === "requirements" && <RequirementsTab />}
        {tab === "instruments" && <InstrumentsTab />}
      </div>
    </AdminShell>
  );
}

function QueueTab() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, setData } = useApi<Queue>(`/api/admin/onboarding?q=${encodeURIComponent(q)}&page=${page}`);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  const act = async (body: Record<string, unknown>) => {
    setProblem(null);
    try {
      setData(await api<Queue>("/api/admin/onboarding", { body }));
      setOpen(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p>
          <strong>{data.total}</strong> waiting for review{data.total > 0 ? `, the oldest for ${data.oldestDays} day${data.oldestDays === 1 ? "" : "s"}` : ""}.
        </p>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Find a person, organisation or task
          <input
            type="search"
            className={cx(input, "min-h-10")}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {problem && <ErrorNote text={problem} />}
      {data.items.length === 0 ? (
        <p className="rounded-2xl bg-muted px-4 py-3">Nothing is waiting for you.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((i) => (
            <li key={i.rowId} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-serif text-xl font-semibold">
                    {i.who}: {i.task}
                  </h2>
                  <p className="text-sm text-ink-muted">
                    {i.audience}
                    {i.organisation && i.scope === "person" ? ` · ${i.organisation}` : ""} · submitted {i.submittedAt ? formatDate(i.submittedAt) : ""} by{" "}
                    {i.submittedBy} · reference <span className="font-mono">{i.reference}</span>
                  </p>
                </div>
                <span className="flex flex-wrap gap-2">
                  {i.scope === "organisation" && <Badge tone="info">For the whole organisation</Badge>}
                  {i.resubmitted && <Badge tone="info">Resubmitted</Badge>}
                  <Badge tone={i.days >= 3 ? "warn" : "neutral"}>
                    Waiting {i.days} day{i.days === 1 ? "" : "s"}
                  </Badge>
                </span>
              </div>
              {i.document && (
                <p className="mt-2">
                  <a
                    href={`/api/onboarding/documents/${i.document.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent hover:underline"
                  >
                    <Icon name="file" className="size-4" /> {i.document.name}
                  </a>{" "}
                  <span className="text-sm text-ink-muted">{formatBytes(i.document.bytes)} · opening it is logged</span>
                </p>
              )}
              {open === i.rowId ? (
                <form
                  className="mt-3 grid gap-3 rounded-2xl bg-muted p-4 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                    void act({ action: "review", rowId: i.rowId, decision: submitter?.value, reason: f.get("reason"), validUntil: f.get("validUntil") });
                  }}
                >
                  <Field
                    label="Valid until (if the document has an end date)"
                    hint={i.expiryMonths ? `Left empty, it’s due for renewal ${i.expiryMonths} months from today.` : "Left empty, it doesn’t expire."}
                  >
                    <input type="date" name="validUntil" className={input} />
                  </Field>
                  <Field label="If it needs correcting: what, exactly" hint="The person sees this word for word. Don’t include details from the document.">
                    <textarea name="reason" maxLength={400} className={cx(input, "min-h-20 py-2")} />
                  </Field>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <button type="submit" name="decision" value="approve" className={btn.primary}>
                      Approve
                    </button>
                    <button type="submit" name="decision" value="correct" className={btn.secondary}>
                      Ask for a correction
                    </button>
                    <button type="button" className={btn.quiet} onClick={() => setOpen(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button type="button" className={cx(btn.secondary, "mt-3")} onClick={() => setOpen(i.rowId)}>
                  Review
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager page={data.page} pages={data.pages} onPage={setPage} />

      {data.requests.length > 0 && (
        <section aria-labelledby="onb-req" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <h2 id="onb-req" className="font-serif text-xl font-semibold">
            “This isn’t my role or organisation” ({data.requests.length})
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Check with the system that holds the person’s record, fix it there, then answer. Answering here doesn’t change their role.
          </p>
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {data.requests.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3">
                <p>
                  <span className="font-semibold">{r.person}</span>{" "}
                  <span className="text-sm text-ink-muted">
                    {r.role} · {r.organisation} · {formatDate(r.createdAt)}
                  </span>
                </p>
                <p>“{r.message}”</p>
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act({ action: "request", id: r.id, resolution: new FormData(e.currentTarget).get("resolution") });
                  }}
                >
                  <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm font-semibold">
                    What you found and did (they see this)
                    <input name="resolution" required minLength={10} maxLength={400} className={input} />
                  </label>
                  <button type="submit" className={btn.secondary}>
                    Answer
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center gap-3">
      <button type="button" className={btn.secondary} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button type="button" className={btn.secondary} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
}

const STATES = Object.keys(SETUP_STATES) as SetupState[];

function ProgressTab() {
  const [state, setState] = useState("");
  const [audience, setAudience] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, reload } = useApi<Progress>(`/api/admin/onboarding?view=progress&state=${state}&audience=${audience}&page=${page}`);
  const [problem, setProblem] = useState<string | null>(null);
  const [excepting, setExcepting] = useState<string | null>(null);
  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  if (!data.configured)
    return (
      <p className="rounded-2xl bg-muted px-4 py-3">
        No setup requirements have been released yet, so no one has anything to do. Start on the Requirements tab.
      </p>
    );
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-muted">
        Requirements version {data.configVersion}. Each population is counted by itself.{" "}
        {data.medianDaysToActive === null
          ? "No one has been activated yet."
          : `Median time from starting to active: ${data.medianDaysToActive} days (${data.activated} people).`}
      </p>
      <div className="overflow-x-auto rounded-3xl bg-surface p-2 ring-1 ring-line">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="text-ink-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                Population
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                People
              </th>
              {STATES.map((s) => (
                <th key={s} scope="col" className="px-3 py-2 text-right font-semibold">
                  {SETUP_STATES[s]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.byAudience.map((a) => (
              <tr key={a.audience}>
                <th scope="row" className="px-3 py-2 font-semibold">
                  {a.label}
                </th>
                <td className="px-3 py-2 text-right tabular-nums">{a.people}</td>
                {STATES.map((s) => (
                  <td key={s} className="px-3 py-2 text-right tabular-nums">
                    {a.states[s]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Waiting on a reviewer", value: data.waiting.onReviewers, note: "Theirs is submitted. This is the review queue’s to clear." },
          { label: "Waiting on the person", value: data.waiting.onPeople, note: "Started, with something still theirs to do or fix." },
          { label: "Waiting on their organisation", value: data.waiting.onOrganisations, note: "Their own part is done; an organisation task isn’t." },
        ].map((s) => (
          <div key={s.label} className="rounded-3xl bg-surface p-4 ring-1 ring-line">
            <dt className="text-sm font-semibold text-ink-muted">{s.label}</dt>
            <dd className="mt-1 font-serif text-3xl font-semibold">{s.value}</dd>
            <dd className="text-sm text-ink-muted">{s.note}</dd>
          </div>
        ))}
      </dl>
      {data.corrections.length > 0 && (
        <p className="text-sm">
          <span className="font-semibold">Sent back most often:</span> {data.corrections.map((c) => `${c.task} (${c.times})`).join(", ")}
        </p>
      )}

      <section aria-labelledby="onb-people">
        <div className="flex flex-wrap items-end gap-3">
          <h2 id="onb-people" className="mr-auto font-serif text-xl font-semibold">
            People ({data.total})
          </h2>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Population
            <select
              className={cx(input, "min-h-10")}
              value={audience}
              onChange={(e) => {
                setAudience(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All of yours</option>
              {data.byAudience.map((a) => (
                <option key={a.audience} value={a.audience}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Where they’re up to
            <select
              className={cx(input, "min-h-10")}
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Any</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {SETUP_STATES[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {problem && <ErrorNote text={problem} />}
        <ul className="mt-3 flex flex-col divide-y divide-line rounded-3xl bg-surface px-5 ring-1 ring-line">
          {data.people.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-semibold">{p.name}</span>
                  {p.waitingFor && <span className="text-sm text-ink-muted"> · waiting for: {p.waitingFor}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {p.override && <Badge tone="warn">Exception in place</Badge>}
                  <Badge tone={p.state === "active" || p.state === "ready" ? "good" : p.state === "needs_action" || p.state === "renewal" ? "warn" : "neutral"}>
                    {SETUP_STATES[p.state]}
                  </Badge>
                  {p.state !== "active" && p.state !== "ready" && excepting !== p.id && (
                    <button type="button" className={btn.quiet} onClick={() => setExcepting(p.id)}>
                      Make an exception
                    </button>
                  )}
                </span>
              </div>
              {excepting === p.id && (
                <form
                  className="grid gap-3 rounded-2xl bg-muted p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto]"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setProblem(null);
                    try {
                      await api("/api/admin/onboarding", { body: { action: "override", userId: p.id, ...Object.fromEntries(new FormData(e.currentTarget)) } });
                      setExcepting(null);
                      reload();
                    } catch (err) {
                      setProblem(err instanceof Error ? err.message : "That didn’t save.");
                    }
                  }}
                >
                  <Field label={`Why ${p.name} can start before everything is approved`} hint="Kept on record with your name.">
                    <input name="reason" required minLength={10} maxLength={400} className={input} />
                  </Field>
                  <Field label="Until">
                    <input type="date" name="expiresOn" required className={input} />
                  </Field>
                  <div className="flex items-end gap-2">
                    <button type="submit" className={btn.primary}>
                      Allow
                    </button>
                    <button type="button" className={btn.quiet} onClick={() => setExcepting(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
          {data.people.length === 0 && <li className="py-3 text-ink-muted">No one matches.</li>}
        </ul>
        <div className="mt-3">
          <Pager page={data.page} pages={data.pages} onPage={setPage} />
        </div>
      </section>
    </div>
  );
}
