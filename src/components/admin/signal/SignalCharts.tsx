"use client";

import { useState } from "react";
import { cx } from "@/lib/format";
import { monthLabel } from "../problems/ProblemCharts";

/*
  The Signal Room's own charts (docs/living-cases.md), beside the Problem desk's line chart. Counts in months, a
  split of first answers, and two bars for who could and who did. Each has its figures as text or a table, a
  legend with a shape as well as a colour, and says so when there are too few people to read a split from.

  Three hues, in a fixed order, and a neutral for "unknown": a fifth group is folded into "other" by the server, so
  no colour is ever made up for one.
*/

export type Slot = 1 | 2 | 3 | "neutral";
const FILL: Record<Slot, React.CSSProperties> = {
  1: { background: "var(--viz-1)" },
  2: { background: "var(--viz-2)" },
  3: { background: "var(--viz-3)" },
  // Unknown is hatched as well as grey, so it reads apart from the hues without relying on colour.
  neutral: { background: "repeating-linear-gradient(135deg, var(--ink-muted) 0 3px, transparent 3px 6px)", opacity: 0.7 },
};
function Key({ slot }: { slot: Slot }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block size-3 shrink-0", slot === 2 ? "rounded-none" : slot === 3 ? "rotate-45" : "rounded-full")}
      style={FILL[slot]}
    />
  );
}

export const frame = "min-w-0 rounded-2xl border border-line bg-surface p-4";

/** What a chart counts, who owns the figure, how fresh it is, and where the underlying report is. */
export function Definition({ items, link }: { items: [string, string][]; link?: { href: string; label: string } | null }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer font-medium text-ink-muted hover:text-ink">What this counts</summary>
      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
        {items
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold">{k}</dt>
              <dd className="text-ink-muted">{v}</dd>
            </div>
          ))}
      </dl>
      {link && (
        <a href={link.href} className="mt-2 inline-flex min-h-10 items-center font-semibold text-accent underline underline-offset-2">
          {link.label}
        </a>
      )}
    </details>
  );
}

/** Counts by month, stacked: how many, and of what. The parts of a bar add up to something real (questions asked that month). */
export function StackedMonths({
  title,
  note,
  unit,
  buckets,
  series,
  notes = [],
  empty = "Nothing in these dates.",
  children,
}: {
  title: string;
  note?: string;
  unit: string;
  buckets: string[];
  series: { key: string; label: string; slot: Slot; values: number[] }[];
  /** Dated things to read the chart against, listed underneath. */
  notes?: { on: string; text: string }[];
  empty?: string;
  children?: React.ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = buckets.map((_, i) => series.reduce((n, s) => n + s.values[i], 0));
  const max = Math.max(1, ...totals);
  const any = totals.some((t) => t > 0);
  return (
    <figure className={frame}>
      <figcaption>
        <p className="font-semibold">{title}</p>
        {note && <p className="mt-0.5 text-sm text-ink-muted">{note}</p>}
      </figcaption>
      {!any ? (
        <p className="mt-3 rounded-xl bg-muted p-3 text-sm text-ink-muted">{empty}</p>
      ) : (
        <>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <Key slot={s.slot} /> {s.label}
              </li>
            ))}
          </ul>
          <div className="relative mt-3">
            <div className="flex h-44 items-end gap-1.5 border-b border-line-strong" role="img" aria-label={`${title}. The figures are in the table below.`}>
              {buckets.map((b, i) => (
                <div
                  key={b}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                >
                  {totals[i] > 0 && <span className="mb-0.5 text-center text-xs font-semibold tabular-nums">{totals[i]}</span>}
                  <div className="flex flex-col-reverse gap-0.5" style={{ height: `${(totals[i] / max) * 82}%` }}>
                    {series.map((s) =>
                      s.values[i] > 0 ? (
                        <div key={s.key} className="w-full first:rounded-b-none last:rounded-t" style={{ ...FILL[s.slot], flexGrow: s.values[i] }} />
                      ) : null,
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1.5 text-center text-xs text-ink-muted">
              {buckets.map((b) => (
                <span key={b} className="min-w-0 flex-1 truncate">
                  {monthLabel(b)}
                </span>
              ))}
            </div>
            {hover !== null && totals[hover] > 0 && (
              <div className="pointer-events-none absolute left-2 top-0 z-10 w-max max-w-64 rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm shadow-lg">
                <p className="font-semibold">{monthLabel(buckets[hover], true)}</p>
                {series
                  .filter((s) => s.values[hover] > 0)
                  .map((s) => (
                    <p key={s.key} className="flex items-center gap-1.5">
                      <Key slot={s.slot} />
                      <span className="min-w-0 truncate text-ink-muted">{s.label}</span>
                      <span className="ml-auto pl-3 font-semibold tabular-nums">{s.values[hover]}</span>
                    </p>
                  ))}
              </div>
            )}
          </div>
          {notes.length > 0 && (
            <ul className="mt-2 flex flex-col gap-0.5 text-sm text-ink-muted">
              {notes.map((n, i) => (
                <li key={i}>
                  <span className="font-semibold text-ink">{n.on}:</span> {n.text}
                </li>
              ))}
            </ul>
          )}
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer font-medium text-ink-muted hover:text-ink">Show the figures as a table</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-72 border-collapse text-left tabular-nums">
                <caption className="sr-only">
                  {title} ({unit})
                </caption>
                <thead>
                  <tr className="border-b border-line-strong">
                    <th scope="col" className="py-1 pr-3 font-semibold">
                      Month
                    </th>
                    {series.map((s) => (
                      <th key={s.key} scope="col" className="py-1 pr-3 font-semibold">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b, i) => (
                    <tr key={b} className="border-b border-line">
                      <th scope="row" className="py-1 pr-3 font-normal">
                        {monthLabel(b, true)}
                      </th>
                      {series.map((s) => (
                        <td key={s.key} className="py-1 pr-3">
                          {s.values[i]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      {children}
    </figure>
  );
}

export type Verdicts = { best: number; acceptable: number; risky: number };
const VERDICT: { key: keyof Verdicts; label: string; slot: Slot }[] = [
  { key: "best", label: "Best choice", slot: 3 },
  { key: "acceptable", label: "Works, with care", slot: 1 },
  { key: "risky", label: "Not the best choice", slot: 2 },
];
export function VerdictKey() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {VERDICT.map((v) => (
        <li key={v.key} className="flex items-center gap-1.5">
          <Key slot={v.slot} /> {v.label}
        </li>
      ))}
    </ul>
  );
}
/**
  First answers as one bar: how many chose each kind of option. With too few people the count is given and the
  split is not, because a split of four people says more about those four than about the question.
*/
export function VerdictBar({ label, n, first, thin, min, detail }: { label: string; n: number; first: Verdicts; thin: boolean; min: number; detail?: string }) {
  const text = VERDICT.map((v) => `${first[v.key]} ${v.label.toLowerCase()}`).join(", ");
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-ink-muted">
          <span className="font-semibold text-ink">{n}</span> {n === 1 ? "person" : "people"}
          {detail && ` · ${detail}`}
        </span>
      </div>
      {n === 0 ? (
        <p className="mt-1 rounded-lg bg-muted px-3 py-1.5 text-sm text-ink-muted">Nobody yet.</p>
      ) : thin ? (
        <p className="mt-1 rounded-lg bg-muted px-3 py-1.5 text-sm text-ink-muted">Fewer than {min} people: too few to show how they answered.</p>
      ) : (
        <>
          <div className="mt-1 flex h-6 gap-0.5 overflow-hidden rounded" role="img" aria-label={`${label}: ${text}.`}>
            {VERDICT.map((v) =>
              first[v.key] > 0 ? (
                <div
                  key={v.key}
                  title={`${v.label}: ${first[v.key]} of ${n}`}
                  className="grid min-w-0 place-items-center"
                  style={{ ...FILL[v.slot], flexGrow: first[v.key] }}
                >
                  <span className="rounded bg-surface/90 px-1 text-xs font-semibold tabular-nums">{first[v.key]}</span>
                </div>
              ) : null,
            )}
          </div>
          <p className="sr-only">{text}.</p>
        </>
      )}
    </div>
  );
}

/** Who could have read something and who did: one bar for the possible, one for the actual, never a bare percentage. */
export function ReachBars({ rows }: { rows: { key: string; label: string; eligible: number; exposed: number; detail?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.eligible));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-medium">{r.label}</span>
            <span className="tabular-nums">
              <span className="font-semibold">{r.exposed}</span> <span className="text-ink-muted">opened it, of {r.eligible} who could</span>
            </span>
          </div>
          <div className="mt-1 h-2.5 rounded-r bg-muted" style={{ width: `${Math.max(4, (r.eligible / max) * 100)}%` }} title={`${r.eligible} eligible`}>
            <div className="h-full rounded-r" style={{ ...FILL[1], width: `${r.eligible ? Math.min(100, (r.exposed / r.eligible) * 100) : 0}%` }} />
          </div>
          {r.detail && <p className="mt-0.5 text-xs text-ink-muted">{r.detail}</p>}
        </li>
      ))}
    </ul>
  );
}
