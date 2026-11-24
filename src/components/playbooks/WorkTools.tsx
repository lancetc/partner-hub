"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { AID_TEMPLATES } from "@/lib/playbook";
import type { playbookList } from "@/server/playbooks";
import type { plannerHome } from "@/server/caseloadPlanner";
import { Icon } from "../Icon";
import { BusinessNotesLink } from "../business/BusinessNotesLink";

/*
  Work Tools (docs/job-aids.md): the official Job Aids for a person's role, found by the task they're doing. No
  course to enrol in or finish first. Each opens at its current approved release, or at its fallback route.
*/

type Row = NonNullable<ReturnType<typeof playbookList>["playbooks"][number]>;
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The business planning tool's card (docs/caseload-margin-calculator.md): what it's found by, besides its title. */
const PLANNER_WORDS = "when to hire hiring recruit recruitment caseload capacity margin cash reserve coordinator workload business planning forecast";

export function WorkTools() {
  const loaded = useApi<ReturnType<typeof playbookList>>("/api/playbooks");
  // Only people who can use it get the planner's card: business owners, the people they authorise, and authors.
  const planner = useApi<ReturnType<typeof plannerHome>>("/api/tools/caseload").data;
  const [q, setQ] = useState("");
  if (loaded.error) return <p role="alert">{loaded.error}</p>;
  if (!loaded.data) return <p className="mt-6 text-ink-muted">Loading…</p>;
  const rows = loaded.data.playbooks.filter((r): r is Row => Boolean(r));
  const terms = words(q).split(" ").filter(Boolean);
  const shown = rows.filter((r) => {
    const hay = words(`${r.title} ${r.trigger} ${r.purpose} ${r.tag} ${r.roleLabel} ${AID_TEMPLATES[r.template].label}`);
    return terms.every((t) => hay.includes(t));
  });
  const plannerShown = Boolean(planner?.eligible) && terms.every((t) => words(`caseload to margin hiring capacity ${PLANNER_WORDS}`).includes(t));
  return (
    <div className="mt-6">
      <label className="flex flex-col gap-1 font-semibold">
        What are you doing?
        <input
          type="search"
          className="min-h-12 w-full max-w-2xl rounded-2xl border border-line-strong bg-surface px-4 text-lg font-normal"
          placeholder="For example: approving an invoice"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <p className="mt-2 text-sm text-ink-muted" role="status">
        {rows.length === 0 ? "" : `${shown.length} of ${rows.length} for your role`}
      </p>
      {plannerShown && (
        <Link
          href="/tools/caseload-margin"
          className="group mt-3 flex items-start gap-4 rounded-3xl bg-[#102a43] p-5 text-white ring-1 ring-line transition hover:shadow-md hover:ring-action"
        >
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#7fd4d4] text-[#102a43]">
            <Icon name="sliders" className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-[#7fd4d4]">
              Business planning · {planner?.access ? `private to ${planner.access.orgName}` : "fictional example"}
            </span>
            <span className="mt-0.5 block font-serif text-xl font-semibold leading-snug group-hover:underline">Caseload-to-Margin & Hiring Capacity</span>
            <span className="mt-1 block">
              <span className="font-semibold">Use when:</span> deciding when to plan recruitment, and what growth could do to workload, margin and cash.
            </span>
            {planner?.saved && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold">
                <Icon name="bookmark-filled" className="size-3.5" /> In your Favourites
              </span>
            )}
          </span>
        </Link>
      )}
      {/* Business Field Notes, for verified principals only: renders nothing for anyone else. */}
      {!terms.length && <BusinessNotesLink className="mt-3" />}
      {!rows.length ? (
        !plannerShown && <p className="mt-4 text-lg">There are no Work Tools for your role yet.</p>
      ) : !shown.length ? (
        plannerShown ? null : (
          <p className="mt-4 text-lg">Nothing matches that. Try a word from the task, like “invoice” or “incident”.</p>
        )
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {shown.map((r) => (
            <li key={r.id}>
              <Link
                href={`/tools/${r.id}`}
                className="group flex h-full items-start gap-4 rounded-3xl bg-muted p-5 ring-1 ring-line transition hover:shadow-md hover:ring-action"
              >
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-action text-on-action">
                  <Icon name="clipboard" className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
                    {AID_TEMPLATES[r.template].label}
                    {r.minutes > 0 && ` · about ${r.minutes} min`}
                  </span>
                  <span className="mt-0.5 block font-serif text-xl font-semibold leading-snug group-hover:underline">{r.title}</span>
                  {r.trigger && (
                    <span className="mt-1 block">
                      <span className="font-semibold">Use when:</span> {r.trigger}
                    </span>
                  )}
                  <span className="mt-1 block text-ink-muted">{r.purpose}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span
                      className={cx(
                        "rounded-full px-2.5 py-0.5",
                        r.readiness === "fallback" ? "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]" : "bg-tealtint",
                      )}
                    >
                      {r.readiness === "fallback" ? "Temporarily unavailable: see the fallback route" : `Release ${r.number}`}
                      {r.readiness === "review_due" ? " · review due" : ""}
                    </span>
                    {r.saved && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 ring-1 ring-line">
                        <Icon name="bookmark-filled" className="size-3.5 text-accent" /> In your Favourites
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
