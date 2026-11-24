"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { DIM_ORDER, DIMENSIONS } from "@/lib/hiringRunway";
import type { hiringAdmin } from "@/server/hiringRunway";
import type { plannerReport } from "@/server/caseloadPlanner";
import { AdminShell, Badge, ErrorNote } from "./ui";

/*
  Hiring Runway for authors (docs/hiring-runway-lab.md): each published fictional lab with participation, rubric means
  and misconceptions over their denominator, how many people used the low and high cases, the owned work measure and
  the review decision; and the private Work Tool's use, as counts with small numbers suppressed. There's no partner,
  business, margin or cash here, and never a leaderboard: a partner's plan stays private to their business.
*/

type Report = ReturnType<typeof hiringAdmin<ReturnType<typeof plannerReport>>>;
const box = "rounded-2xl border border-line bg-surface p-4";
const EVENT_LABELS: Record<string, string> = {
  business_simulator_opened: "Opened",
  scenario_mode_selected: "Mode chosen",
  assumption_changed: "Assumption changed",
  scenario_compared: "Compared (cases, options, versions or sensitivity)",
  quality_guardrail_seen: "Quality guardrail shown",
  cash_warning_seen: "Cash warning shown",
  scenario_saved: "Saved",
  scenario_exported: "Workbook downloaded",
  source_opened: "Calculation basis opened",
};

export function HiringRunwayAdmin() {
  const { data, error } = useApi<Report>("/api/admin/hiring-runway");
  return (
    <AdminShell title="Hiring Runway">
      <p className="max-w-3xl text-ink-muted">
        The fictional Hiring Runway labs and the private Caseload-to-Margin Work Tool. Practice evidence and use counts only: they aren’t a partner business’s
        forecast, proof that hiring improved, or a comparison of businesses. Fewer than five people show counts only. Each lab’s full row, with its work measure
        and review decision, is in the Problem desk’s decision register export.
      </p>
      {error && <ErrorNote text={error} />}
      {!data ? (
        <p className="mt-4 text-ink-muted">Loading…</p>
      ) : (
        <>
          <section aria-labelledby="hr-tool" className={cx(box, "mt-4")}>
            <h2 id="hr-tool" className="font-semibold">
              Plan capacity Work Tool
            </h2>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              {(
                [
                  ["Eligible businesses", data.planner.eligibleBusinesses],
                  ["Businesses planning", data.planner.businessesPlanning],
                  ["Saved plans", data.planner.savedPlans],
                  ["People who opened it", data.planner.openedBy],
                  ["Used a low/high case or sensitivity", data.planner.usedSensitivity],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-muted px-3 py-2">
                  <dt className="text-xs text-ink-muted">{k}</dt>
                  <dd className="font-semibold tabular-nums">{String(v)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 overflow-x-auto" role="region" aria-label="Work Tool events" tabIndex={0}>
              <table className="min-w-[28rem] text-sm">
                <caption className="sr-only">Work Tool events by mode</caption>
                <thead>
                  <tr className="text-left">
                    <th className="py-1.5 pr-3">Event</th>
                    <th className="py-1.5 pr-3">Mode</th>
                    <th className="py-1.5 pr-3 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.planner.events.map((e) => (
                    <tr key={`${e.event}-${e.mode}`} className="border-t border-line">
                      <td className="py-1.5 pr-3">{EVENT_LABELS[e.event] ?? e.event}</td>
                      <td className="py-1.5 pr-3">{e.mode === "plan" ? "Plan my business" : "Fictional example"}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{String(e.n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Events carry the mode, the person’s access role and a fixed-list detail (which field or case), never a value, a salary, a margin or cash.
            </p>
          </section>

          <h2 className="mt-6 font-semibold">Published labs</h2>
          {!data.labs.length ? (
            <p className={cx(box, "mt-2")}>No Hiring Runway lab is published yet. Drafts are in the Magazine editor.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-4">
              {data.labs.map((r) => (
                <li key={r.responseId} className={box}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{r.title}</h3>
                    <Badge>{r.mode === "assessed" ? "Assessed" : "Formative"}</Badge>
                    {r.stale && <Badge tone="warn">Review date passed</Badge>}
                    <Badge tone="info">{r.review}</Badge>
                  </div>
                  <p className="text-sm text-ink-muted">
                    <Link href={`/admin/magazine/${r.guideId}`} className="underline">
                      {r.guide}
                    </Link>{" "}
                    · {r.version} · {r.audience}
                  </p>
                  <p className="mt-2 text-sm">
                    {r.started} started · {r.decided} decided · {r.finished} finished · {r.retries} retries · {r.people} counted
                    {r.sensitivity ? ` · used a low/high case or sensitivity: ${r.sensitivity}` : ""}
                  </p>
                  {r.suppressed ? (
                    <p className="text-sm text-ink-muted">Fewer than five people have finished, so rubric means and misconceptions aren’t shown.</p>
                  ) : (
                    <>
                      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                        {DIM_ORDER.map((k) => (
                          <div key={k} className="rounded-xl bg-muted px-3 py-2">
                            <dt className="text-xs text-ink-muted">{DIMENSIONS[k]} (mean of 2)</dt>
                            <dd className="font-semibold tabular-nums">{String(r.dims[k])}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="mt-2 text-sm">
                        <span className="font-semibold">Misconceptions:</span> {r.misconceptions || "none recorded"}
                      </p>
                    </>
                  )}
                  <p className="mt-2 text-sm">
                    <span className="font-semibold">Work measure:</span> {r.measure || "Not set: an owned gap, not evidence"} ·{" "}
                    <span className="font-semibold">Owner:</span> {r.owner || "Not set"} · <span className="font-semibold">Review by:</span>{" "}
                    {r.reviewBy || "Not set"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </AdminShell>
  );
}
