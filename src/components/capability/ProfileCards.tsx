"use client";

import Link from "next/link";
import { cx, formatDate } from "@/lib/format";
import { CRITICALITY, NO_EVIDENCE, STAGE_LABELS, STAGE_HOW, STAGES, type CompetencyProfile } from "@/lib/capability";
import { Icon } from "../Icon";
import { Chip } from "../discovery/parts";

/*
  A capability profile, competency by competency (docs/capability-intelligence.md). The four stages are
  always shown side by side with the evidence behind each, so "completed the Topic" can't be read as
  "can do it". There is no score and no percentage.
*/

export function stageStatus(c: Pick<CompetencyProfile, "met" | "stale" | "highest" | "target">) {
  if (c.met) return { tone: "good" as const, text: `${STAGE_LABELS[c.target]}: what the role asks for` };
  if (c.stale) return { tone: "warn" as const, text: "Needs refresh" };
  if (!c.highest) return { tone: "neutral" as const, text: NO_EVIDENCE };
  return { tone: "neutral" as const, text: `${STAGE_LABELS[c.highest]} so far` };
}

export function CompetencyCard({ c, children, headingLevel = 3 }: { c: CompetencyProfile; children?: React.ReactNode; headingLevel?: 3 | 4 }) {
  const H = headingLevel === 3 ? "h3" : "h4";
  const status = stageStatus(c);
  return (
    <article className="rounded-3xl bg-surface p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <H className="font-serif text-xl font-semibold">{c.name}</H>
        <span className="flex flex-wrap gap-2">
          {c.criticality === "high" && <Chip tone="warn">{CRITICALITY.high}</Chip>}
          <Chip tone={status.tone}>{status.text}</Chip>
        </span>
      </div>
      {c.definition && <p className="mt-1 text-ink-muted">{c.definition}</p>}
      <p className="mt-2 text-sm">
        <span className="font-semibold">The role asks for:</span> {STAGE_LABELS[c.target]}
        {c.refreshMonths ? `, refreshed every ${c.refreshMonths} months` : ""}
        <span className="text-ink-muted"> · competency version {c.version}</span>
      </p>
      <p className="mt-2 rounded-2xl bg-bg px-3 py-2 font-semibold ring-1 ring-line">{c.summary}</p>

      <ol className="mt-3 flex flex-col divide-y divide-line">
        {STAGES.map((s) => {
          const evidence = c.stages[s];
          const beyond = STAGES.indexOf(s) > STAGES.indexOf(c.target);
          return (
            <li key={s} className="flex gap-3 py-2.5">
              <span
                aria-hidden
                className={cx(
                  "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full",
                  evidence.length ? "bg-action text-on-action" : "border border-dashed border-line-strong text-ink-muted",
                )}
              >
                {evidence.length ? <Icon name="check" className="size-3.5" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p>
                  <span className="font-semibold">{STAGE_LABELS[s]}</span>
                  {s === c.target && <span className="text-sm text-ink-muted"> · what the role asks for</span>}
                  {beyond && <span className="text-sm text-ink-muted"> · not asked for in this role</span>}
                </p>
                {evidence.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    {NO_EVIDENCE}. {STAGE_HOW[s]}
                  </p>
                ) : (
                  <ul className="mt-0.5 flex flex-col gap-1 text-sm">
                    {evidence.map((e, i) => (
                      <li key={i}>
                        {e.label}
                        <span className="text-ink-muted">
                          {" "}
                          · {formatDate(e.at)}
                          {e.version ? ` · ${/^\d/.test(e.version) ? `version ${e.version}` : e.version}` : ""}
                          {e.by ? ` · ${e.kind === "observation" ? "signed off by" : "recorded by"} ${e.by}` : ""}
                        </span>
                        {e.stale && (
                          <>
                            {" "}
                            <Chip tone="warn">Needs refresh</Chip>
                          </>
                        )}
                        {e.detail && <span className="block text-ink-muted">{e.detail}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {c.morePractice && (
        <p className="mt-2 rounded-2xl bg-muted px-3 py-2 text-sm">
          <span className="font-semibold">
            Observed {formatDate(c.morePractice.at)} by {c.morePractice.by}: more practice first.
          </span>{" "}
          {c.morePractice.rationale}
        </p>
      )}
      {c.behaviours.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">What an assessor looks for</summary>
          <ul className="list-disc pl-5">
            {c.behaviours.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </details>
      )}
      {children}
    </article>
  );
}

/** A next step that goes somewhere on the Hub. */
export function NextLink({ c }: { c: CompetencyProfile }) {
  if (!c.next?.href) return null;
  return (
    <Link href={c.next.href} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90">
      {c.next.text} <Icon name="arrow-right" className="size-4" />
    </Link>
  );
}

/** Competencies under their group headings. */
export function byGroup<T extends { group: string }>(items: T[]): { group: string; items: T[] }[] {
  const out: { group: string; items: T[] }[] = [];
  for (const item of items) {
    const g = out.find((x) => x.group === item.group);
    if (g) g.items.push(item);
    else out.push({ group: item.group, items: [item] });
  }
  return out;
}
