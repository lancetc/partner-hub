"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { STATES } from "@/lib/notes";
import {
  cellText,
  CONSENTS,
  PROPOSAL_OUTPUTS,
  PROPOSAL_STATUS,
  REPLY_LABELS,
  TOOLS,
  type ConsentKey,
  type ProposalOutput,
  type ToolId,
} from "@/lib/businessNotes";
import type { businessInsights, businessLibrary } from "@/server/businessNotes";
import { MentorCard, type CardView } from "../notes/MentorCard";
import { AdminShell, Badge, btn, ErrorNote, input } from "./ui";

/*
  Business Field Notes for editors (docs/business-field-notes.md): the story queue, the review steps (editorial,
  privacy and commercial, subject matter), cards and their dated check-ins, Community moderation, playbook proposals
  (to the Problem desk) and aggregate insights with the Excel export. Every decision is recorded against the editor
  who made it. Readers' private thoughts and plans never appear here.
*/

type Lib = ReturnType<typeof businessLibrary>;
type Row = Lib["notes"][number];
type Insights = ReturnType<typeof businessInsights>;
const TABS = {
  queue: "Story queue",
  review: "Review",
  cards: "Cards and chapters",
  community: "Community",
  proposals: "Playbook proposals",
  insights: "Insights",
} as const;
type Tab = keyof typeof TABS;
const tone = (s: string) =>
  s === "reviewed" || s === "endorsed" || s === "published"
    ? "good"
    : s === "needs_review" || s === "changes"
      ? "warn"
      : s === "withdrawn" || s === "declined"
        ? "bad"
        : "info";

export function BusinessNotesAdmin() {
  const lib = useApi<Lib>("/api/admin/business-notes");
  const [tab, setTab] = useState<Tab>("queue");
  const [problem, setProblem] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (body: Record<string, unknown>, done = "Done.") => {
    setBusy(true);
    setProblem([]);
    setStatus("");
    try {
      const r = await fetch("/api/admin/business-notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw Object.assign(new Error(j.error), { problems: j.problems });
      lib.reload();
      setStatus(done);
      return true;
    } catch (e) {
      setProblem((e as { problems?: string[] }).problems ?? [(e as Error).message]);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const ask = (q: string, body: Record<string, unknown>, done?: string) => {
    const reason = window.prompt(q);
    if (reason) void act({ ...body, reason }, done);
  };

  if (lib.error)
    return (
      <AdminShell title="Business Field Notes">
        <ErrorNote text={lib.error} />
      </AdminShell>
    );
  if (!lib.data)
    return (
      <AdminShell title="Business Field Notes">
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  const { notes, community } = lib.data;
  const counts: Record<Tab, number> = {
    queue: notes.filter((n) => ["draft", "submitted", "changes"].includes(n.latest.state)).length,
    review: notes.filter((n) => ["submitted", "needs_review"].includes(n.latest.state)).length,
    cards: notes.filter((n) => n.published).length,
    community: community.held.length + community.reported.length + community.unanswered.length,
    proposals: lib.data.proposals.length,
    insights: 0,
  };

  return (
    <AdminShell title="Business Field Notes">
      <p className="max-w-3xl text-ink-muted">
        The principal-only business edition of Notes to a Younger Me. Cards are peer experience: never badge a story as approved. Fictional seeds are for
        development and must be replaced with consented, reviewed contributions before launch.
      </p>
      <div role="tablist" aria-label="Business Field Notes" className="mt-4 flex flex-wrap gap-1 border-b border-line">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            className={cx("min-h-11 rounded-t-xl px-4 font-semibold", tab === t ? "bg-surface ring-1 ring-line" : "text-ink-muted hover:bg-muted")}
            onClick={() => setTab(t)}
          >
            {TABS[t]}
            {counts[t] > 0 && <span className="ml-1.5 rounded-full bg-muted px-2 text-xs">{counts[t]}</span>}
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-6 text-sm">
        {status}
      </p>
      {problem.length > 0 && <ErrorNote text={problem.join(" ")} />}
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-3">
        {tab === "queue" && <Queue notes={notes} act={act} ask={ask} busy={busy} />}
        {tab === "review" && <Review notes={notes} act={act} ask={ask} busy={busy} />}
        {tab === "cards" && <Cards notes={notes} act={act} ask={ask} busy={busy} />}
        {tab === "community" && <Community lib={lib.data} act={act} ask={ask} busy={busy} />}
        {tab === "proposals" && <Proposals lib={lib.data} act={act} busy={busy} />}
        {tab === "insights" && <InsightsPanel />}
      </div>
    </AdminShell>
  );
}

type Acts = {
  act: (b: Record<string, unknown>, done?: string) => Promise<boolean>;
  ask: (q: string, b: Record<string, unknown>, done?: string) => void;
  busy: boolean;
};

function Head({ n }: { n: Row }) {
  const d = n.latest.data;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={tone(n.latest.state)}>{STATES[n.latest.state]}</Badge>
      {n.published && n.published.version !== n.latest.version && <Badge tone="good">v{n.published.version} published</Badge>}
      {d.illustrative ? <Badge tone="warn">Fictional seed</Badge> : <Badge tone="info">Contributed</Badge>}
      <span className="font-serif text-lg font-semibold">{d.hook}</span>
      <span className="text-sm text-ink-muted">
        {n.latest.id} · v{n.latest.version} · {d.authorName}
      </span>
    </div>
  );
}

function ConsentSummary({ n }: { n: Row }) {
  const c = n.consent;
  return (
    <p className="mt-1 text-sm">
      <span className="font-semibold">Consent:</span> text and audience {c.textAudience ? "yes" : "no"} · shown as “{c.attribution}” ·{" "}
      {(Object.keys(CONSENTS) as ConsentKey[]).map((k) => `${CONSENTS[k].replace(/^A |^An /, "")}: ${c[k] ? "yes" : "no"}`).join(" · ")}
    </p>
  );
}

function Flags({ n }: { n: Row }) {
  const s = n.screen;
  return (
    <>
      {(s.identifying.length > 0 || s.commercial.length > 0 || s.urgent) && (
        <p className="mt-1 rounded-xl bg-[#fff1cc] p-2 text-sm text-[#4a3400]">
          Screen raised: {[...(s.urgent ? ["possible live incident"] : []), ...s.identifying, ...s.commercial].join("; ")}. A screen is a question for a person,
          never a finding.
        </p>
      )}
      {n.problems.length > 0 && <p className="mt-1 text-sm text-danger">Incomplete: {n.problems.join(" ")}</p>}
    </>
  );
}

function Queue({ notes, act, ask, busy }: { notes: Row[] } & Acts) {
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  return (
    <ul className="flex flex-col gap-3">
      {notes.map((n) => (
        <li key={n.latest.id} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <Head n={n} />
          <ConsentSummary n={n} />
          <Flags n={n} />
          {n.latest.data.business?.privateNote && (
            <p className="mt-1 text-sm">
              <span className="font-semibold">Private to editors:</span> {n.latest.data.business.privateNote}
            </p>
          )}
          {n.latest.data.business?.freeText && (
            <details className="mt-1 text-sm">
              <summary className="min-h-11 cursor-pointer content-center font-semibold">The contributor’s free writing</summary>
              <p className="whitespace-pre-line">{n.latest.data.business.freeText}</p>
            </details>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={btn.secondary} onClick={() => setPreview(preview === n.latest.id ? null : n.latest.id)}>
              {preview === n.latest.id ? "Hide preview" : "Placement preview"}
            </button>
            {n.latest.state !== "withdrawn" && (
              <button type="button" className={btn.secondary} onClick={() => setEditing(editing === n.latest.id ? null : n.latest.id)}>
                Edit wording
              </button>
            )}
            {n.latest.state === "submitted" && (
              <button
                type="button"
                className={btn.secondary}
                disabled={busy}
                onClick={() => ask("Why won’t it be published? (shown to the contributor)", { action: "decline", id: n.latest.id })}
              >
                Decline
              </button>
            )}
          </div>
          {preview === n.latest.id && (
            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,34rem)_1fr]">
              <MentorCard
                c={
                  {
                    ...n.latest,
                    label: "Peer experience · reviewed for the deck",
                    canCopy: true,
                    helpful: 0,
                    mineHelpful: false,
                    saved: false,
                    thread: "",
                    preview: true,
                  } as unknown as CardView
                }
                position="Preview"
                flipped={flipped}
                onFlip={setFlipped}
                preview
              />
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li>Business Field Notes deck: verified principals only.</li>
                <li>Its canonical discussion: {n.thread.id}.</li>
                <li>Pocket Deck: saved by principals, opens at the newest published version.</li>
                <li>Magazine business decks: {n.consent.crossFormat ? "allowed by the contributor" : "not allowed by the contributor"}.</li>
                <li>Search: principals only. Notifications: never the card’s words.</li>
              </ul>
            </div>
          )}
          {editing === n.latest.id && <Editor n={n} act={act} busy={busy} onDone={() => setEditing(null)} />}
        </li>
      ))}
    </ul>
  );
}

/** Editing a card's wording. A contributor's card waits for their approval; a seed goes back for review. */
function Editor({ n, act, busy, onDone }: { n: Row; act: Acts["act"]; busy: boolean; onDone: () => void }) {
  const d = n.latest.data;
  const b = d.business!;
  const [v, setV] = useState({
    hook: d.hook,
    scenario: d.scenario,
    note: d.note,
    phrase: d.phrase,
    decision: b.decision,
    choice: b.choice,
    believed: b.believed,
    tried: b.tried,
    failed: b.failed,
    tradeoff: b.tradeoff,
    era: b.era,
    context: b.context,
    ruleNote: b.ruleNote,
    historical: b.historical,
    toolIds: b.toolIds as ToolId[],
  });
  const text = (k: keyof typeof v, label: string, area = false) => (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold">{label}</span>
      {area ? (
        <textarea className={cx(input, "min-h-20 py-2")} value={String(v[k])} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
      ) : (
        <input className={input} value={String(v[k])} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
      )}
    </label>
  );
  return (
    <div className="mt-3 grid gap-3 rounded-2xl bg-bg p-3 ring-1 ring-line md:grid-cols-2">
      {text("hook", "Title")}
      {text("decision", "The decision")}
      {text("scenario", "The moment", true)}
      {text("choice", "Before you flip")}
      {text("believed", "What I believed then", true)}
      {text("tried", "What I tried", true)}
      {text("failed", "What didn’t work", true)}
      {text("tradeoff", "The trade-off", true)}
      {text("note", "Note to my younger self", true)}
      {text("phrase", "Try this", true)}
      {text("era", "When")}
      {text("context", "Broad context")}
      {text("ruleNote", "Current approved guidance it rests on (with source)")}
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" className="size-5" checked={v.historical} onChange={(e) => setV({ ...v, historical: e.target.checked })} />A programme rule has
        changed since: show as a historical story
      </label>
      <fieldset className="md:col-span-2">
        <legend className="text-sm font-semibold">Related Work Tools</legend>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(TOOLS) as ToolId[]).map((t) => (
            <label key={t} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="size-5"
                checked={v.toolIds.includes(t)}
                onChange={(e) => setV({ ...v, toolIds: e.target.checked ? [...v.toolIds, t].slice(0, 3) : v.toolIds.filter((x) => x !== t) })}
              />
              {TOOLS[t].title}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <button
          type="button"
          className={btn.primary}
          disabled={busy}
          onClick={async () => {
            const { hook, scenario, note, phrase, ...biz } = v;
            if (
              await act(
                { action: "edit", id: n.latest.id, data: { hook, scenario, note, phrase, business: biz } },
                n.contributed ? "Saved: waiting for the contributor’s OK." : "Saved: back for review.",
              )
            )
              onDone();
          }}
        >
          Save edits
        </button>
        <button type="button" className={btn.secondary} onClick={onDone}>
          Cancel
        </button>
        <p className="text-sm text-ink-muted">
          {n.contributed
            ? "A contributor approves substantive edits before anything is published."
            : "A published seed’s edit is a new version that goes back for review."}
        </p>
      </div>
    </div>
  );
}

function Review({ notes, act, ask, busy }: { notes: Row[] } & Acts) {
  const waiting = notes.filter((n) => ["submitted", "needs_review"].includes(n.latest.state));
  if (!waiting.length) return <p className="text-ink-muted">Nothing is waiting for review.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {waiting.map((n) => (
        <li key={n.latest.id} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <Head n={n} />
          <ConsentSummary n={n} />
          <Flags n={n} />
          {n.flags.length > 0 && (
            <ul className="mt-1 text-sm">
              {n.flags.slice(0, 5).map((f, i) => (
                <li key={i}>
                  {f.kind}: {f.reason}
                </li>
              ))}
            </ul>
          )}
          <ol className="mt-3 flex flex-col gap-2">
            {n.steps.map((s) => (
              <li key={s.step} className="flex flex-wrap items-center gap-2">
                <span className="min-w-56 font-semibold">{s.label}</span>
                {s.decision ? (
                  <Badge tone={s.decision.outcome === "pass" ? "good" : "warn"}>
                    {s.decision.outcome === "pass" ? "Passed" : `Concern: ${s.decision.note}`} · {s.decision.by_user} · {s.decision.at.slice(0, 10)}
                  </Badge>
                ) : (
                  <Badge>Not yet</Badge>
                )}
                <button
                  type="button"
                  className={btn.quiet}
                  disabled={busy}
                  onClick={() => void act({ action: "check", id: n.latest.id, step: s.step, outcome: "pass" }, `${s.label} passed.`)}
                >
                  Pass
                </button>
                <button
                  type="button"
                  className={btn.quiet}
                  disabled={busy}
                  onClick={() => ask("What’s the concern?", { action: "check", id: n.latest.id, step: s.step, outcome: "concern" })}
                >
                  Raise a concern
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-sm text-ink-muted">
            Commercial or legal questions you can’t settle go to the accountable commercial-policy owner. Don’t guess.
          </p>
          <button
            type="button"
            className={cx(btn.primary, "mt-2")}
            disabled={busy}
            onClick={() => void act({ action: "publish", id: n.latest.id }, "Published to principals.")}
          >
            Publish to principals
          </button>
        </li>
      ))}
    </ul>
  );
}

function Cards({ notes, act, ask, busy }: { notes: Row[] } & Acts) {
  const [adding, setAdding] = useState<string | null>(null);
  const [ch, setCh] = useState({ title: "", dated: "", whatChanged: "", nowThink: "", correction: false, correctionNote: "" });
  return (
    <ul className="flex flex-col gap-3">
      {notes.map((n) => (
        <li key={n.latest.id} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <Head n={n} />
          <p className="mt-1 text-sm">
            Thread {n.thread.id}: {n.thread.state}
            {n.thread.reason && ` (${n.thread.reason})`} · {n.thread.questions} question{n.thread.questions === 1 ? "" : "s"} · {n.thread.held} held
            {n.reviewDue && ` · review due ${n.reviewDue}`}
          </p>
          <p className="mt-1 text-sm">
            Tools: {n.tools.map((t) => `${t.title}${t.available ? "" : t.kind === "placeholder" ? " (planned, not built)" : " (not published)"}`).join(" · ")}
          </p>
          {n.stale.length > 0 && <p className="mt-1 rounded-xl bg-[#fff1cc] p-2 text-sm text-[#4a3400]">Stale-content checks: {n.stale.join(" ")}</p>}
          <p className="mt-1 text-sm text-ink-muted">
            Versions:{" "}
            {n.history.map((h) => `v${h.version} ${STATES[h.state as keyof typeof STATES] ?? h.state}${h.reviewedBy ? ` (${h.reviewedBy})` : ""}`).join(" · ")}
          </p>
          {n.chapters.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {n.chapters.map((c) => (
                <li key={`${c.number}-${c.version}`} className="flex flex-wrap items-center gap-2">
                  <Badge tone={tone(c.state)}>{c.state}</Badge>
                  Check-in {c.number} v{c.version}: {c.data.title} · dated {c.data.dated}
                  {c.data.correction && " · correction"}
                  {c.state === "submitted" && (
                    <button
                      type="button"
                      className={btn.quiet}
                      disabled={busy}
                      onClick={() => void act({ action: "chapter-publish", id: n.latest.id, number: c.number }, "Check-in published; followers told.")}
                    >
                      Publish check-in
                    </button>
                  )}
                  {c.state === "published" && (
                    <button
                      type="button"
                      className={btn.quiet}
                      disabled={busy}
                      onClick={() => ask("Why is this check-in withdrawn?", { action: "chapter-withdraw", id: n.latest.id, number: c.number })}
                    >
                      Withdraw check-in
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {n.latest.data.illustrative && (
              <button type="button" className={btn.secondary} onClick={() => setAdding(adding === n.latest.id ? null : n.latest.id)}>
                Add a check-in (seed)
              </button>
            )}
            {n.published && (
              <>
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={busy}
                  onClick={() => ask("Why does it need re-review? (a rule changed, say)", { action: "flag", id: n.latest.id })}
                >
                  Flag for re-review
                </button>
                <button
                  type="button"
                  className={btn.danger}
                  disabled={busy}
                  onClick={() => ask("Why is it withdrawn? (shown to anyone who saved it)", { action: "withdraw", id: n.latest.id })}
                >
                  Withdraw everywhere
                </button>
              </>
            )}
          </div>
          {adding === n.latest.id && (
            <div className="mt-3 grid gap-2 rounded-2xl bg-bg p-3 ring-1 ring-line md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold">Title</span>
                <input className={input} value={ch.title} onChange={(e) => setCh({ ...ch, title: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold">Dated</span>
                <input type="date" className={input} value={ch.dated} onChange={(e) => setCh({ ...ch, dated: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-sm font-semibold">What changed (fictional seed only)</span>
                <textarea className={cx(input, "min-h-20 py-2")} value={ch.whatChanged} onChange={(e) => setCh({ ...ch, whatChanged: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-sm font-semibold">What they think now</span>
                <textarea className={cx(input, "min-h-16 py-2")} value={ch.nowThink} onChange={(e) => setCh({ ...ch, nowThink: e.target.value })} />
              </label>
              <button
                type="button"
                className={btn.primary}
                disabled={busy}
                onClick={async () => {
                  if (await act({ action: "chapter-save", id: n.latest.id, data: ch }, "Check-in saved: waiting for review.")) setAdding(null);
                }}
              >
                Save check-in
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Community({ lib, act, ask, busy }: { lib: Lib } & Acts) {
  const c = lib.community;
  const [annotating, setAnnotating] = useState<string | null>(null);
  const [ann, setAnn] = useState({ text: "", sourceTitle: "", sourceHref: "" });
  const post = (p: (typeof c.held)[number], children?: React.ReactNode) => (
    <li key={p.id} className="rounded-2xl bg-surface p-3 ring-1 ring-line">
      <p className="text-sm text-ink-muted">
        {p.question ? "Question" : `Reply · ${REPLY_LABELS[p.label]}`} on {p.card} · {p.at.slice(0, 10)}
        {p.reports > 0 && ` · reported ${p.reports}×`}
        {p.owner && ` · with ${p.owner}`}
      </p>
      <p className="mt-1 whitespace-pre-line">{p.body}</p>
      {p.reason && <p className="mt-1 text-sm text-[#4a3400]">Held: {p.reason}</p>}
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </li>
  );
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="font-serif text-xl font-semibold">Held for review ({c.held.length})</h2>
        <p className="text-sm text-ink-muted">Possible identifying detail or commercially sensitive terms. The author sees why, and can edit or withdraw it.</p>
        <ul className="mt-2 flex flex-col gap-2">
          {c.held.map((p) =>
            post(
              p,
              <>
                <button type="button" className={btn.secondary} disabled={busy} onClick={() => void act({ action: "post-approve", postId: p.id }, "Posted.")}>
                  Post it
                </button>
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={busy}
                  onClick={() => ask("Why won’t it be posted? (shown to the author)", { action: "post-decline", postId: p.id })}
                >
                  Don’t post
                </button>
              </>,
            ),
          )}
        </ul>
      </section>
      <section>
        <h2 className="font-serif text-xl font-semibold">Reported ({c.reported.length})</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {c.reported.map((p) =>
            post(
              p,
              <>
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={busy}
                  onClick={() => ask("Why is it hidden? (shown to the author; the record is kept)", { action: "post-hide", postId: p.id })}
                >
                  Hide
                </button>
                {!p.question && (
                  <button
                    type="button"
                    className={btn.secondary}
                    disabled={busy}
                    onClick={() => ask("What changed?", { action: "mark-outdated", postId: p.id })}
                  >
                    Mark outdated
                  </button>
                )}
              </>,
            ),
          )}
        </ul>
      </section>
      <section>
        <h2 className="font-serif text-xl font-semibold">Unanswered questions ({c.unanswered.length})</h2>
        <p className="text-sm text-ink-muted">
          Ask an owner, improve the card, link an existing tool, or propose a playbook. Check existing guidance before commissioning anything new.
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {c.unanswered.map((p) =>
            post(
              p,
              <>
                <button type="button" className={btn.secondary} onClick={() => setAnnotating(annotating === p.id ? null : p.id)}>
                  Add approved guidance
                </button>
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={busy}
                  onClick={() => ask("Which accountable owner (a team) should answer?", { action: "route-owner", postId: p.id, owner: "" })}
                >
                  Send to an owner
                </button>
                {annotating === p.id && (
                  <div className="mt-2 grid w-full gap-2 rounded-2xl bg-bg p-3 ring-1 ring-line md:grid-cols-2">
                    <label className="flex flex-col gap-1 md:col-span-2">
                      <span className="text-sm font-semibold">The guidance (it appears as Approved Trilogy guidance, above every peer reply)</span>
                      <textarea className={cx(input, "min-h-20 py-2")} value={ann.text} onChange={(e) => setAnn({ ...ann, text: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-semibold">Current source title</span>
                      <input className={input} value={ann.sourceTitle} onChange={(e) => setAnn({ ...ann, sourceTitle: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-semibold">Source link (a Hub path or https)</span>
                      <input className={input} value={ann.sourceHref} onChange={(e) => setAnn({ ...ann, sourceHref: e.target.value })} />
                    </label>
                    <button
                      type="button"
                      className={btn.primary}
                      disabled={busy}
                      onClick={async () => {
                        if (await act({ action: "annotate", postId: p.id, ...ann }, "Approved guidance added.")) {
                          setAnnotating(null);
                          setAnn({ text: "", sourceTitle: "", sourceHref: "" });
                        }
                      }}
                    >
                      Add it
                    </button>
                  </div>
                )}
              </>,
            ),
          )}
        </ul>
      </section>
      <section>
        <h2 className="font-serif text-xl font-semibold">Threads</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {c.threads.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 ring-1 ring-line">
              <Badge tone={t.state === "open" ? "good" : "warn"}>{t.state}</Badge>
              <span className="font-semibold">{t.card}</span>
              {t.state === "open" ? (
                <>
                  <button
                    type="button"
                    className={btn.quiet}
                    disabled={busy}
                    onClick={() => ask("Why pause it? (shown to readers)", { action: "thread-pause", id: t.note_id })}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    className={btn.quiet}
                    disabled={busy}
                    onClick={() => {
                      const reason = window.prompt("Why close it? (shown to readers, e.g. a policy change)");
                      if (!reason) return;
                      const replacement = window.prompt("Link to the replacement source (optional, a Hub path or https)") ?? "";
                      void act({ action: "thread-close", id: t.note_id, reason, replacement }, "Closed.");
                    }}
                  >
                    Close
                  </button>
                </>
              ) : t.state !== "withdrawn" ? (
                <button type="button" className={btn.quiet} disabled={busy} onClick={() => void act({ action: "thread-reopen", id: t.note_id }, "Reopened.")}>
                  Reopen
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      {c.hidden.length > 0 && (
        <section>
          <h2 className="font-serif text-xl font-semibold">Hidden ({c.hidden.length})</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {c.hidden.map((p) =>
              post(
                p,
                <>
                  <button
                    type="button"
                    className={btn.secondary}
                    disabled={busy}
                    onClick={() => void act({ action: "post-restore", postId: p.id }, "Restored.")}
                  >
                    Restore
                  </button>
                </>,
              ),
            )}
          </ul>
        </section>
      )}
    </div>
  );
}

function Proposals({ lib, act, busy }: { lib: Lib; act: Acts["act"]; busy: boolean }) {
  const [form, setForm] = useState<{
    title: string;
    questionIds: string[];
    targetBehaviour: string;
    existingChecked: string;
    divergent: string;
    appliesWhere: string;
    output: ProposalOutput;
    owner: string;
  } | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="font-serif text-xl font-semibold">Recurring unanswered themes</h2>
        <p className="text-sm text-ink-muted">
          A proposal goes on the{" "}
          <Link href="/admin/problems" className="text-accent underline">
            Problem desk
          </Link>{" "}
          as a theme, with each question as a Community case. It’s never generated from the most-liked answer.
        </p>
        {lib.community.themes.length === 0 ? (
          <p className="mt-2 text-ink-muted">No unanswered questions.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {lib.community.themes.map((t) => (
              <li key={t.theme} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 ring-1 ring-line">
                <span className="font-semibold">{t.theme}</span>
                <span className="text-sm text-ink-muted">
                  {t.count} question{t.count === 1 ? "" : "s"} on {t.noteIds.length} card{t.noteIds.length === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() =>
                    setForm({
                      title: "",
                      questionIds: t.questionIds,
                      targetBehaviour: "",
                      existingChecked: "",
                      divergent: "",
                      appliesWhere: "",
                      output: "existing",
                      owner: "",
                    })
                  }
                >
                  Propose a playbook
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {form && (
        <section className="grid gap-2 rounded-2xl bg-bg p-4 ring-1 ring-line md:grid-cols-2">
          <h2 className="font-serif text-xl font-semibold md:col-span-2">New proposal ({form.questionIds.length} questions cited)</h2>
          {(
            [
              ["title", "The practice, in a sentence"],
              ["targetBehaviour", "Target behaviour"],
              ["existingChecked", "Existing Job Aids, Work Tools and policy checked first (required)"],
              ["divergent", "Where experiences differed"],
              ["appliesWhere", "Where it applies, and where it doesn’t"],
              ["owner", "Accountable owner (a team)"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-sm font-semibold">{label}</span>
              <input className={input} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Proposed output</span>
            <select className={input} value={form.output} onChange={(e) => setForm({ ...form, output: e.target.value as ProposalOutput })}>
              {Object.entries(PROPOSAL_OUTPUTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button
              type="button"
              className={btn.primary}
              disabled={busy}
              onClick={async () => {
                if (await act({ action: "proposal-create", ...form }, "Proposal opened on the Problem desk.")) setForm(null);
              }}
            >
              Open on the Problem desk
            </button>
            <button type="button" className={btn.secondary} onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}
      <section>
        <h2 className="font-serif text-xl font-semibold">Proposals</h2>
        {lib.proposals.length === 0 ? (
          <p className="text-ink-muted">None yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {lib.proposals.map((p) => (
              <li key={p.id} className="rounded-2xl bg-surface p-3 ring-1 ring-line">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={tone(p.status === "approved" || p.status === "done" ? "published" : p.status === "declined" ? "declined" : "submitted")}>
                    {p.statusText}
                  </Badge>
                  <span className="font-semibold">{p.title}</span>
                  <span className="text-sm text-ink-muted">
                    {PROPOSAL_OUTPUTS[(p.data.output as ProposalOutput) ?? "existing"]} · owner {String(p.data.owner || "not set")} · Problem desk theme{" "}
                    {p.theme_id}
                  </span>
                </div>
                <p className="mt-1 text-sm">Checked first: {String(p.data.existingChecked ?? "")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(Object.keys(PROPOSAL_STATUS) as (keyof typeof PROPOSAL_STATUS)[])
                    .filter((s) => s !== p.status)
                    .map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={btn.quiet}
                        disabled={busy}
                        onClick={() => {
                          const reason = s === "approved" || s === "declined" ? window.prompt("The owner’s decision, in a line") : "";
                          if (reason === null) return;
                          void act({ action: "proposal-status", proposalId: p.id, status: s, reason }, `Marked ${PROPOSAL_STATUS[s].toLowerCase()}.`);
                        }}
                      >
                        {PROPOSAL_STATUS[s]}
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number | null; max: number }) {
  return (
    <li className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-2 text-sm">
      <span>{label}</span>
      <span className="h-3 rounded-full bg-muted" aria-hidden>
        <span className="block h-3 rounded-full bg-action" style={{ width: `${value && max ? Math.round((value / max) * 100) : 0}%` }} />
      </span>
      <span className="font-semibold tabular-nums">{cellText(value)}</span>
    </li>
  );
}

function InsightsPanel() {
  const [range, setRange] = useState({ from: "", to: "" });
  const qs = new URLSearchParams(Object.entries(range).filter(([, v]) => v)).toString();
  const ins = useApi<Insights>(`/api/admin/business-notes?insights=1${qs ? `&${qs}` : ""}`);
  if (ins.error) return <ErrorNote text={ins.error} />;
  if (!ins.data) return <p className="text-ink-muted">Loading…</p>;
  const d = ins.data;
  const max = Math.max(1, d.eligible, ...d.funnel.map((f) => f.people ?? 0));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">From</span>
          <input type="date" className={input} value={range.from || d.range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">To</span>
          <input type="date" className={input} value={range.to || d.range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </label>
        <a className={btn.primary} href={`/api/admin/business-notes/export?from=${d.range.from}&to=${d.range.to}`}>
          Download Excel (aggregates)
        </a>
      </div>
      <p className="text-sm text-ink-muted">{d.note} No individual business, caseload, revenue or leaderboard is shown.</p>
      <section>
        <h2 className="font-serif text-xl font-semibold">Reach and the card → discussion → tool funnel</h2>
        <ul className="mt-2 flex flex-col gap-1.5">
          <Bar label="Eligible principals" value={d.eligible} max={max} />
          <Bar label="Opened the deck" value={d.reached} max={max} />
          {d.funnel.map((f) => (
            <Bar key={f.event} label={f.event.replace("business_", "").replace(/_/g, " ")} value={f.people} max={max} />
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-serif text-xl font-semibold">Participation by the card’s business stage</h2>
        <ul className="mt-2 flex flex-col gap-1.5">
          {d.byStage.map((s) => (
            <Bar key={s.stage} label={s.stage} value={s.people} max={max} />
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-serif text-xl font-semibold">Over time (people active each month)</h2>
        <ul className="mt-2 flex flex-col gap-1.5">
          {d.overTime.length ? (
            d.overTime.map((m) => <Bar key={m.month} label={m.month} value={m.people} max={max} />)
          ) : (
            <li className="text-ink-muted">No activity in range.</li>
          )}
        </ul>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="font-serif text-xl font-semibold">Conversation</h2>
          <ul className="mt-2 text-sm">
            <li>Questions: {d.conversation.questions}</li>
            <li>Replies posted: {d.conversation.replies}</li>
            <li>Held for review: {d.conversation.held}</li>
            <li>Unanswered: {d.conversation.unanswered}</li>
            <li>With an owner: {d.conversation.ownerReview}</li>
          </ul>
          {d.conversation.themes.length > 0 && (
            <p className="mt-1 text-sm">Unanswered themes: {d.conversation.themes.map((t) => `${t.theme} (${t.count})`).join(", ")}</p>
          )}
        </div>
        <div>
          <h2 className="font-serif text-xl font-semibold">Editorial health</h2>
          <ul className="mt-2 text-sm">
            <li>
              Cards: {d.editorial.cards} ({d.editorial.published} published, {d.editorial.illustrative} fictional seeds, {d.editorial.contributed} contributed)
            </li>
            <li>Withdrawn: {d.editorial.withdrawn}</li>
            <li>With stale-content flags: {d.editorial.stale}</li>
            <li>Published by stage: {d.editorial.byStage.map((s) => `${s.stage} ${s.cards}`).join(" · ")}</li>
            <li>Moderation: {d.moderation.map((m) => `${m.kind} ${m.n}`).join(" · ") || "none"}</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
