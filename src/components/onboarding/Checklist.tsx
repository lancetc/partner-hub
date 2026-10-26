"use client";

import Link from "next/link";
import { useState } from "react";
import { groupsInOrder, roles, serviceTypes, type OnboardingTask } from "@/content/onboarding";
import { commitHub, useHub, type DocStatus } from "@/lib/store";
import { blockedBy, computeReadiness, type Owner } from "@/lib/readiness";
import { Icon } from "../Icon";
import { StatusPill } from "./StatusPill";
import { TaskPanel, withTask } from "./TaskPanel";
import { cx } from "@/lib/format";

const ownerText: Record<Owner, string> = { you: "With you", us: "With Trilogy", done: "Done" };

export function Checklist() {
  const hub = useHub((s) => s);
  const r = computeReadiness(hub);
  // Deep links such as /onboarding#task-insurance open that task; otherwise the first task with you.
  const [open, setOpen] = useState<string | null>(() => {
    const fromHash = window.location.hash.match(/^#task-(.+)$/)?.[1];
    return fromHash ?? r.rows.find((x) => x.owner === "you" && !blockedBy(x.task, hub))?.task.id ?? null;
  });

  const scope = [
    roles.find((x) => x.id === hub.onboarding.role)?.label,
    hub.onboarding.services.map((s) => serviceTypes.find((t) => t.id === s)?.label).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:pt-10">
      <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">My onboarding</h1>

      <Readiness r={r} scope={scope} />

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex flex-col gap-10">
          {groupsInOrder.map((group) => {
            const rows = r.rows.filter((x) => x.task.group === group);
            if (!rows.length) return null;
            return (
              <section key={group} aria-labelledby={`g-${group}`}>
                <h2 id={`g-${group}`} className="mb-3 font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
                  {group}
                </h2>
                <ul className="flex flex-col gap-3">
                  {rows.map(({ task, status, owner }) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      status={status}
                      owner={owner}
                      expanded={open === task.id}
                      onToggle={() => setOpen((o) => (o === task.id ? null : task.id))}
                      blocked={blockedBy(task, hub)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <aside className="flex flex-col gap-5">
          <ReviewerDemo />
          <div className="rounded-3xl border border-line p-5 text-[0.95rem]">
            <p className="font-semibold">Need a hand?</p>
            <p className="mt-1 text-ink-muted">Contact the partner onboarding team (demo contact) if something isn’t clear or a document doesn’t fit.</p>
            <Link href="/resources#support-contacts" className="mt-2 inline-flex min-h-11 items-center gap-1 font-semibold text-accent">
              Support contacts <Icon name="arrow-right" className="size-4" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Readiness({ r, scope }: { r: ReturnType<typeof computeReadiness>; scope: string }) {
  const ready = r.state === "ready";
  const copy = {
    setup: `You have ${r.remainingForYou} required ${r.remainingForYou === 1 ? "task" : "tasks"} left. You can do them in any order unless a task says otherwise.`,
    checks: "You’ve done everything we need from you. We’re checking your documents and will let you know the outcome.",
    action: `Something needs your attention: ${r.needsFix.map((x) => x.task.title.toLowerCase()).join(", ")}.`,
    ready: "Every required check is complete for the role and services below.",
  }[r.state];

  return (
    <section
      aria-labelledby="readiness"
      className={cx("mt-6 rounded-3xl p-6 sm:p-8", ready ? "bg-action text-on-action" : r.state === "action" ? "border-2 border-danger/70 bg-surface" : "bg-hero text-on-hero")}
    >
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] opacity-80">Your status</p>
      <h2 id="readiness" className="mt-2 flex items-center gap-3 font-serif text-3xl font-semibold" aria-live="polite">
        <Icon name={ready ? "check" : r.state === "action" ? "alert" : r.state === "checks" ? "clock" : "list"} className={cx("size-7", r.state === "action" && "text-danger")} />
        {r.label}
      </h2>
      <p className="mt-2 max-w-2xl text-lg opacity-90">{copy}</p>

      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 font-mulish text-sm">
        <p>
          <span className="block text-2xl font-bold">
            {r.doneCount}/{r.requiredCount}
          </span>
          required items done
        </p>
        <p>
          <span className="block text-2xl font-bold">{r.remainingForYou}</span>
          with you
        </p>
        <p>
          <span className="block text-2xl font-bold">{r.waitingOnUs}</span>
          being checked by Trilogy
        </p>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-black/15" aria-hidden>
        <div className={cx("h-full rounded-full", ready ? "bg-white" : "bg-teal-bright")} style={{ width: `${(r.doneCount / r.requiredCount) * 100}%` }} />
      </div>
      <p className="mt-4 text-sm opacity-80">Applies to: {scope || "Not set"}</p>
      {ready && (
        <p className="mt-4 rounded-2xl bg-white/15 p-4">
          <strong>Next step:</strong> your coordinator will be in touch about your first visits. In the full product this links to the scheduling system.
        </p>
      )}
    </section>
  );
}

function TaskRow({
  task,
  status,
  owner,
  expanded,
  onToggle,
  blocked,
}: {
  task: OnboardingTask;
  status: DocStatus;
  owner: Owner;
  expanded: boolean;
  onToggle: () => void;
  blocked?: { reason: string };
}) {
  const state = useHub((s) => s.onboarding.tasks[task.id]);
  const panelId = `panel-${task.id}`;
  return (
    <li id={`task-${task.id}`} className={cx("rounded-3xl border bg-surface", status === "action_required" || status === "expired" ? "border-danger/60" : "border-line")}>
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full items-start gap-4 rounded-3xl p-4 text-left sm:p-5"
        >
          <span
            className={cx(
              "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2",
              owner === "done" ? "border-action bg-action text-on-action" : owner === "us" ? "border-gold" : "border-line-strong",
            )}
            aria-hidden
          >
            {owner === "done" ? <Icon name="check" className="size-4" /> : owner === "us" ? <Icon name="clock" className="size-4" /> : blocked ? <Icon name="lock" className="size-4 text-ink-muted" /> : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-lg font-semibold leading-snug">{task.title}</span>
              <StatusPill task={task} status={status} />
            </span>
            <span className="mt-1 block text-[0.95rem] text-ink-muted">{task.why}</span>
            <span className="mt-1 block font-mulish text-xs font-semibold text-ink-muted">
              {task.requiredForReadiness ? "Required" : "Optional"} · {ownerText[owner]}
              {owner === "you" && ` · ${task.responsible}`}
              {blocked && " · Waiting on another task"}
            </span>
          </span>
          <Icon name="chevron-down" className={cx("mt-1 size-5 shrink-0 transition-transform", expanded && "rotate-180")} />
        </button>
      </h3>
      {expanded && (
        <div id={panelId} className="border-t border-line p-4 sm:p-5">
          <TaskPanel task={task} state={state} status={status} blocked={blocked} />
        </div>
      )}
    </li>
  );
}

/** Prototype-only control standing in for the restricted reviewer queue. */
function ReviewerDemo() {
  const hub = useHub((s) => s);
  const r = computeReadiness(hub);
  const docs = r.rows.filter((x) => x.task.kind === "document" && x.status !== "not_started" && x.status !== "draft");
  const [reason, setReason] = useState("The expiry date isn’t readable. Please upload a clearer copy showing the full certificate.");
  const [busy, setBusy] = useState(false);

  const act = async (id: string, status: DocStatus, note: string, patch: Record<string, string | undefined> = {}) => {
    setBusy(true);
    try {
      await commitHub(withTask(id, patch, { status, note, actor: "Reviewer (demo)" }));
    } catch {
      window.alert("Simulated network failure. The review decision was not saved.");
    } finally {
      setBusy(false);
    }
  };

  const nextYear = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  };

  return (
    <div className="rounded-3xl border-2 border-dashed border-line-strong p-5">
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-warm">Prototype control</p>
      <p className="mt-1 font-semibold">Simulate Trilogy’s review</p>
      <p className="mt-1 text-sm text-ink-muted">In the real product, authorised reviewers do this from a restricted queue.</p>
      {docs.length === 0 ? (
        <p className="mt-3 text-sm">Submit a document to try the review steps.</p>
      ) : (
        <>
          <label htmlFor="review-reason" className="mt-3 block text-sm font-medium">
            Correction reason
          </label>
          <textarea id="review-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-xl border border-line-strong bg-surface p-2 text-sm" />
          <ul className="mt-3 flex flex-col gap-4">
            {docs.map(({ task, status }) => (
              <li key={task.id} className="text-sm">
                <p className="mb-1.5 flex flex-wrap items-center gap-2 font-semibold">
                  {task.title} <StatusPill task={task} status={status} />
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {status === "received" && <DemoBtn disabled={busy} onClick={() => act(task.id, "in_review", "Review started")}>Start review</DemoBtn>}
                  {(status === "received" || status === "in_review") && (
                    <>
                      <DemoBtn disabled={busy} onClick={() => act(task.id, "action_required", `Correction requested: ${reason}`, { reason })}>Request correction</DemoBtn>
                      <DemoBtn disabled={busy} onClick={() => act(task.id, "verified", "Verified", { expiry: hub.onboarding.tasks[task.id]?.expiry || nextYear() })}>Verify</DemoBtn>
                    </>
                  )}
                  {status === "verified" && <DemoBtn disabled={busy} onClick={() => act(task.id, "expired", "Marked expired")}>Mark expired</DemoBtn>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function DemoBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className="min-h-10 rounded-full border border-line-strong px-3 font-medium hover:bg-muted disabled:opacity-50" />;
}
