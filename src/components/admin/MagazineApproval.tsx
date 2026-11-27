"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate, formatDateTime } from "@/lib/format";
import { Badge, btn, ErrorNote, Field, input } from "./ui";
import { readEvents } from "./BuildProgress";
import { Icon } from "../Icon";

/*
  A Magazine course's review and publishing, in the editor, the same seven steps as a topic: where it is,
  the items flagged as needing verification (each signed off by the reviewer, saying what they confirmed),
  and what the signed-in person can do now. The rules live on the server (server/magazineApproval).
*/

type Stage = "draft" | "review" | "changes" | "compliance" | "approved" | "live";
type Flag = { blockId: string; pageId: string; where: string; note: string; signoff: { note: string; by: string; at: string } | null };
export type CourseApproval = {
  stage: Stage;
  stale: boolean;
  reviewRequired: boolean;
  published: number | null;
  submission: {
    by: string;
    byYou: boolean;
    at: string;
    note: string;
    reviewer: { id: string; name: string; area: string } | null;
    compliance: boolean;
  } | null;
  you: {
    reviewRole: "sme" | "compliance" | "publisher" | null;
    canSubmit: boolean;
    canRunAiReview: boolean;
    canReview: boolean;
    canApproveCompliance: boolean;
    canSignOff: boolean;
    canPublish: boolean;
    canWithdraw: boolean;
  };
  aiReview: {
    status: "done" | "skipped";
    summary: string;
    findings: { severity: "fix" | "check" | "good"; block: string; blockLabel: string; title: string; detail: string; suggestion: string }[];
    at: string;
    by: string;
  } | null;
  flags: Flag[];
  blocking: { check: string; blockId: string | null; pageId: string | null }[];
  reviewers: { id: string; name: string; role: "sme" | "compliance" | "publisher"; area: string }[];
  publishers: string[];
  history: { id: number; action: string; label: string; by: string; note: string; at: string }[];
};

const ROLE_LABEL = { sme: "Subject-matter expert", compliance: "Compliance", publisher: "Hub owner" } as const;
const textarea = "w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base leading-relaxed";
type StepState = "done" | "current" | "next" | "skipped";

/** The label on the editor's header button, by stage. */
export function approvalLabel(stage: Stage | undefined, reviewRequired = false) {
  if (!stage || stage === "draft") return reviewRequired ? "Submit for review" : "Review and publish";
  if (stage === "changes") return "Changes asked for";
  if (stage === "review") return "In review";
  if (stage === "compliance") return "With Compliance";
  if (stage === "approved") return "Publish";
  return "Published";
}

function steps(a: CourseApproval) {
  const order: Stage[] = ["draft", "review", "compliance", "approved", "live"];
  const at = a.stage === "changes" ? 1 : order.indexOf(a.stage);
  const s = (i: number): StepState => (at > i ? "done" : at === i ? "current" : "next");
  const reviewer = a.submission?.reviewer;
  const compliance = a.submission?.compliance ?? false;
  const signed = a.flags.filter((f) => f.signoff).length;
  return [
    { title: "Draft", who: "Author", state: (a.stage === "draft" || a.stage === "changes" ? "current" : "done") as StepState },
    {
      title: "Submit for review",
      who: reviewer ? `To ${reviewer.name}${reviewer.area ? `, ${reviewer.area}` : ""}` : "Author picks a subject-matter expert",
      state: (at >= 1 ? "done" : "next") as StepState,
    },
    {
      title: "AI pre-review",
      who: "Claude checks it against the course’s documents",
      state: (a.stage === "review" && !a.aiReview
        ? "current"
        : a.aiReview?.status === "skipped"
          ? "skipped"
          : a.aiReview || at > 1
            ? "done"
            : "next") as StepState,
      detail:
        a.aiReview?.status === "skipped" ? "Skipped" : a.aiReview ? `${a.aiReview.findings.filter((f) => f.severity !== "good").length} findings` : undefined,
    },
    {
      title: "Human review and sign-off",
      who: reviewer ? `${reviewer.name} signs off each item that needs verification` : "The reviewer signs off each item that needs verification",
      state: (a.stage === "changes" ? "current" : a.stage === "review" && !a.aiReview ? "next" : s(1)) as StepState,
      detail: a.flags.length ? `${signed} of ${a.flags.length} items signed off` : a.stage === "changes" ? "Changes asked for" : undefined,
    },
    {
      title: compliance ? "Approve, then Compliance" : "Approve",
      who: compliance ? "Reviewer, then Quality and Compliance" : "Reviewer. Compliance-sensitive courses also need Compliance.",
      state: (a.stage === "compliance" ? "current" : at >= 3 ? "done" : "next") as StepState,
    },
    {
      title: "Publish",
      who: a.publishers.length ? `Hub owner: ${a.publishers.join(", ")}` : "Hub owner",
      state: (a.stage === "approved" ? "current" : at >= 4 ? "done" : "next") as StepState,
    },
    { title: "Monitor", who: "Progress and where people stop, in the editor", state: (a.stage === "live" ? "current" : "next") as StepState },
  ];
}

/** A demo Hub's stand-in for reviewers' sign-offs (server/demoSignOff). */
export type DemoSignOffState = { enabled: boolean; signed: { by: string; byName: string; at: string } | null };

export function MagazineApproval({
  guideId,
  demo,
  onDemo,
  dirty,
  save,
  onPublished,
  onClose,
  onShowBlock,
}: {
  guideId: string;
  demo?: DemoSignOffState;
  /** The guide after its demo sign-off changed. */
  onDemo?: (guide: unknown) => void;
  dirty: boolean;
  /** Saves the editor's latest changes first, so what's submitted is what's on screen. */
  save: () => Promise<boolean>;
  onPublished: (guide: unknown) => void;
  onClose: () => void;
  onShowBlock: (pageId: string, blockId: string) => void;
}) {
  const url = `/api/admin/magazine/${guideId}/approval`;
  const { data, error, setData } = useApi<CourseApproval>(url);
  // The whole panel starts folded to its title and where the course is; open it to act.
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [compliance, setCompliance] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [skipNote, setSkipNote] = useState("");
  const [signNotes, setSignNotes] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  // Updates reach everyone by default; untick for a small fix that can wait for people mid-course.
  const [move, setMove] = useState(true);
  const [ai, setAi] = useState<{ running: boolean; text: string; error: string | null }>({ running: false, text: "", error: null });

  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="mt-4 text-ink-muted">Loading the review…</p>;
  const a = data;
  const quick = !a.reviewRequired;
  const open = a.flags.filter((f) => !f.signoff);
  const chosen = reviewer || a.submission?.reviewer?.id || "";
  const lastChanges = a.history.find((h) => h.action === "changes_requested");

  async function send(body: Record<string, unknown>, { saveFirst = false } = {}) {
    setProblem(null);
    if (saveFirst && dirty && !(await save())) return;
    setBusy(true);
    try {
      const r = await api<CourseApproval & { approval?: CourseApproval; guide?: unknown }>(url, { body });
      if (body.action === "publish" && r.approval) {
        setData(r.approval);
        onPublished(r.guide);
      } else setData(r);
      setNote("");
      if (body.action === "submit" && r.stage === "review" && r.you?.canRunAiReview) void runAi();
    } catch (e) {
      // The headline, then each reason the server gave (which sign-off is missing, which check failed), one per line.
      const err = e as Error & { problems?: string[] };
      setProblem([err.message, ...(err.problems ?? []).map((p) => `• ${p}`)].join("\n"));
    } finally {
      setBusy(false);
    }
  }

  async function runAi() {
    setAi({ running: true, text: "Starting…", error: null });
    try {
      const res = await fetch(`${url}/ai`, { method: "POST" });
      if (!res.ok || !res.headers.get("content-type")?.includes("ndjson")) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "The AI pre-review didn’t run.");
      }
      let failure: string | null = null;
      await readEvents<{ type: string; phase?: string; error?: string; approval?: CourseApproval }>(res, (e) => {
        if (e.type === "phase")
          setAi({
            running: true,
            error: null,
            text:
              e.phase === "reading"
                ? "Reading the course and its documents…"
                : e.phase === "writing"
                  ? "Checking each block against the documents…"
                  : "Checking its findings…",
          });
        else if (e.type === "error") failure = e.error ?? "The AI pre-review didn’t finish.";
        else if (e.type === "done" && e.approval) setData(e.approval);
      });
      if (failure) throw new Error(failure);
      setAi({ running: false, text: "", error: null });
    } catch (e) {
      setAi({ running: false, text: "", error: (e as Error).message });
    }
  }

  const submitForm = (
    <div className="flex flex-col gap-3">
      <Field label="Reviewer" hint="An internal subject-matter expert or designated reviewer. You can’t review your own course.">
        <select className={input} value={chosen} onChange={(e) => setReviewer(e.target.value)}>
          <option value="">Choose a reviewer</option>
          {a.reviewers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.area || ROLE_LABEL[r.role]}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-5 accent-[var(--color-action)]"
          checked={compliance ?? a.submission?.compliance ?? false}
          onChange={(e) => setCompliance(e.target.checked)}
        />
        <span>
          <span className="font-semibold">Compliance-sensitive</span>
          <span className="block text-ink-muted">Compliance or the policy owner approves it too, after the reviewer.</span>
        </span>
      </label>
      <Field label="Note for the reviewer" hint="Optional. What to look at closely, or what changed since last time.">
        <textarea rows={3} className={textarea} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <button
        type="button"
        className={cx(btn.primary, "self-start")}
        disabled={busy || !chosen}
        onClick={() => send({ action: "submit", reviewer: chosen, compliance: compliance ?? a.submission?.compliance ?? false, note }, { saveFirst: true })}
      >
        <Icon name="arrow-right" className="size-4" /> {a.stage === "changes" || a.stale ? "Submit again" : "Submit for review"}
      </button>
    </div>
  );

  const decision = (who: "reviewer" | "compliance") => (
    <div className="flex flex-col gap-3">
      <p>
        {who === "reviewer"
          ? "Check the course is accurate: its pages, scenarios, practice answers and links. Sign off each item that needs verification below, saying what you confirmed, then approve it or ask for changes."
          : "Check the course against policy and legislation, and the sign-offs below, then approve it or ask for changes."}
      </p>
      <Field label={who === "reviewer" ? "Your feedback" : "Compliance notes"} hint="Needed when you ask for changes. The author sees it straight away.">
        <textarea
          rows={3}
          className={textarea}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="For example: The incident page needs the after-hours number."
        />
      </Field>
      {who === "reviewer" && !a.submission?.compliance && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 accent-[var(--color-action)]"
            checked={compliance ?? false}
            onChange={(e) => setCompliance(e.target.checked)}
          />
          <span>
            <span className="font-semibold">Also needs Compliance approval</span>
            <span className="block text-ink-muted">For policy, legislation, funding or anything a regulator could ask about.</span>
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btn.primary}
          disabled={busy || open.length > 0}
          title={open.length ? "Sign off every item first" : undefined}
          onClick={() => send({ action: "decide", decision: "approve", note, compliance: compliance ?? false })}
        >
          <Icon name="check" className="size-4" /> Approve
        </button>
        <button
          type="button"
          className={btn.secondary}
          disabled={busy || note.trim().length < 2}
          onClick={() => send({ action: "decide", decision: "changes", note })}
        >
          Ask for changes
        </button>
      </div>
      {open.length > 0 && (
        <p className="text-sm text-ink-muted">
          {open.length} {open.length === 1 ? "item needs" : "items need"} signing off before you can approve.
        </p>
      )}
    </div>
  );

  const waiting = (who: string, since?: string) => (
    <div className="flex flex-col gap-3">
      <p>
        Waiting for <strong>{who}</strong>
        {since && ` since ${formatDateTime(since)}`}. Editing the course now means submitting it again.
      </p>
      {a.you.canWithdraw && (
        <button type="button" className={cx(btn.secondary, "self-start")} disabled={busy} onClick={() => send({ action: "withdraw" })}>
          Withdraw
        </button>
      )}
    </div>
  );

  const publishForm = (anyway: boolean) => (
    <div className="flex flex-col gap-3">
      {a.blocking.length > 0 && (
        <details className={cx("rounded-2xl p-3 text-sm", anyway ? "bg-gold/15" : "bg-[#fdf1f0] dark:bg-[#3a1f1f]")} open={!anyway}>
          <summary className="cursor-pointer font-semibold">
            {anyway
              ? `${a.blocking.length} ${a.blocking.length === 1 ? "check hasn’t" : "checks haven’t"} passed. Publish anyway publishes it as it is.`
              : "These have to be fixed before it can be published:"}
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {a.blocking.map((c) => (
              <li key={c.check} className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 gap-2">
                  <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-danger" /> {c.check}
                </span>
                {c.blockId && c.pageId && (
                  <button type="button" className={cx(btn.quiet, "min-h-8 shrink-0 px-2 text-xs")} onClick={() => onShowBlock(c.pageId!, c.blockId!)}>
                    Show it
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {anyway && open.length > 0 && (
        <p className="rounded-2xl bg-gold/15 p-3 text-sm">
          <strong>
            {open.length} {open.length === 1 ? "item isn’t" : "items aren’t"} verified yet.
          </strong>{" "}
          Publishing anyway puts them in front of learners as they are, and the course’s history records which ones.
        </p>
      )}
      {demo?.enabled && <DemoSignOffBox guideId={guideId} demo={demo} onChange={(g) => onDemo?.(g)} />}
      <Field label="What changed (optional)" hint="Shown in the course’s edition history.">
        <input
          className={input}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={400}
          placeholder={a.published ? "" : "First edition"}
        />
      </Field>
      {a.published ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-action)]" checked={move} onChange={(e) => setMove(e.target.checked)} />
          <span>
            <strong>Move everyone onto this edition</strong> (recommended): people part-way through edition {a.published} switch to this one. Untick for a small
            fix that can wait until they finish. Completions are kept either way.
          </span>
        </label>
      ) : null}
      <button
        type="button"
        className={cx(btn.primary, "self-start")}
        disabled={busy || (!anyway && a.blocking.length > 0)}
        onClick={() => send({ action: "publish", summary, moveLearners: move, anyway }, { saveFirst: true })}
      >
        <Icon name="check" className="size-4" /> {busy ? "Publishing…" : anyway && (open.length || a.stage !== "approved") ? "Publish anyway" : "Publish"}
      </button>
    </div>
  );

  let title = "";
  let body: React.ReactNode = null;
  if (a.stage === "draft") {
    title = a.stale ? "Edited since it was submitted" : "Ready for review?";
    body = (
      <>
        {a.stale ? (
          <p className="mb-3 rounded-xl bg-gold/15 px-3 py-2 text-sm">
            The course changed after it went to {a.submission?.reviewer?.name ?? "the reviewer"}, so that review no longer counts. Submit it again when you’re
            ready.
          </p>
        ) : (
          <p className="mb-3 text-ink-muted">
            {quick
              ? "Send it to a reviewer, who signs off each item that needs verification. (For this demo you can also skip the review and publish: see below.)"
              : "Send it to a reviewer. It can’t be published until it’s approved."}
          </p>
        )}
        {submitForm}
      </>
    );
  } else if (a.stage === "changes") {
    title = "Changes asked for";
    body = (
      <>
        {lastChanges && (
          <blockquote className="mb-4 rounded-xl border-l-4 border-gold bg-gold/10 px-4 py-3">
            <p className="whitespace-pre-line">{lastChanges.note}</p>
            <footer className="mt-1 text-sm text-ink-muted">
              {lastChanges.by}, {formatDateTime(lastChanges.at)}
            </footer>
          </blockquote>
        )}
        <p className="mb-3 text-ink-muted">Make the changes, then submit it again.</p>
        {submitForm}
      </>
    );
  } else if (a.stage === "review" && !a.aiReview) {
    title = "AI pre-review";
    body = (
      <div className="flex flex-col gap-3">
        <p>
          Before {a.submission?.reviewer?.name ?? "the reviewer"} reads it, Claude checks every block against the course’s documents: facts, contacts, practice
          answers and the flagged items. Its findings go to the reviewer, who decides.
        </p>
        {ai.running ? (
          <p className="flex items-center gap-2 font-semibold" role="status">
            <span className="size-4 animate-spin rounded-full border-2 border-action border-t-transparent" aria-hidden /> {ai.text}
          </p>
        ) : (
          a.you.canRunAiReview && (
            <button type="button" className={cx(btn.primary, "self-start")} onClick={() => void runAi()}>
              <Icon name="spark" className="size-4" /> {ai.error ? "Try the AI pre-review again" : "Run the AI pre-review"}
            </button>
          )
        )}
        {ai.error && <ErrorNote text={ai.error} />}
        {a.you.canRunAiReview && !ai.running && (
          <details className="rounded-xl border border-line p-3 text-sm" open={Boolean(ai.error)}>
            <summary className="cursor-pointer font-semibold">Skip it and go straight to the reviewer</summary>
            <Field label="Why (optional)" hint="Kept in the course’s history.">
              <input
                className={input}
                value={skipNote}
                onChange={(e) => setSkipNote(e.target.value)}
                placeholder="For example: Claude isn’t connected on this server."
              />
            </Field>
            <button type="button" className={cx(btn.secondary, "mt-2")} disabled={busy} onClick={() => send({ action: "ai_skip", note: skipNote })}>
              Skip the AI pre-review
            </button>
          </details>
        )}
        {!a.you.canRunAiReview && <p className="text-ink-muted">Waiting for the AI pre-review. The author or the Hub owner runs it.</p>}
      </div>
    );
  } else if (a.stage === "review") {
    title = a.you.canReview ? "Your review" : "In review";
    body = a.you.canReview ? decision("reviewer") : waiting(a.submission?.reviewer?.name ?? "the reviewer", a.submission?.at);
  } else if (a.stage === "compliance") {
    title = a.you.canApproveCompliance ? "Compliance approval" : "With Compliance";
    body = a.you.canApproveCompliance ? decision("compliance") : waiting("Quality and Compliance");
  } else if (a.stage === "approved") {
    title = a.you.canPublish ? "Approved: ready to publish" : "Approved";
    body = a.you.canPublish ? publishForm(false) : waiting(a.publishers.join(" or ") || "the Hub owner");
  } else {
    title = a.published ? `Edition ${a.published} is live` : "Published";
    body = <p className="text-ink-muted">Learners in its audience are reading it. Edit the course to start the next edition’s review.</p>;
  }

  return (
    <section aria-label="Review and publish" className="mt-4 rounded-3xl border-2 border-action bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((x) => !x)}
            className="group flex w-full min-w-0 items-center gap-3 rounded-xl text-left"
          >
            <span className="font-serif text-2xl font-semibold">Review and publish</span>
            {!expanded && <span className="truncate text-base font-semibold text-ink-muted">· {title}</span>}
            <Icon name="chevron-down" className={cx("size-5 shrink-0 text-ink-muted transition-transform group-hover:text-ink", expanded && "rotate-180")} />
          </button>
        </h2>
        <div className="flex items-center gap-2">
          {a.you.reviewRole && <Badge tone="info">You: {ROLE_LABEL[a.you.reviewRole]}</Badge>}
          <button type="button" className={btn.quiet} onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            {quick && a.you.canPublish && a.stage !== "approved" && (
              <section className="rounded-3xl border-2 border-dashed border-action bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-serif text-xl font-semibold">Skip the review and publish</h3>
                  <Badge tone="warn">Demo</Badge>
                </div>
                <p className="mb-4 mt-1 text-ink-muted">
                  The review steps work as they would for real, but for this demo they don’t hold anything up: you can publish the saved draft now, at any step.
                  With review switched on, it would wait for the reviewer’s sign-off and the Hub owner.
                </p>
                {publishForm(true)}
              </section>
            )}
            {/* The review step, folded under its title until it's wanted (open when something went wrong). */}
            <details open={Boolean(problem)} className="group rounded-3xl border border-line bg-surface p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <h3 className="font-serif text-xl font-semibold">{title}</h3>
                <Icon name="chevron-down" className="size-5 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              {a.submission && a.stage !== "draft" && (
                <p className="mt-1 text-sm text-ink-muted">
                  Submitted by {a.submission.byYou ? "you" : a.submission.by} on {formatDate(a.submission.at)}
                  {a.submission.compliance && " · compliance-sensitive"}
                </p>
              )}
              {a.submission?.note && (a.stage === "review" || a.stage === "compliance") && (
                <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm">
                  <span className="font-semibold">Note from {a.submission.by}:</span> {a.submission.note}
                </p>
              )}
              <div className="mt-4">{body}</div>
              {problem && (
                <div className="mt-3">
                  <ErrorNote text={problem} />
                </div>
              )}
            </details>

            {a.flags.length > 0 && (
              // Folded away until it's wanted: open for a reviewer, who signs each one off.
              <details open={a.you.canSignOff} className="group rounded-3xl border border-line bg-surface p-5" aria-labelledby="verify-heading">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                  <h3 id="verify-heading" className="font-serif text-xl font-semibold">
                    Needs verification
                  </h3>
                  <span className="ml-auto flex items-center gap-2 text-sm font-semibold text-ink-muted">
                    {a.flags.length - open.length} of {a.flags.length} signed off
                    <Icon name="chevron-down" className="size-5 transition-transform group-open:rotate-180" />
                  </span>
                </summary>
                <p className="mt-1 text-sm text-ink-muted">
                  {a.you.canSignOff
                    ? "Check each one against policy or with the owner, then sign it off with what you confirmed. If the course needs to say something different, ask for changes."
                    : quick
                      ? "The reviewer signs off each one, saying what they confirmed. While review is optional they don’t stop you publishing: Publish anyway records which weren’t verified."
                      : "The reviewer signs off each one, saying what they confirmed. A signed-off item no longer holds up publishing."}
                </p>
                <ol className="mt-3 flex flex-col gap-2">
                  {a.flags.map((f) => (
                    <li
                      key={f.blockId}
                      className={cx("rounded-2xl border-l-4 p-3", f.signoff ? "border-[#2f8f5b] bg-[#e9f6ef] dark:bg-[#17301f]" : "border-gold bg-gold/10")}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-sm">
                          <span className="font-semibold">{f.where}</span>
                          <span className="block">{f.note}</span>
                        </p>
                        <button type="button" className={cx(btn.quiet, "min-h-8 px-2 text-xs")} onClick={() => onShowBlock(f.pageId, f.blockId)}>
                          Show it
                        </button>
                      </div>
                      {f.signoff ? (
                        <div className="mt-2 flex flex-wrap items-start justify-between gap-2 text-sm">
                          <p className="min-w-0 flex-1">
                            <Icon name="circle-check" className="mr-1 inline size-4 text-[#2f8f5b]" />
                            <strong>Signed off</strong> by {f.signoff.by}, {formatDateTime(f.signoff.at)}: {f.signoff.note}
                          </p>
                          {a.you.canSignOff && (
                            <button
                              type="button"
                              className={cx(btn.quiet, "min-h-8 px-2 text-xs")}
                              disabled={busy}
                              onClick={() => send({ action: "signoff", blockId: f.blockId, remove: true })}
                            >
                              Undo
                            </button>
                          )}
                        </div>
                      ) : a.you.canSignOff ? (
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <label className="min-w-0 flex-1 text-sm">
                            <span className="sr-only">What you confirmed for {f.where}</span>
                            <input
                              className={cx(input, "min-h-10")}
                              placeholder="What you confirmed, and how (Confirmed with Operations: …)"
                              value={signNotes[f.blockId] ?? ""}
                              onChange={(e) => setSignNotes((n) => ({ ...n, [f.blockId]: e.target.value }))}
                            />
                          </label>
                          <button
                            type="button"
                            className={btn.secondary}
                            disabled={busy || (signNotes[f.blockId] ?? "").trim().length < 2}
                            onClick={() => send({ action: "signoff", blockId: f.blockId, note: signNotes[f.blockId] })}
                          >
                            <Icon name="check" className="size-4" /> Sign off
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </details>
            )}

            {a.aiReview?.status === "done" && (
              <section className="rounded-3xl border border-line bg-surface p-5">
                <h3 className="font-serif text-xl font-semibold">AI pre-review</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {a.aiReview.by}, {formatDateTime(a.aiReview.at)}
                </p>
                <p className="mt-2">{a.aiReview.summary}</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {a.aiReview.findings.map((f, i) => (
                    <li key={i} className="rounded-2xl border border-line p-3 text-sm">
                      <p className="flex flex-wrap items-center gap-2">
                        <Badge tone={f.severity === "fix" ? "bad" : f.severity === "check" ? "warn" : "good"}>
                          {f.severity === "fix" ? "Fix" : f.severity === "check" ? "Check" : "Good"}
                        </Badge>
                        <span className="font-semibold">{f.title}</span>
                        <span className="text-ink-muted">· {f.blockLabel}</span>
                      </p>
                      {f.detail && <p className="mt-1">{f.detail}</p>}
                      {f.suggestion && <p className="mt-1 text-ink-muted">Suggestion: {f.suggestion}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="flex flex-col gap-5">
            {/* Folded to the step it's at; open it to see them all. */}
            <details className="group rounded-3xl border border-line bg-surface p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <h3 className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Approval steps</h3>
                  {(() => {
                    const all = steps(a);
                    const i = all.findIndex((s) => s.state === "current");
                    return i >= 0 ? (
                      <span className="mt-1 block text-sm font-semibold">
                        Step {i + 1} of {all.length}: {all[i].title}
                      </span>
                    ) : null;
                  })()}
                </div>
                <Icon name="chevron-down" className="size-5 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              {quick && <p className="mt-2 text-sm text-ink-muted">Shown as they run for real. In this demo you can publish at any step.</p>}
              <ol className="mt-3 flex flex-col">
                {steps(a).map((s, i, all) => (
                  <li key={s.title} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < all.length - 1 && <span aria-hidden className="absolute left-[0.6875rem] top-6 h-[calc(100%-1rem)] w-0.5 bg-line" />}
                    <span
                      aria-hidden
                      className={cx(
                        "relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2",
                        s.state === "done" && "border-action bg-action text-on-action",
                        s.state === "current" && "border-action bg-tealtint",
                        s.state === "next" && "border-line-strong bg-surface",
                        s.state === "skipped" && "border-dashed border-line-strong bg-muted",
                      )}
                    >
                      {s.state === "done" && <Icon name="check" className="size-3.5" />}
                      {s.state === "current" && <span className="size-2 rounded-full bg-action" />}
                    </span>
                    <span className="min-w-0">
                      <span className={cx("block font-semibold", s.state === "skipped" && "text-ink-muted")}>
                        {i + 1}. {s.title}
                        <span className="sr-only">
                          {" "}
                          ({s.state === "done" ? "done" : s.state === "current" ? "current step" : s.state === "skipped" ? "skipped" : "to come"})
                        </span>
                      </span>
                      <span className="block text-sm text-ink-muted">{s.who}</span>
                      {"detail" in s && s.detail && <span className="mt-0.5 block text-xs font-semibold text-warm">{s.detail}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </details>

            {a.history.length > 0 && (
              <section className="rounded-3xl border border-line bg-surface p-5">
                <h3 className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">History</h3>
                <ul className="mt-3 flex max-h-96 flex-col gap-3 overflow-y-auto pr-1">
                  {a.history.map((h) => (
                    <li key={h.id} className="text-sm">
                      <p>
                        <span className="font-semibold">{h.label}</span>{" "}
                        <span className="text-ink-muted">
                          · {h.by}, {formatDateTime(h.at)}
                        </span>
                      </p>
                      {h.note && <p className="mt-0.5 whitespace-pre-line text-ink-muted">{h.note}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
  Demo sign-off, in a demo Hub only: lets a superadmin publish a course whose labs, scenes, case threads or other
  blocks are waiting on named reviewers. It's recorded as a demo sign-off, never as a review: in the audit log, and
  on each edition published under it (server/demoSignOff).
*/
function DemoSignOffBox({ guideId, demo, onChange }: { guideId: string; demo: DemoSignOffState; onChange: (guide: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = async (on: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await api<{ guide: unknown }>(`/api/admin/magazine/${guideId}`, { body: { action: "demo-signoff", on } });
      onChange(r.guide);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const s = demo.signed;
  return (
    <div className="rounded-2xl border-2 border-dashed border-line-strong p-3 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="flag" className="size-4 shrink-0" /> Demo sign-off
      </p>
      {s ? (
        <p className="mt-1">
          Recorded by <strong>{s.byName}</strong> on {formatDateTime(s.at)}. Blocks waiting on reviewers’ sign-offs can be published. It isn’t a review.
        </p>
      ) : (
        <p className="mt-1 text-ink-muted">
          This is a demo Hub. If blocks here are waiting on reviewers’ sign-offs (a lab, a Spot the Hazard scene, a case thread), a superadmin can record a demo
          sign-off to publish the course for a demonstration. It’s off on Trilogy Care’s servers.
        </p>
      )}
      <button type="button" className={cx(btn.secondary, "mt-2 min-h-10")} disabled={busy} onClick={() => set(!s)}>
        {busy ? "Saving…" : s ? "Remove the demo sign-off" : "Record a demo sign-off"}
      </button>
      {problem && (
        <p role="alert" className="mt-2 text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
