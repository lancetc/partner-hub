"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { MOD_ACTIONS, NEEDS_REASON, VERIFIED_LABEL, type ModAction } from "@/lib/caseThread";
import type { caseModeration, caseThreadInsights } from "@/server/caseThreads";
import { AdminShell, Badge, btn, ErrorNote, input } from "./ui";

/*
  "What Would You Do?" case threads for moderators (docs/case-threads.md): one queue for every thread, whether a post
  came from a Magazine block or the Community page. Publish, decline, ask for changes, hide, restore, archive as
  outdated, escalate, annotate and endorse, each with a reason that's logged and audited; pause, reopen or archive a
  thread; grant or withdraw the verified coordinator badge against a recorded criterion; and aggregate insights.
  Learners' private first takes and reflections never appear here.
*/

type Mod = ReturnType<typeof caseModeration>;
type Item = Mod["queue"][number];
type Insights = ReturnType<typeof caseThreadInsights>;
const TABS = { queue: "Queue", published: "Published", hidden: "Hidden", threads: "Threads", verified: "Verified contributors", insights: "Insights" } as const;
type Tab = keyof typeof TABS;
const date = (d: string | null) => (d ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d)) : "");

/** Which decisions fit an item in each state. */
function actionsFor(it: Item): ModAction[] {
  const post = it.kind === "post";
  switch (it.status) {
    case "pending":
      return post ? ["approve", "revise", "reject", "escalate"] : ["approve", "reject", "escalate"];
    case "reported":
      return ["restore", "hide", ...(post ? (["archive"] as ModAction[]) : []), "escalate"];
    case "escalated":
      return post ? ["approve", "revise", "reject", "hide"] : ["approve", "reject", "hide"];
    case "approved":
      return post ? [it.endorsement ? "unendorse" : "endorse", "annotate", "hide", "archive", "escalate"] : ["hide", "escalate"];
    case "hidden":
    case "archived":
      return ["restore"];
    default:
      return [];
  }
}

export function CaseThreadsAdmin() {
  const mod = useApi<Mod>("/api/admin/case-threads");
  const [tab, setTab] = useState<Tab>("queue");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setProblem(null);
    try {
      mod.setData(await api<Mod>("/api/admin/case-threads", { body }));
      return true;
    } catch (e) {
      setProblem((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (mod.error)
    return (
      <AdminShell title="Case threads">
        <ErrorNote text={mod.error} />
      </AdminShell>
    );
  if (!mod.data)
    return (
      <AdminShell title="Case threads">
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  const m = mod.data;
  const counts: Record<Tab, number> = {
    queue: m.queue.length + m.reported.length + m.escalated.length,
    published: m.published.length,
    hidden: m.hidden.length,
    threads: m.threads.length,
    verified: m.verified.filter((v) => !v.revokedAt).length,
    insights: 0,
  };
  return (
    <AdminShell title="Case threads">
      <p className="max-w-3xl text-ink-muted">
        “What Would You Do?” Community Case Threads. One queue for every thread, whether a response came from a Magazine block or the Community page. Everything
        shared waits here before anyone else sees it. Live client matters go to the approved escalation process, never the thread.
      </p>
      <div role="tablist" aria-label="Case threads" className="mt-4 flex flex-wrap gap-1.5">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx(
              "min-h-10 rounded-full border px-3 text-sm font-semibold",
              tab === t ? "border-ink bg-ink text-surface" : "border-line-strong hover:bg-muted",
            )}
          >
            {TABS[t]}
            {counts[t] > 0 && ` · ${counts[t]}`}
          </button>
        ))}
      </div>
      {problem && (
        <div className="mt-3">
          <ErrorNote text={problem} />
        </div>
      )}
      <div role="tabpanel" className="mt-4 flex flex-col gap-4">
        {tab === "queue" && (
          <>
            <ItemList title="Waiting for a decision" items={m.queue} act={act} busy={busy} empty="Nothing waiting." />
            <ItemList title="Reported (hidden until reviewed)" items={m.reported} act={act} busy={busy} empty="No open reports." />
            <ItemList title="Escalated" items={m.escalated} act={act} busy={busy} empty="Nothing escalated." />
            {m.waiting.length > 0 && <ItemList title="Waiting on the author’s changes" items={m.waiting} act={act} busy={busy} empty="" />}
          </>
        )}
        {tab === "published" && <ItemList title="Published responses" items={m.published} act={act} busy={busy} empty="Nothing published yet." />}
        {tab === "hidden" && <ItemList title="Hidden and archived" items={m.hidden} act={act} busy={busy} empty="Nothing hidden." />}
        {tab === "threads" && <Threads m={m} act={act} busy={busy} />}
        {tab === "verified" && <Verified m={m} act={act} busy={busy} />}
        {tab === "insights" && <InsightsTab />}
        {tab !== "insights" && m.decisions.length > 0 && (
          <details className="rounded-2xl border border-line p-3">
            <summary className="min-h-10 cursor-pointer font-semibold">Recent decisions (audit log)</summary>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {m.decisions.map((d) => (
                <li key={d.id}>
                  {date(d.at)} · {d.actor} · {d.action} {d.target_type} {d.target_id.slice(0, 18)}
                  {d.threadTitle && ` in “${d.threadTitle}”`}
                  {d.reason && `: ${d.reason}`}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </AdminShell>
  );
}

function ItemList({
  title,
  items,
  act,
  busy,
  empty,
}: {
  title: string;
  items: Item[];
  act: (b: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  empty: string;
}) {
  return (
    <section>
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      {!items.length && empty && <p className="mt-1 text-sm text-ink-muted">{empty}</p>}
      <ul className="mt-2 flex flex-col gap-3">
        {items.map((it) => (
          <ItemCard key={`${it.kind}-${it.id}`} it={it} act={act} busy={busy} />
        ))}
      </ul>
    </section>
  );
}

function ItemCard({ it, act, busy }: { it: Item; act: (b: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const [reason, setReason] = useState("");
  const actions = actionsFor(it);
  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={it.status === "approved" ? "good" : it.status === "pending" ? "info" : "warn"}>{it.statusText}</Badge>
        <span className="font-semibold">{it.kind === "post" ? "Response" : "Comment"}</span>
        <span className="text-ink-muted">
          in{" "}
          <Link href={`/community/cases/${it.threadId}`} className="underline">
            {it.threadTitle}
          </Link>{" "}
          · {it.author}
          {it.verified && ` · ${it.verified}`} · {date(it.at)}
          {it.editedAt && ` · edited ${date(it.editedAt)}`}
          {it.kind === "post" && it.source !== "seed" && ` · from their ${it.source === "revised" ? "revised answer" : "first take"}`}
        </span>
      </p>
      {it.endorsement && (
        <p className="mt-1 text-sm font-semibold">
          Quality-endorsed example · {it.endorsement.by}, {it.endorsement.at}, case version {it.endorsement.version}
        </p>
      )}
      {!it.current && <p className="mt-1 text-sm font-semibold">Written under an earlier policy version.</p>}
      {it.flags.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm font-semibold text-danger">
          {it.flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {it.reports.length > 0 && (
        <p className="mt-1 text-sm">
          <span className="font-semibold">Reports:</span> {it.reports.map((r) => r.reason).join("; ")}
        </p>
      )}
      <p className="mt-2 whitespace-pre-line rounded-xl bg-muted p-3">{it.body}</p>
      {it.note && <p className="mt-1 text-sm text-ink-muted">Told the author: {it.note}</p>}
      {it.modNote && <p className="mt-1 text-sm text-ink-muted">Moderator note shown on it: {it.modNote}</p>}
      {actions.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Reason (recorded; the author sees it for a decline, a change request, a hide or an archive)
            <textarea className={cx(input, "min-h-16 py-2 font-normal")} value={reason} maxLength={600} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {actions.map((a) => (
              <button
                key={a}
                type="button"
                className={a === "approve" || a === "restore" ? btn.primary : btn.secondary}
                disabled={busy || (NEEDS_REASON.includes(a) && !reason.trim())}
                onClick={async () => {
                  if (await act({ target: it.kind, id: it.id, action: a, reason })) setReason("");
                }}
              >
                {MOD_ACTIONS[a]}
              </button>
            ))}
          </div>
          {actions.includes("escalate") && (
            <p className="text-xs text-ink-muted">
              Escalate when it looks like a live or identifiable client matter: it stays hidden while the designated moderator follows the internal escalation
              policy.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function Threads({ m, act, busy }: { m: Mod; act: (b: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const [reason, setReason] = useState<Record<string, string>>({});
  return (
    <ul className="flex flex-col gap-3">
      {!m.threads.length && <li className="text-ink-muted">No case threads yet. A thread is registered when a course holding it is published.</li>}
      {m.threads.map((t) => (
        <li key={t.id} className="rounded-2xl border border-line bg-surface p-4">
          <p className="flex flex-wrap items-center gap-2">
            <Link href={t.href} className="font-serif text-lg font-semibold underline">
              {t.title}
            </Link>
            <Badge tone={t.status === "open" ? "good" : "warn"}>{t.statusText}</Badge>
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            <span className="font-mono">{t.id}</span> · case version {t.version} · {t.policy || "No policy recorded"}
            {t.reviewDue && ` · review due ${t.reviewDue}`} · {t.audience.length ? t.audience.join(", ") : "Everyone signed in"} · {t.approved} published ·{" "}
            {t.pending} waiting
          </p>
          {t.course && (
            <p className="text-sm text-ink-muted">
              Home course: {t.course.title} ({t.course.status})
            </p>
          )}
          <p className="text-sm text-ink-muted">
            Case note approved by {[t.approval.owner, t.approval.clinical, t.approval.quality, t.approval.community].filter(Boolean).join(", ") || "nobody yet"}
            {t.approval.approvedOn && ` on ${t.approval.approvedOn}`}
          </p>
          {t.statusReason && <p className="mt-1 text-sm font-semibold">{t.statusReason}</p>}
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm font-semibold">
              Reason (shown on the thread)
              <input className={input} value={reason[t.id] ?? ""} maxLength={600} onChange={(e) => setReason({ ...reason, [t.id]: e.target.value })} />
            </label>
            {t.status !== "open" && (
              <button
                type="button"
                className={btn.primary}
                disabled={busy}
                onClick={() => act({ target: "thread", id: t.id, action: "reopen", reason: reason[t.id] ?? "" })}
              >
                Reopen
              </button>
            )}
            {t.status === "open" && (
              <button
                type="button"
                className={btn.secondary}
                disabled={busy || !reason[t.id]?.trim()}
                onClick={() => act({ target: "thread", id: t.id, action: "pause", reason: reason[t.id] })}
              >
                Pause for review
              </button>
            )}
            {t.status !== "archived" && (
              <button
                type="button"
                className={btn.secondary}
                disabled={busy || !reason[t.id]?.trim()}
                onClick={() => act({ target: "thread", id: t.id, action: "archive", reason: reason[t.id] })}
              >
                Archive
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Verified({ m, act, busy }: { m: Mod; act: (b: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const [who, setWho] = useState("");
  const [criterion, setCriterion] = useState("");
  const [reason, setReason] = useState<Record<string, string>>({});
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-muted">
        The “{VERIFIED_LABEL}” badge comes only from a grant recorded here, against a defined criterion. It’s never inferred from a job title or how popular
        someone’s posts are. Which roles count, and how badges are assigned, is for the Community and People &amp; Culture owners to confirm.
      </p>
      <form
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-line p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act({ target: "user", id: who, action: "verify", criterion })) {
            setWho("");
            setCriterion("");
          }
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Person
          <select className={input} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Choose…</option>
            {m.candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.role})
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm font-semibold">
          Verified criterion they meet
          <input className={input} value={criterion} maxLength={300} onChange={(e) => setCriterion(e.target.value)} />
        </label>
        <button type="submit" className={btn.primary} disabled={busy || !who || !criterion.trim()}>
          Grant the badge
        </button>
      </form>
      <ul className="flex flex-col gap-2">
        {!m.verified.length && <li className="text-sm text-ink-muted">Nobody holds the badge yet. Seed responses carry the fictional seed label instead.</li>}
        {m.verified.map((v) => (
          <li key={v.userId} className="rounded-2xl border border-line p-3 text-sm">
            <p className="font-semibold">
              {v.name} · {v.label} {v.revokedAt ? `· withdrawn ${date(v.revokedAt)}: ${v.revokedReason}` : ""}
            </p>
            <p className="text-ink-muted">
              {v.criterion} · granted by {v.grantedBy} on {date(v.grantedAt)}
            </p>
            {!v.revokedAt && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <input
                  className={cx(input, "max-w-sm")}
                  aria-label={`Reason to withdraw ${v.name}’s badge`}
                  placeholder="Reason to withdraw"
                  value={reason[v.userId] ?? ""}
                  onChange={(e) => setReason({ ...reason, [v.userId]: e.target.value })}
                />
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={busy || !reason[v.userId]?.trim()}
                  onClick={() => act({ target: "user", id: v.userId, action: "unverify", reason: reason[v.userId] })}
                >
                  Withdraw the badge
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InsightsTab() {
  const ins = useApi<Insights>("/api/admin/case-threads?insights=1");
  if (ins.error) return <ErrorNote text={ins.error} />;
  if (!ins.data) return <p className="text-ink-muted">Loading…</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">{ins.data.note}</p>
      {ins.data.threads.map((t) => (
        <section key={t.id} className="rounded-2xl border border-line p-4">
          <h2 className="font-serif text-lg font-semibold">
            {t.title}{" "}
            <span className="text-sm font-normal text-ink-muted">
              · version {t.version} · {t.status}
            </span>
          </h2>
          <div className="mt-2 grid gap-4 md:grid-cols-3">
            <table className="text-sm">
              <caption className="text-left font-semibold">People (learners)</caption>
              <tbody>
                {(
                  [
                    ["started", "Started a draft"],
                    ["firstTake", "Submitted a first take"],
                    ["noteViewed", "Read the case note"],
                    ["peerViewed", "Read a peer approach"],
                    ["reflected", "Reflected"],
                    ["revised", "Saved a revised answer"],
                    ["completed", "Finished"],
                  ] as const
                ).map(([k, label]) => (
                  <tr key={k}>
                    <th scope="row" className="pr-3 text-left font-normal">
                      {label}
                    </th>
                    <td className="tabular-nums">{t.learners[k]}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="pr-3 text-left font-normal">
                    Different responses read (average)
                  </th>
                  <td className="tabular-nums">{t.viewpoints ?? "fewer than 5 readers"}</td>
                </tr>
              </tbody>
            </table>
            <table className="text-sm">
              <caption className="text-left font-semibold">Activity</caption>
              <tbody>
                {(
                  [
                    ["votes", "Helpful marks (net)"],
                    ["comments", "Comments sent"],
                    ["scriptSaves", "Scripts saved"],
                    ["shares", "Responses shared"],
                    ["reports", "Reports"],
                    ["liveInterrupts", "Live-incident interrupts shown"],
                  ] as const
                ).map(([k, label]) => (
                  <tr key={k}>
                    <th scope="row" className="pr-3 text-left font-normal">
                      {label}
                    </th>
                    <td className="tabular-nums">{t.activity[k]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="text-sm">
              <caption className="text-left font-semibold">Moderation</caption>
              <tbody>
                <tr>
                  <th scope="row" className="pr-3 text-left font-normal">
                    Waiting now
                  </th>
                  <td className="tabular-nums">{t.moderation.waiting}</td>
                </tr>
                <tr>
                  <th scope="row" className="pr-3 text-left font-normal">
                    Decided
                  </th>
                  <td className="tabular-nums">{t.moderation.decided}</td>
                </tr>
                <tr>
                  <th scope="row" className="pr-3 text-left font-normal">
                    Median hours to a decision
                  </th>
                  <td className="tabular-nums">{t.moderation.medianHoursToDecision ?? "none yet"}</td>
                </tr>
                <tr>
                  <th scope="row" className="pr-3 text-left font-normal">
                    Flagged by screening
                  </th>
                  <td className="tabular-nums">{t.moderation.flaggedShare === null ? "none yet" : `${t.moderation.flaggedShare}%`}</td>
                </tr>
                <tr>
                  <th scope="row" className="pr-3 text-left font-normal">
                    Archived as outdated
                  </th>
                  <td className="tabular-nums">{t.moderation.archivedAsOutdated}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {!ins.data.threads.length && <p className="text-ink-muted">No case threads yet.</p>}
    </div>
  );
}
