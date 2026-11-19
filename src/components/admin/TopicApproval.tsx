"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { cx, formatDate, formatDateTime } from "@/lib/format";
import { Badge, btn, ErrorNote, Field, input } from "./ui";
import { readEvents } from "./BuildProgress";
import { Icon } from "../Icon";

/*
  The topic's approval, in the editor: where it is in the seven steps from draft to live, and what the
  signed-in person can do about it now (submit, review, approve for Compliance, publish). The rules
  live on the server (server/topicApproval); this shows them and sends the decisions.
*/

export type ApprovalStage = "draft" | "review" | "changes" | "compliance" | "approved" | "live";
export type Approval = {
  stage: ApprovalStage;
  stale: boolean;
  /** False while the review is optional: any author can publish the saved draft straight away. */
  reviewRequired: boolean;
  state: "unpublished" | "live" | "changes";
  version: string;
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
    canReview: boolean;
    canApproveCompliance: boolean;
    canPublish: boolean;
    canWithdraw: boolean;
    canRunAiReview: boolean;
  };
  /** Step 3 for the submitted draft: Claude's findings, or skipped; null while it's still to do. */
  aiReview: {
    status: "done" | "skipped";
    summary: string;
    findings: { severity: "fix" | "check" | "good"; card: string; cardLabel: string; title: string; detail: string; suggestion: string }[];
    at: string;
    by: string;
  } | null;
  reviewers: { id: string; name: string; role: "sme" | "compliance" | "publisher"; area: string }[];
  publishers: string[];
  history: { id: number; action: string; label: string; by: string; note: string; version: string | null; at: string }[];
  monitor: { reviewDate: string | null; reviewStatus: "overdue" | "due" | "ok" | null; reviewDays: number | null; owner: string | null; openReports: number };
};
type Published = { version: string; status: { state: "unpublished" | "live" | "changes"; version: string; updatedAt: string | null; publishedAt: string | null } };

/**
  The label on the editor's header button, by stage. It follows the review steps even while review is
  optional (the demo), where "Publish anyway" sits beside them.
*/
export function approvalButton(a: Approval | null) {
  if (!a) return "Submit for review";
  if (a.stage === "draft") return a.stale ? "Submit again" : "Submit for review";
  if (a.stage === "changes") return "Changes asked for";
  if (a.stage === "review") return a.you.canReview ? "Your review" : "In review";
  if (a.stage === "compliance") return a.you.canApproveCompliance ? "Your approval" : "With Compliance";
  if (a.stage === "approved") return a.you.canPublish || !a.reviewRequired ? "Publish" : "Approved";
  return "Published";
}

const ROLE_LABEL = { sme: "Subject-matter expert", compliance: "Compliance", publisher: "Hub owner" } as const;

type StepState = "done" | "current" | "next" | "skipped";

const aiCounts = (f: { severity: string }[]) => {
  const fix = f.filter((x) => x.severity === "fix").length;
  const check = f.filter((x) => x.severity === "check").length;
  return fix || check ? [fix && `${fix} to fix`, check && `${check} to check`].filter(Boolean).join(", ") : "Nothing to fix";
};

function steps(a: Approval) {
  const order: ApprovalStage[] = ["draft", "review", "compliance", "approved", "live"];
  const at = a.stage === "changes" ? 1 : order.indexOf(a.stage);
  const compliance = a.submission?.compliance ?? false;
  const s = (i: number): StepState => (at > i ? "done" : at === i ? "current" : "next");
  const reviewer = a.submission?.reviewer;
  return [
    { title: "Draft", who: "Author", state: (a.stage === "draft" || a.stage === "changes" ? "current" : "done") as StepState, detail: a.stage === "changes" ? "Making the changes asked for" : undefined },
    {
      title: "Submit for review",
      who: reviewer ? `To ${reviewer.name}${reviewer.area ? `, ${reviewer.area}` : ""}` : "Author picks a subject-matter expert",
      state: (at >= 1 ? "done" : "next") as StepState,
    },
    {
      title: "AI pre-review",
      who: "Claude checks it against the facts library and official sources",
      state: (a.stage === "review" && !a.aiReview ? "current" : a.aiReview?.status === "skipped" && at >= 1 ? "skipped" : at >= 1 && a.aiReview ? "done" : at > 1 ? "done" : "next") as StepState,
      detail:
        a.stage === "review" && !a.aiReview
          ? "Running now, or waiting to run"
          : a.aiReview?.status === "skipped"
            ? "Skipped"
            : a.aiReview
              ? aiCounts(a.aiReview.findings)
              : undefined,
    },
    {
      title: "Human review",
      who: reviewer ? reviewer.name : "Subject-matter expert",
      state: (a.stage === "changes" ? "current" : a.stage === "review" && !a.aiReview ? "next" : s(1)) as StepState,
      detail: a.stage === "changes" ? "Changes asked for" : undefined,
    },
    {
      title: compliance ? "Approve, then Compliance" : "Approve",
      who: compliance ? "Reviewer, then Quality and Compliance" : "Reviewer. Compliance-sensitive topics also need Compliance.",
      state: (a.stage === "compliance" ? "current" : at >= 3 ? "done" : "next") as StepState,
    },
    { title: "Publish", who: a.publishers.length ? `Hub owner: ${a.publishers.join(", ")}` : "Hub owner", state: (a.stage === "approved" ? "current" : at >= 4 ? "done" : "next") as StepState },
    { title: "Monitor and refresh", who: "Review dates, learner reports, policy changes", state: (a.stage === "live" ? "current" : "next") as StepState },
  ];
}

export function TopicApproval({
  slug,
  data,
  setData,
  error,
  dirty,
  save,
  onPublished,
  onComments,
}: {
  slug: string;
  data: Approval | null;
  setData: (a: Approval) => void;
  error: string | null;
  dirty: boolean;
  /** Saves the editor's latest changes first, so what's submitted is what's on screen. */
  save: () => Promise<boolean>;
  onPublished: (r: Published, important: boolean) => void;
  onComments: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // What went wrong, and whether it was publishing (shown in the Skip the review box) or a review step.
  const [problem, setProblem] = useState<{ text: string; publish: boolean } | null>(null);
  const [reviewer, setReviewer] = useState<string>("");
  const [compliance, setCompliance] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [important, setImportant] = useState(false);
  // The AI pre-review while it runs: what Claude is doing, or why it stopped.
  const [ai, setAi] = useState<{ running: boolean; text: string; error: string | null }>({ running: false, text: "", error: null });
  const [skipNote, setSkipNote] = useState("");

  async function runAi() {
    setAi({ running: true, text: "Starting…", error: null });
    try {
      const res = await fetch(`/api/admin/lessons/${encodeURIComponent(slug)}/approval/ai`, { method: "POST" });
      if (!res.ok || !res.headers.get("content-type")?.includes("ndjson")) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "The AI pre-review didn’t run.");
      }
      let failure: string | null = null;
      await readEvents<{ type: string; phase?: string; issues?: number; error?: string; approval?: Approval }>(res, (e) => {
        if (e.type === "phase")
          setAi({
            running: true,
            error: null,
            text:
              e.phase === "reading"
                ? "Reading the topic and the facts library…"
                : e.phase === "writing"
                  ? "Checking each card against the sources…"
                  : e.phase === "checking"
                    ? "Checking its findings…"
                    : "Tidying up its findings…",
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

  if (error) return <ErrorNote text={error} />;
  if (!data) return <p className="text-ink-muted">Loading the approval…</p>;
  const a = data;
  const lastChanges = a.history.find((h) => h.action === "changes_requested");
  const chosen = reviewer || a.submission?.reviewer?.id || "";

  async function send(body: Record<string, unknown>, { saveFirst = false } = {}) {
    setProblem(null);
    if (saveFirst && dirty && !(await save())) return;
    setBusy(true);
    try {
      const r = await api<Approval & { approval?: Approval } & Partial<Published>>(`/api/admin/lessons/${encodeURIComponent(slug)}/approval`, { body });
      if (body.action === "publish" && r.version && r.status && r.approval) {
        setData(r.approval);
        onPublished({ version: r.version, status: r.status }, important);
        setChangeNote("");
        setImportant(false);
      } else setData(r);
      setNote("");
      // Submitted: the AI pre-review starts straight away.
      if (body.action === "submit" && r.stage === "review" && r.you?.canRunAiReview) void runAi();
    } catch (e) {
      setProblem({ text: (e as Error).message, publish: body.action === "publish" });
    } finally {
      setBusy(false);
    }
  }

  const decision = (who: "reviewer" | "compliance") => (
    <div className="flex flex-col gap-3">
      <p>
        {who === "reviewer"
          ? "Check the topic is operationally accurate: the cards, scenarios, quiz answers and resources. Comment on individual cards, then approve it or ask for changes."
          : "Check the topic against policy and legislation, then approve it or ask for changes."}
      </p>
      <button type="button" className={cx(btn.secondary, "self-start")} onClick={onComments}>
        <Icon name="chat" className="size-4" /> Comment on cards
      </button>
      <Field label={who === "reviewer" ? "Your feedback" : "Compliance notes"} hint="Needed when you ask for changes. The author sees it straight away.">
        <textarea rows={4} className={textarea} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: The second scenario needs a safer option." />
      </Field>
      {who === "reviewer" && !a.submission?.compliance && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-5 accent-[var(--action)]" checked={compliance ?? false} onChange={(e) => setCompliance(e.target.checked)} />
          <span>
            <span className="font-semibold">Also needs Compliance approval</span>
            <span className="block text-ink-muted">For policy, legislation, funding or anything a regulator could ask about.</span>
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn.primary} disabled={busy} onClick={() => send({ action: "decide", decision: "approve", note, compliance: compliance ?? false })}>
          <Icon name="check" className="size-4" /> Approve
        </button>
        <button type="button" className={btn.secondary} disabled={busy || note.trim().length < 2} onClick={() => send({ action: "decide", decision: "changes", note })}>
          Ask for changes
        </button>
      </div>
    </div>
  );

  const submitForm = (
    <div className="flex flex-col gap-3">
      <Field label="Reviewer" hint="An internal subject-matter expert or designated reviewer. You can’t review your own topic.">
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
          className="mt-0.5 size-5 accent-[var(--action)]"
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

  // While review is optional, unsaved edits are saved first and published with the rest.
  const quick = !a.reviewRequired;
  const publishForm = (
    <div className="flex flex-col gap-3">
      <Field label="What changed in this version" hint="Kept in the version history. For an important change, learners see it too.">
        <textarea
          rows={3}
          className={textarea}
          value={changeNote}
          onChange={(e) => setChangeNote(e.target.value)}
          placeholder="For example: Updated the example rate and the worked amounts."
        />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-5 accent-[var(--action)]" checked={important} onChange={(e) => setImportant(e.target.checked)} />
        <span>
          <span className="font-semibold">Important change</span>
          <span className="block text-ink-muted">People who did an earlier version see this note next time they open the topic.</span>
        </span>
      </label>
      <button
        type="button"
        className={cx(btn.primary, "self-start")}
        disabled={busy || (dirty && !quick)}
        title={dirty && !quick ? "Unsaved edits would need another review." : undefined}
        onClick={() => send({ action: "publish", notes: changeNote, kind: important ? "important" : "minor" }, { saveFirst: quick })}
      >
        <Icon name="check" className="size-4" /> {busy ? "Publishing…" : quick && a.stage !== "approved" ? "Publish anyway" : "Publish"}
      </button>
      <p className="text-xs text-ink-muted">Learners who already finished keep their completion. Publishing starts a new version.</p>
    </div>
  );

  const waiting = (who: string, since: string | undefined) => (
    <div className="flex flex-col gap-3">
      <p>
        Waiting for <strong>{who}</strong>
        {since && ` since ${formatDateTime(since)}`}. You can keep reading the topic and its comments; editing it now means submitting it again.
      </p>
      {a.you.canWithdraw && (
        <button type="button" className={cx(btn.secondary, "self-start")} disabled={busy} onClick={() => send({ action: "withdraw" })}>
          Withdraw
        </button>
      )}
    </div>
  );

  let title = "";
  let body: React.ReactNode = null;
  if (a.stage === "draft") {
    title = a.stale ? "Edited since it was submitted" : "Ready for review?";
    body = (
      <>
        {a.stale && (
          <p className="mb-3 rounded-xl bg-gold/15 px-3 py-2 text-sm">
            The topic changed after it went to {a.submission?.reviewer?.name ?? "the reviewer"}, so that review no longer counts. Submit it again when you’re ready.
          </p>
        )}
        {!a.stale && (
          <p className="mb-3 text-ink-muted">
            {quick
              ? "When the draft is ready, send it to a reviewer. (For this demo you can also skip the review and publish it: see below.)"
              : "When the draft is ready, send it to a reviewer. It can’t be published until it’s approved."}
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
        <p className="mb-3 text-ink-muted">Make the changes, check the card comments, then submit it again.</p>
        {submitForm}
      </>
    );
  } else if (a.stage === "review" && !a.aiReview) {
    title = "AI pre-review";
    body = (
      <div className="flex flex-col gap-3">
        <p>
          Before {a.submission?.reviewer?.name ?? "the reviewer"} reads it, Claude checks every card against the facts library and the topic’s official sources:
          rates, dates and rules, quiz answers, safety and plain English. Its findings go to the reviewer, who decides.
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
          <details className="rounded-xl border border-line p-3 text-sm">
            <summary className="cursor-pointer font-semibold">Skip it and go straight to the reviewer</summary>
            <Field label="Why (optional)" hint="Kept in the topic’s history.">
              <input className={input} value={skipNote} onChange={(e) => setSkipNote(e.target.value)} placeholder="For example: Claude isn’t connected on this server." />
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
    body = a.you.canApproveCompliance ? decision("compliance") : waiting("Quality and Compliance", undefined);
  } else if (a.stage === "approved") {
    title = a.you.canPublish ? "Approved: ready to publish" : "Approved";
    body = a.you.canPublish ? (
      publishForm
    ) : (
      waiting(a.publishers.join(" or ") || "the Hub owner", undefined)
    );
  } else {
    title = `Version ${a.version} is live`;
    body = <Monitor a={a} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-3xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-xl font-semibold">{title}</h3>
          {a.you.reviewRole && <Badge tone="info">You: {ROLE_LABEL[a.you.reviewRole]}</Badge>}
        </div>
        {a.submission && a.stage !== "draft" && a.stage !== "live" && (
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
        {problem && !(problem.publish && quick && a.stage !== "approved") && (
          <div className="mt-3">
            <ErrorNote text={problem.text} />
          </div>
        )}
      </section>

      {a.aiReview && a.stage !== "live" && <AiFindings review={a.aiReview} />}

      {quick && a.you.canPublish && a.stage !== "approved" && (
        <section className="rounded-3xl border-2 border-dashed border-action bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-serif text-xl font-semibold">Skip the review and publish</h3>
            <Badge tone="warn">Demo</Badge>
          </div>
          <p className="mb-4 mt-1 text-ink-muted">
            The review steps work as they would for real, but for this demo they don’t hold anything up: you can publish the saved draft now, at any step. With
            review switched on, it would wait for the reviewer’s approval and the Hub owner.
          </p>
          {publishForm}
          {problem?.publish && (
            <div className="mt-3">
              <ErrorNote text={problem.text} />
            </div>
          )}
        </section>
      )}

      <section className="rounded-3xl border border-line bg-surface p-5">
        <h3 className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Approval steps</h3>
        {quick && <p className="mt-1 text-sm text-ink-muted">Shown as they run for real. In this demo you can publish at any step.</p>}
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
                    ({s.state === "done" ? "done" : s.state === "current" ? "current step" : s.state === "skipped" ? "not set up yet" : "to come"})
                  </span>
                </span>
                <span className="block text-sm text-ink-muted">{s.who}</span>
                {s.detail && <span className={cx("mt-0.5 block text-xs font-semibold", s.state === "skipped" ? "text-ink-muted" : "text-warm")}>{s.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {a.history.length > 0 && (
        <section className="rounded-3xl border border-line bg-surface p-5">
          <h3 className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">History</h3>
          <ul className="mt-3 flex flex-col gap-3">
            {a.history.map((h) => (
              <li key={h.id} className="text-sm">
                <p>
                  <span className="font-semibold">{h.label}</span>
                  {h.version && ` · version ${h.version}`} <span className="text-ink-muted">· {h.by}, {formatDateTime(h.at)}</span>
                </p>
                {h.note && <p className="mt-0.5 whitespace-pre-line text-ink-muted">{h.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const textarea = "w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[0.98rem] leading-relaxed";

/** Step 7, for a live topic: what says it may need refreshing. */
function Monitor({ a }: { a: Approval }) {
  const m = a.monitor;
  const rows: { icon: "calendar" | "flag" | "landmark" | "chat"; label: string; value: React.ReactNode }[] = [
    {
      icon: "calendar",
      label: "Next review",
      value: m.reviewDate ? (
        <span className="flex flex-wrap items-center gap-2">
          {formatDate(m.reviewDate)}
          {m.reviewStatus === "overdue" && <Badge tone="bad">Overdue</Badge>}
          {m.reviewStatus === "due" && <Badge tone="warn">Due in {m.reviewDays} days</Badge>}
        </span>
      ) : (
        <span className="text-ink-muted">No review date set. Add one in Details.</span>
      ),
    },
    {
      icon: "flag",
      label: "Learner reports",
      value: m.openReports ? <Badge tone="warn">{m.openReports} open</Badge> : <span className="text-ink-muted">None open</span>,
    },
    { icon: "landmark", label: "Policy changes", value: <span className="text-ink-muted">Not connected yet</span> },
    { icon: "chat", label: "Community discussions", value: <span className="text-ink-muted">Not connected yet</span> },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-muted">Learners see this version. Editing the topic starts a new draft, which goes through review again before it’s published.</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start gap-3 rounded-xl bg-muted px-3 py-2.5">
            <Icon name={r.icon} className="mt-0.5 size-4 shrink-0 text-ink-muted" />
            <div className="min-w-0">
              <dt className="text-sm font-semibold">{r.label}</dt>
              <dd className="text-sm">{r.value}</dd>
            </div>
          </div>
        ))}
      </dl>
      {m.owner && <p className="text-xs text-ink-muted">Content owner: {m.owner}</p>}
    </div>
  );
}

const FINDING_LOOK = {
  fix: { label: "Fix", icon: "alert", tone: "border-[#c7393e] bg-[#fdf1f0] dark:bg-[#3a1f1f]" },
  check: { label: "Check", icon: "eye", tone: "border-[#fab53d] bg-[#fff6e4] dark:bg-[#3a2f17]" },
  good: { label: "Good", icon: "circle-check", tone: "border-[#2f8f5b] bg-[#e9f6ef] dark:bg-[#17301f]" },
} as const;

/** Step 3's result: Claude's summary and each finding, by card, for the reviewer to weigh up. */
function AiFindings({ review }: { review: NonNullable<Approval["aiReview"]> }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5" aria-labelledby="ai-findings">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="ai-findings" className="flex items-center gap-2 font-serif text-xl font-semibold">
          <Icon name="spark" className="size-5 text-accent" /> AI pre-review
        </h3>
        <Badge tone={review.status === "skipped" ? "neutral" : review.findings.some((f) => f.severity === "fix") ? "warn" : "good"}>
          {review.status === "skipped" ? "Skipped" : aiCounts(review.findings)}
        </Badge>
      </div>
      {review.status === "skipped" ? (
        <p className="mt-2 text-sm text-ink-muted">
          Skipped by {review.by} on {formatDateTime(review.at)}
          {review.summary && `: ${review.summary}`}. The reviewer checks it without Claude’s findings.
        </p>
      ) : (
        <>
          <p className="mt-2">{review.summary}</p>
          <p className="mt-1 text-xs text-ink-muted">
            Claude, {formatDateTime(review.at)}. Findings to weigh up, not decisions: the reviewer decides.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {review.findings.map((f, i) => {
              const look = FINDING_LOOK[f.severity];
              return (
                <li key={i} className={cx("rounded-2xl border-l-4 p-4", look.tone)}>
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-1 font-bold">
                      <Icon name={look.icon} className="size-4" /> {look.label}
                    </span>
                    <span className="text-ink-muted">· {f.cardLabel || "Whole topic"}</span>
                  </p>
                  <p className="mt-1 font-semibold">{f.title}</p>
                  <p className="mt-1 text-sm">{f.detail}</p>
                  {f.suggestion && (
                    <p className="mt-2 text-sm">
                      <span className="font-semibold">Suggestion:</span> {f.suggestion}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
