"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { NO_CLIENT_DETAILS, NO_EVIDENCE, OBSERVATION_DECISIONS, STAGE_LABELS } from "@/lib/capability";
import type { teamCapabilities } from "@/server/capability";
import { Icon } from "../Icon";
import { Chip, dbtn, dinput, Problem } from "../discovery/parts";
import { CompetencyCard, stageStatus } from "./ProfileCards";

/*
  A manager's page (docs/capability-intelligence.md): the people who report to them, what's waiting to be
  observed, and what they've signed. An observation is the only thing that ever shows "Verified at work",
  so it's recorded against the competency's behaviours, with a dated reason, and can be withdrawn.
*/

type Data = ReturnType<typeof teamCapabilities>;
type Due = Data["queue"][number];

export function TeamCapabilities() {
  const { data, error, reload, setData } = useApi<Data>("/api/capabilities/team");
  const [problem, setProblem] = useState<string | null>(null);
  const [observing, setObserving] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  if (error) return <Problem text={error} onRetry={reload} />;
  if (!data) return <p className="mt-6 text-ink-muted">Loading your team…</p>;

  const post = async (body: Record<string, unknown>, done: string) => {
    setProblem(null);
    try {
      setData(await api<Data>("/api/capabilities/team", { body }));
      setSaid(done);
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
      return false;
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-6">
      <p>
        <Link href="/capabilities" className={dbtn.quiet}>
          <Icon name="arrow-left" className="size-4" /> My Capabilities
        </Link>
      </p>
      {!data.team.length ? (
        <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <h2 className="font-serif text-2xl font-semibold">No one reports to you on the Hub</h2>
          <p className="mt-1 max-w-2xl text-ink-muted">When someone’s manager is set to you, they’ll appear here with the capabilities for their role.</p>
        </section>
      ) : (
        <>
          <p className="max-w-3xl text-ink-muted">
            This shows what has been recorded for the people who report to you. It isn’t a score. “No evidence yet” means nothing has been recorded: it’s
            something to look into, not a judgement. Their private notes, journals and Discovery Paths are never shown here.
          </p>
          {problem && <Problem text={problem} />}
          <p role="status" aria-live="polite" className={cx("font-semibold text-success", !said && "sr-only")}>
            {said}
          </p>

          <section aria-labelledby="tc-queue">
            <h2 id="tc-queue" className="font-serif text-2xl font-semibold">
              Waiting to be observed ({data.queue.length})
            </h2>
            <p className="mt-1 max-w-3xl text-ink-muted">
              These capabilities need you to see the person do it at work. Watch, then record what you saw against each behaviour.
            </p>
            {data.queue.length === 0 ? (
              <p className="mt-3 rounded-2xl bg-muted px-4 py-3">Nothing is waiting.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {data.queue.map((q) => {
                  const key = `${q.userId}:${q.competencyId}`;
                  return (
                    <li key={key} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-serif text-xl font-semibold">
                            {q.person}: {q.competency}
                          </h3>
                          <p className="text-sm text-ink-muted">
                            Evidence so far: {q.highest ? STAGE_LABELS[q.highest] : NO_EVIDENCE.toLowerCase()} · competency version {q.version}
                          </p>
                        </div>
                        <span className="flex flex-wrap gap-2">
                          {q.criticality === "high" && <Chip tone="warn">High risk</Chip>}
                          {q.askedAt && <Chip tone="good">Asked {formatDate(q.askedAt)}</Chip>}
                          <Chip>{q.state === "refresh" ? "Due a refresh" : q.state === "again" ? "Observe again" : "Not observed yet"}</Chip>
                        </span>
                      </div>
                      {q.morePractice && (
                        <p className="mt-2 text-sm text-ink-muted">
                          Last time ({formatDate(q.morePractice.at)}): {q.morePractice.rationale}
                        </p>
                      )}
                      {observing === key ? (
                        <ObserveForm
                          due={q}
                          onCancel={() => setObserving(null)}
                          onSave={async (body) => {
                            if (await post({ ...body, userId: q.userId, competencyId: q.competencyId }, `Recorded for ${q.person}.`)) setObserving(null);
                          }}
                        />
                      ) : (
                        <button type="button" className={cx(dbtn.secondary, "mt-3")} onClick={() => setObserving(key)}>
                          <Icon name="eye" className="size-4" /> Record an observation
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="tc-team">
            <h2 id="tc-team" className="font-serif text-2xl font-semibold">
              Your team ({data.team.length})
            </h2>
            <div className="mt-3 flex flex-col gap-3">
              {data.team.map((p) => (
                <details key={p.person.id} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
                  <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-serif text-xl font-semibold">{p.person.name}</span>
                    {p.role ? (
                      <span className="text-ink-muted">
                        {p.role.name} · {p.competencies.filter((c) => c.met).length} of {p.competencies.length} at what the role asks for
                      </span>
                    ) : (
                      <span className="text-ink-muted">{p.pending ? "Role being set up" : "No role set for capabilities"}</span>
                    )}
                  </summary>
                  {p.role && (
                    <>
                      <ul className="mt-3 flex flex-col divide-y divide-line">
                        {p.competencies.map((c) => {
                          const s = stageStatus(c);
                          return (
                            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                              <span>{c.name}</span>
                              <span className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="text-ink-muted">asks for {STAGE_LABELS[c.target].toLowerCase()}</span>
                                <Chip tone={s.tone}>{s.text}</Chip>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      <details className="mt-2">
                        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The evidence behind each</summary>
                        <div className="mt-2 flex flex-col gap-3">
                          {p.competencies.map((c) => (
                            <CompetencyCard key={c.id} c={c} headingLevel={4} />
                          ))}
                        </div>
                      </details>
                    </>
                  )}
                </details>
              ))}
            </div>
          </section>

          {data.history.length > 0 && (
            <section aria-labelledby="tc-history">
              <h2 id="tc-history" className="font-serif text-2xl font-semibold">
                What you’ve recorded
              </h2>
              <ul className="mt-3 flex flex-col divide-y divide-line rounded-3xl bg-surface px-5 ring-1 ring-line">
                {data.history.map((o) => (
                  <li key={o.id} className="flex flex-col gap-1 py-3">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        {o.person}: {o.competency}
                      </span>
                      <Chip tone={o.decision === "verified" && !o.withdrawn && !o.superseded ? "good" : "neutral"}>
                        {o.decision === "verified" ? "Signed off" : "Needs more practice"}
                      </Chip>
                      {o.superseded && <Chip>Superseded by a later one</Chip>}
                      {o.withdrawn && <Chip tone="warn">Withdrawn</Chip>}
                      <span className="text-sm text-ink-muted">Observed {formatDate(o.observedOn)}</span>
                    </p>
                    <p className="text-sm">{o.rationale}</p>
                    {o.withdrawn ? (
                      <p className="text-sm text-ink-muted">
                        Withdrawn {formatDate(o.withdrawn.at)} by {o.withdrawn.by}: {o.withdrawn.reason}
                      </p>
                    ) : (
                      !o.superseded && (
                        <div>
                          <button
                            type="button"
                            className={dbtn.quiet}
                            onClick={() => {
                              const reason = window.prompt(
                                "Withdraw this observation? It stays on record as withdrawn and stops counting on the person’s profile.\n\nWhy (kept on record):",
                              );
                              if (reason) void post({ action: "withdraw", id: o.id, reason }, "Withdrawn.");
                            }}
                          >
                            Withdraw
                          </button>
                        </div>
                      )
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ObserveForm({ due, onSave, onCancel }: { due: Due; onSave: (body: Record<string, unknown>) => Promise<void>; onCancel: () => void }) {
  const ids = useId();
  const [seen, setSeen] = useState<string[]>([]);
  const [rationale, setRationale] = useState("");
  // Today, read once when the form opens.
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [on, setOn] = useState(today);
  const [busy, setBusy] = useState(false);
  const all = seen.length === due.behaviours.length;
  const send = async (decision: keyof typeof OBSERVATION_DECISIONS) => {
    setBusy(true);
    await onSave({ decision, behaviours: seen, rationale, observedOn: on });
    setBusy(false);
  };
  return (
    <form className="mt-3 flex flex-col gap-3 rounded-2xl bg-bg p-4 ring-1 ring-line" onSubmit={(e) => e.preventDefault()}>
      {due.definition && <p className="text-ink-muted">{due.definition}</p>}
      <fieldset>
        <legend className="font-semibold">Tick each behaviour you saw</legend>
        <div className="mt-1.5 flex flex-col gap-1">
          {due.behaviours.map((b) => (
            <label key={b} className="flex min-h-11 items-start gap-2 py-1.5">
              <input
                type="checkbox"
                className="mt-1 size-5 accent-[var(--color-action)]"
                checked={seen.includes(b)}
                onChange={(e) => setSeen(e.target.checked ? [...seen, b] : seen.filter((x) => x !== b))}
              />
              <span>{b}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <label className="flex flex-col gap-1 font-semibold">
          When you observed it
          <input type="date" className={dinput} value={on} max={today} onChange={(e) => setOn(e.target.value)} />
        </label>
        <div>
          <label htmlFor={`${ids}-r`} className="font-semibold">
            What you saw
          </label>
          <textarea
            id={`${ids}-r`}
            className={cx(dinput, "mt-1 min-h-24 py-2")}
            maxLength={1000}
            value={rationale}
            aria-describedby={`${ids}-rh`}
            onChange={(e) => setRationale(e.target.value)}
          />
          <p id={`${ids}-rh`} className="mt-1 text-sm text-ink-muted">
            A sentence or two that someone could check later. {NO_CLIENT_DETAILS} {due.person} will see this.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={dbtn.primary} disabled={busy || !all || rationale.trim().length < 15} onClick={() => void send("verified")}>
          <Icon name="circle-check" className="size-4" /> {OBSERVATION_DECISIONS.verified}
        </button>
        <button type="button" className={dbtn.secondary} disabled={busy || rationale.trim().length < 15} onClick={() => void send("more_practice")}>
          {OBSERVATION_DECISIONS.more_practice}
        </button>
        <button type="button" className={dbtn.quiet} onClick={onCancel}>
          Cancel
        </button>
      </div>
      {!all && (
        <p className="text-sm text-ink-muted">Sign off needs every behaviour ticked. If you didn’t see one, choose “Needs more practice” and say which.</p>
      )}
    </form>
  );
}
