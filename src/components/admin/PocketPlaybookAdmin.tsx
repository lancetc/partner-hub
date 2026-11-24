"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { REVIEW_DECISIONS, type ReviewDecision } from "@/lib/playbook";
import type { PocketReport } from "@/server/pocketPlaybook";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";

/*
  The Live Call Pocket Playbook for owners (docs/pocket-playbook.md): source health (status, owner, dates, what's
  awaited, what blocks release, pins left on an older version) and use in a date range (reach, calculator states by
  rule set, incident navigation, scripts, search gaps). Counts only: no one's pins, figures, searches or incidents.
  Withdrawing a tool takes it out of every drawer, home row and search at once.
*/

type Tool = PocketReport["tools"][number];
const box = "rounded-2xl border border-line bg-surface p-4";
const day = (d: string) => (d ? formatDate(d) : "not set");
const tone = (s: string) => (s === "current" ? "good" : s === "withdrawn" ? "bad" : "warn");
const num = "py-1.5 pr-3 text-right tabular-nums";

export function PocketPlaybookAdmin() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data: r, error, reload } = useApi<PocketReport>(`/api/admin/pocket?${new URLSearchParams({ ...(from && { from }), ...(to && { to }) })}`);
  return (
    <AdminShell title="Live Call Pocket Playbook">
      <p className="max-w-3xl text-ink-muted">
        The Companion Drawer’s tools: the contribution Quick-Calc, Incident first steps and Golden Scripts. Use is adoption evidence: opening a tool is never
        proof that a financial or incident decision was right. A figure from fewer than ten people is marked.
      </p>
      {error && <ErrorNote text={error} />}
      {!r ? (
        <p className="mt-4 text-ink-muted">Loading…</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Field label="From">
              <input type="date" className={input} value={from || r.range.from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <input type="date" className={input} value={to || r.range.to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <p className="pb-2 text-sm text-ink-muted">
              Drawer opened {r.totals.drawerOpens} times by {r.totals.drawerPeople} {r.totals.drawerPeople === 1 ? "person" : "people"} · searches with no
              approved answer: {r.totals.searchNoResult} · “missing guidance” reports: {r.totals.missingGuidanceReports}
            </p>
          </div>

          <section aria-labelledby="pocket-health" className={cx(box, "mt-4")}>
            <h2 id="pocket-health" className="font-semibold">
              Source health
            </h2>
            <ul className="mt-2 flex flex-col gap-3">
              {r.tools.map((t) => (
                <ToolHealth key={t.id} t={t} onChanged={reload} />
              ))}
            </ul>
          </section>

          <section aria-labelledby="pocket-use" className={cx(box, "mt-4")}>
            <h2 id="pocket-use" className="font-semibold">
              Use, {day(r.range.from)} to {day(r.range.to)}
            </h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <caption className="sr-only">Use of each Pocket tool</caption>
                <thead className="text-ink-muted">
                  <tr>
                    {[
                      "Tool",
                      "Eligible",
                      "Opened it",
                      "Opens",
                      "Came back",
                      "From drawer",
                      "From home",
                      "From search",
                      "Pinned now",
                      "Pinned, older version",
                      "Issues",
                    ].map((h, i) => (
                      <th key={h} scope="col" className={cx("py-1.5 pr-3 font-medium", i > 0 && "text-right")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.tools.map((t) => (
                    <tr key={t.id} className="border-t border-line">
                      <th scope="row" className="py-1.5 pr-3 font-medium">
                        {t.title}
                      </th>
                      <td className={num}>{t.eligible}</td>
                      <td className={num}>
                        {t.viewers}
                        {t.thin && <span className="ml-1 text-xs text-ink-muted">(few)</span>}
                      </td>
                      <td className={num}>{t.opens}</td>
                      <td className={num}>{t.returners}</td>
                      <td className={num}>{t.byPlace.drawer}</td>
                      <td className={num}>{t.byPlace.home}</td>
                      <td className={num}>{t.byPlace.search}</td>
                      <td className={num}>{t.pinnedNow}</td>
                      <td className={num}>{t.pinnedAfterUpdate}</td>
                      <td className={num}>{t.issues}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="pocket-calc" className={box}>
              <h2 id="pocket-calc" className="font-semibold">
                Calculator states, by rule set
              </h2>
              <p className="text-sm text-ink-muted">
                How often a result could be estimated, against needing a rate, price, category or funding check. No figures are kept.
              </p>
              {r.tools
                .filter((t) => t.family === "calculator")
                .map((t) => (
                  <table key={t.id} className="mt-2 w-full text-left text-sm">
                    <thead className="text-ink-muted">
                      <tr>
                        <th scope="col" className="py-1 pr-3 font-medium">
                          Rule set
                        </th>
                        <th scope="col" className="py-1 pr-3 text-right font-medium">
                          Estimates
                        </th>
                        <th scope="col" className="py-1 pr-3 text-right font-medium">
                          Needs verification
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.byRuleSet.map((b) => {
                        const rs = r.ruleSets.find((x) => x.number === b.number);
                        return (
                          <tr key={b.number} className="border-t border-line">
                            <th scope="row" className="py-1 pr-3 font-medium">
                              {b.number} · {rs?.id} <span className="font-normal text-ink-muted">({rs?.status})</span>
                            </th>
                            <td className={num}>{b.estimates}</td>
                            <td className={num}>{b.needsVerification}</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t border-line text-ink-muted">
                        <th scope="row" className="py-1 pr-3 font-normal">
                          Interim funding views · rate-not-notified views
                        </th>
                        <td className={num}>{t.fundingViews}</td>
                        <td className={num}>{t.interimContributionViews}</td>
                      </tr>
                    </tbody>
                  </table>
                ))}
            </section>
            <section aria-labelledby="pocket-incident" className={box}>
              <h2 id="pocket-incident" className="font-semibold">
                Incident navigation and scripts
              </h2>
              <p className="text-sm text-ink-muted">
                Whether people reach the internal route. A tool open says nothing about whether an incident was reportable.
              </p>
              {r.tools
                .filter((t) => t.family === "escalation")
                .map((t) => (
                  <p key={t.id} className="mt-2 text-sm">
                    Path opened <strong>{t.incidentOpens}</strong> times; internal route or IMS link used <strong>{t.internalRouteOpens}</strong> times; sources
                    opened <strong>{t.sourceOpens}</strong> times.
                  </p>
                ))}
              <table className="mt-2 w-full text-left text-sm">
                <thead className="text-ink-muted">
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      Script
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      Opened
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      Copied
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {r.scripts.map((s) => (
                    <tr key={s.id} className="border-t border-line">
                      <th scope="row" className="py-1 pr-3 font-medium">
                        {s.trigger}{" "}
                        <span className="font-normal text-ink-muted">
                          (v{s.version}, {s.status})
                        </span>
                      </th>
                      <td className={num}>{s.opens}</td>
                      <td className={num}>{s.copies}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </AdminShell>
  );
}

function ToolHealth({ t, onChanged }: { t: Tool; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<ReviewDecision>("keep");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const act = async (body: Record<string, unknown>) => {
    setErr("");
    try {
      await api("/api/admin/pocket", { body: { id: t.id, ...body } });
      setReason("");
      setNote("");
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn’t work.");
    }
  };
  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/tools/${t.id}`} className="font-semibold underline underline-offset-2">
          {t.title}
        </Link>
        <Badge tone={tone(t.status)}>{t.statusLabel}</Badge>
        <span className="text-sm text-ink-muted">
          v{t.version} · owner {t.owner} · reviewer {t.reviewer} · for {t.audiences.join(", ")}
        </span>
      </div>
      <p className="mt-1 text-sm">
        Effective {day(t.effectiveOn)} · reviewed {day(t.reviewedOn)} · next review {day(t.nextReview)}
        {t.reviewDue && <strong> · review due</strong>}
        {t.pinnedAfterUpdate > 0 && <strong> · {t.pinnedAfterUpdate} pinned on an older version</strong>}
      </p>
      <p className="mt-1 text-sm">
        <span className="font-semibold">Awaiting:</span> {t.awaiting}
      </p>
      {t.problems.length > 0 && (
        <details className="mt-1 text-sm">
          <summary className="cursor-pointer font-semibold">What blocks release ({t.problems.length})</summary>
          <ul className="mt-1 list-disc pl-5">
            {t.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-1 text-sm text-ink-muted">
        Sources:{" "}
        {t.sources.map((s, i) => (
          <span key={s.label}>
            {i > 0 && "; "}
            {s.href ? (
              <a href={s.href} target="_blank" rel="noreferrer" className="underline">
                {s.label}
              </a>
            ) : (
              s.label
            )}
          </span>
        ))}
        {t.review && ` · last review decision: ${t.review.decision} (${formatDate(t.review.at)}): ${t.review.note}`}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {t.status === "withdrawn" ? (
          <button type="button" className={btn.secondary} onClick={() => void act({ action: "restore" })}>
            Restore
          </button>
        ) : (
          <>
            <Field label="Reason (readers see it)" className="min-w-56 flex-1">
              <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <button type="button" className={btn.danger} disabled={reason.trim().length < 3} onClick={() => void act({ action: "withdraw", reason })}>
              Withdraw now
            </button>
          </>
        )}
        <Field label="Review decision">
          <select className={input} value={decision} onChange={(e) => setDecision(e.target.value as ReviewDecision)}>
            {(Object.keys(REVIEW_DECISIONS) as ReviewDecision[]).map((k) => (
              <option key={k} value={k}>
                {REVIEW_DECISIONS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What it rests on" className="min-w-56 flex-1">
          <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button type="button" className={btn.secondary} disabled={note.trim().length < 3} onClick={() => void act({ action: "review", decision, note })}>
          Record decision
        </button>
      </div>
      {err && (
        <p role="alert" className="mt-1 text-sm font-semibold text-danger">
          {err}
        </p>
      )}
    </li>
  );
}
