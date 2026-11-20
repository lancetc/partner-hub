"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { DOMAINS, WHAT_COUNTS, type CompetencyProfile } from "@/lib/capability";
import type { myCapabilities } from "@/server/capability";
import { Icon } from "../Icon";
import { Chip, dbtn, dinput, Problem } from "../discovery/parts";
import { byGroup, CompetencyCard, NextLink } from "./ProfileCards";

/*
  My Capabilities (docs/capability-intelligence.md): the signed-in person's own evidence, against what
  their role asks for. Plain skill names, the evidence behind each stage, what to do next, and a way to
  say "this is wrong".
*/

type Data = ReturnType<typeof myCapabilities>;

export function MyCapabilities() {
  const { data, error, reload, setData } = useApi<Data>("/api/capabilities");
  const [problem, setProblem] = useState<string | null>(null);
  if (error) return <Problem text={error} onRetry={reload} />;
  if (!data) return <p className="mt-6 text-ink-muted">Loading your capabilities…</p>;

  const post = async (body: Record<string, unknown>) => {
    setProblem(null);
    try {
      setData(await api<Data>("/api/capabilities", { body }));
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
      return false;
    }
  };
  const met = data.competencies.filter((c) => c.met).length;
  const unknown = data.competencies.filter((c) => !c.highest).length;
  const open = new Set(data.corrections.filter((c) => c.state === "open").map((c) => c.competencyId));
  return (
    <div className="mt-6 flex flex-col gap-6">
      {(data.hasTeam || data.hasInsights) && (
        <p className="flex flex-wrap gap-3">
          {data.hasTeam && (
            <Link href="/capabilities/team" className={dbtn.secondary}>
              <Icon name="people" className="size-4" /> My team’s capabilities
            </Link>
          )}
          {data.hasInsights && (
            <Link href="/admin/capabilities" className={dbtn.secondary}>
              <Icon name="layers" className="size-4" /> Capability Insights
            </Link>
          )}
        </p>
      )}

      {!data.role ? (
        <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <h2 className="font-serif text-2xl font-semibold">{data.pending ? "Your role’s capabilities are being set up" : "Nothing to show yet"}</h2>
          <p className="mt-1 max-w-2xl text-ink-muted">
            {data.pending
              ? "The capabilities for your role are still being reviewed. They’ll appear here once they’re approved. Nothing about your learning has changed."
              : "Your role hasn’t been set up with capabilities. Your training and its records are where they’ve always been, under Topics and Discovery Paths."}
          </p>
        </section>
      ) : (
        <>
          <section aria-labelledby="cap-role" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
            <h2 id="cap-role" className="font-serif text-2xl font-semibold">
              {data.role.name}
            </h2>
            <p className="mt-1 text-ink-muted">
              {data.competencies.length} capabilities for this role
              {data.person.team ? ` · ${data.person.team}` : ""}
              {data.person.manager ? ` · your manager is ${data.person.manager}` : ""}
            </p>
            <p className="mt-3 flex flex-wrap gap-2">
              <Chip tone="good">{met} at what the role asks for</Chip>
              <Chip>{data.competencies.length - met - unknown} with evidence, more to come</Chip>
              <Chip>{unknown} with no evidence yet</Chip>
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              Framework version {data.role.version}
              {data.role.approvedAt ? `, approved ${formatDate(data.role.approvedAt)}` : ""}. This page shows what has been recorded. It isn’t a score, and “no
              evidence yet” means nothing has been recorded, not that you can’t do it.
            </p>
            <details className="mt-3">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold">What creates a record here, and who can see it</summary>
              <ul className="list-disc pl-5">
                {WHAT_COUNTS.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <p className="mt-2">
                <span className="font-semibold">Who can see this page:</span> you{data.person.manager ? `, your manager (${data.person.manager})` : ""}, and the
                people who own the framework for {DOMAINS[data.role.domain].toLowerCase()}. Anyone else sees totals for a whole role or team, never your record.
                Each time someone else opens your record, it’s logged.
              </p>
              <p className="mt-2">
                <span className="font-semibold">If something is wrong or missing:</span> use “Something wrong?” on that capability. A named reviewer answers,
                and you’ll see what they found here.
              </p>
            </details>
          </section>

          {problem && <Problem text={problem} />}

          {byGroup(data.competencies).map((g) => (
            <section key={g.group} aria-label={g.group || "Capabilities"}>
              {g.group && <h2 className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{g.group}</h2>}
              <div className="mt-2 flex flex-col gap-4">
                {g.items.map((c) => (
                  <CompetencyCard key={c.id} c={c}>
                    <Actions c={c} hasOpen={open.has(c.id)} post={post} />
                  </CompetencyCard>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {data.corrections.length > 0 && (
        <section aria-labelledby="cap-corr">
          <h2 id="cap-corr" className="font-serif text-2xl font-semibold">
            Corrections you’ve asked for
          </h2>
          <ul className="mt-3 flex flex-col divide-y divide-line rounded-3xl bg-surface px-5 ring-1 ring-line">
            {data.corrections.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 py-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.competency}</span>
                  <Chip tone={c.state === "resolved" ? "good" : "neutral"}>
                    {c.state === "open" ? "With a reviewer" : c.state === "resolved" ? "Corrected" : "No change"}
                  </Chip>
                  <span className="text-sm text-ink-muted">Asked {formatDate(c.createdAt)}</span>
                </p>
                <p className="text-sm">“{c.message}”</p>
                {c.resolution && (
                  <p className="text-sm text-ink-muted">
                    {c.resolvedBy}
                    {c.resolvedAt ? `, ${formatDate(c.resolvedAt)}` : ""}: {c.resolution}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Actions({ c, hasOpen, post }: { c: CompetencyProfile; hasOpen: boolean; post: (body: Record<string, unknown>) => Promise<boolean> }) {
  const ids = useId();
  const [correcting, setCorrecting] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-3">
        {c.next && <span className="font-semibold">Next step:</span>}
        <NextLink c={c} />
        {c.next?.action === "ask" && (
          <button
            type="button"
            className={dbtn.primary}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await post({ action: "ask", competencyId: c.id });
              setBusy(false);
            }}
          >
            {c.next.text}
          </button>
        )}
        {c.next && !c.next.href && !c.next.action && <span>{c.next.text}</span>}
        {!c.next && !c.met && (
          <span className="text-ink-muted">There’s no approved way to show this yet. That’s for the framework’s owners to fix, not you.</span>
        )}
        {c.askedAt && <span className="text-sm text-ink-muted">Asked {formatDate(c.askedAt)}</span>}
        {!correcting && (
          <button type="button" className={cx(dbtn.quiet, "ml-auto")} disabled={hasOpen} onClick={() => setCorrecting(true)}>
            <Icon name="flag" className="size-4" /> {hasOpen ? "Correction with a reviewer" : "Something wrong?"}
          </button>
        )}
      </div>
      {correcting && (
        <form
          className="flex flex-col gap-2 rounded-2xl bg-bg p-4 ring-1 ring-line"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            if (await post({ action: "correction", competencyId: c.id, message: new FormData(e.currentTarget).get("message") })) setCorrecting(false);
            setBusy(false);
          }}
        >
          <label htmlFor={`${ids}-m`} className="font-semibold">
            What’s wrong or missing for “{c.name}”?
          </label>
          <textarea
            id={`${ids}-m`}
            name="message"
            required
            minLength={10}
            maxLength={1000}
            className={cx(dinput, "min-h-20 py-2")}
            aria-describedby={`${ids}-h`}
            autoFocus
          />
          <p id={`${ids}-h`} className="text-sm text-ink-muted">
            For example, an assessment you passed that isn’t shown, or a sign-off recorded against you by mistake. It goes to the framework’s owner, who replies
            here. Please don’t include a client’s name or health details.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={dbtn.secondary} disabled={busy}>
              Send to a reviewer
            </button>
            <button type="button" className={dbtn.quiet} onClick={() => setCorrecting(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
