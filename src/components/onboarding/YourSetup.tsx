"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { DOCUMENT_TYPES, SETUP_STATES, TASK_STATUS, type TaskStatus, type TaskView } from "@/lib/onboarding";
import type { Setup } from "@/server/onboarding";
import { Icon } from "../Icon";
import { Chip, dbtn, dinput, Problem } from "../discovery/parts";
import { OnboardingView } from "./OnboardingView";
import { StartingPoint } from "./StartingPoint";

/*
  Your setup (docs/onboarding.md). The first visit is a wizard: one task at a time, saved as it goes.
  After that the same tasks are a list to come back to, in four sections, and once the person is active
  it's "Your profile and requirements". Until setup requirements have been released for the Hub, this
  shows the welcome that was here before.
*/

type Post = (body: Record<string, unknown>) => Promise<boolean>;
const TONE: Record<TaskStatus, "neutral" | "good" | "warn"> = {
  not_started: "neutral",
  in_progress: "neutral",
  submitted: "neutral",
  needs_action: "warn",
  approved: "good",
  renew: "warn",
  expired: "warn",
};

export function YourSetup() {
  const { data, error, reload, setData } = useApi<Setup>("/api/onboarding");
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [list, setList] = useState(false);
  if (error) return <Problem text={error} onRetry={reload} />;
  if (!data) return <p className="mx-auto max-w-4xl px-4 py-10 text-ink-muted">Loading your setup…</p>;
  // Nothing has been released to set up yet: the welcome and sample topics, as before.
  if (!data.configured) return <OnboardingView />;

  const post: Post = async (body) => {
    setProblem(null);
    setSaved(false);
    try {
      setData(await api<Setup>("/api/onboarding", { body }));
      setSaved(true);
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
      return false;
    }
  };
  const active = Boolean(data.activatedAt);
  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6 lg:pt-8">
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{active ? "Your account" : "Getting started"}</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{active ? "Your profile and requirements" : "Your setup"}</h1>
      <p role="status" aria-live="polite" className={cx("mt-2 inline-flex items-center gap-1.5 text-sm text-ink-muted", !saved && "sr-only")}>
        <Icon name="check" className="size-4" /> Saved
      </p>
      {problem && (
        <div className="mt-3">
          <Problem text={problem} />
        </div>
      )}
      {data.wizard && !list ? (
        <Wizard data={data} post={post} reload={reload} onList={() => setList(true)} />
      ) : (
        <Dashboard data={data} post={post} reload={reload} />
      )}
    </div>
  );
}

function summary(data: Setup): string {
  if (data.state === "active") return "You’re set up. Anything that needs renewing will appear here.";
  if (data.state === "ready") return "Everything required has been approved.";
  if (data.waitingOn === "reviewer") return "Nothing for you to do right now: what you’ve sent is being reviewed.";
  if (data.waitingOn === "organisation") return "Your part is done. Your organisation’s administrator still has something to provide.";
  if (data.state === "needs_action") return "Something needs correcting before it can be approved.";
  if (data.state === "renewal") return "Something needs renewing to keep your account in good standing.";
  return `About ${Math.max(1, data.minutes)} minutes of tasks you can do now.`;
}

// ---------------------------------------------------------------------------------------------
// The first visit
// ---------------------------------------------------------------------------------------------

function Wizard({ data, post, reload, onList }: { data: Setup; post: Post; reload: () => void; onList: () => void }) {
  const mine = data.tasks.filter((t) => t.mine);
  const steps = ["welcome", ...mine.map((t) => t.id), "review"];
  const [step, setStep] = useState(() => (data.lastStep && steps.includes(data.lastStep) ? data.lastStep : "welcome"));
  const at = steps.indexOf(step);
  const go = (to: string) => {
    setStep(to);
    // Where they're up to is saved, so another device picks up here.
    void post({ action: "step", step: to });
    window.scrollTo({ top: 0 });
  };
  const task = mine.find((t) => t.id === step);
  const title = step === "welcome" ? "Welcome" : step === "review" ? "Review and start" : (task?.title ?? "");
  return (
    <section aria-labelledby="wiz-h" className="mt-5 rounded-3xl bg-surface p-5 ring-1 ring-line sm:p-7">
      <p className="text-sm font-semibold text-ink-muted" aria-live="polite">
        Step {at + 1} of {steps.length}
      </p>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-action" style={{ width: `${Math.round(((at + 1) / steps.length) * 100)}%` }} />
      </div>
      <h2 id="wiz-h" className="mt-4 font-serif text-2xl font-semibold sm:text-3xl">
        {title}
      </h2>

      {step === "welcome" && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-lg">
            Welcome, {data.person.name.split(" ")[0]}. The Hub has you as a <strong>{data.person.role}</strong>
            {data.person.organisation ? (
              <>
                {" "}
                with <strong>{data.person.organisation}</strong>
              </>
            ) : null}
            .
          </p>
          <p>
            There {mine.length === 1 ? "is 1 task" : `are ${mine.length} tasks`} for you, about {Math.max(1, data.minutes)} minutes for the ones you can do now.
            Each is saved as you finish it, so you can leave and come back, on any device. Some need a reviewer to approve them; you’ll see when they’re
            waiting, and you can carry on with the others meanwhile.
          </p>
          <Mismatch data={data} post={post} />
        </div>
      )}
      {task && (
        <div className="mt-3">
          <TaskHeader task={task} />
          <div className="mt-3">
            <TaskPanel task={task} data={data} post={post} reload={reload} />
          </div>
        </div>
      )}
      {step === "review" && (
        <div className="mt-3 flex flex-col gap-3">
          <p>{summary(data)}</p>
          <ul className="flex flex-col divide-y divide-line">
            {data.tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {t.title}
                  {!t.required && <span className="text-ink-muted"> · optional</span>}
                  {!t.mine && <span className="text-ink-muted"> · your organisation’s</span>}
                </span>
                <Chip tone={TONE[t.status]}>{TASK_STATUS[t.status].label}</Chip>
              </li>
            ))}
          </ul>
          {data.canStart ? (
            <Start data={data} post={post} />
          ) : (
            <p className="rounded-2xl bg-muted px-4 py-3">
              You can’t start using the Hub in full yet. You can still open your learning while this is sorted out. Your setup list shows what’s left and whose
              move it is.
            </p>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        {at > 0 && (
          <button type="button" className={dbtn.secondary} onClick={() => go(steps[at - 1])}>
            <Icon name="arrow-left" className="size-4" /> Back
          </button>
        )}
        {at < steps.length - 1 && (
          <button type="button" className={dbtn.primary} onClick={() => go(steps[at + 1])}>
            {step === "welcome" ? "Get started" : task && !task.ok && task.status !== "submitted" ? "Skip for now" : "Continue"}{" "}
            <Icon name="arrow-right" className="size-4" />
          </button>
        )}
        <button
          type="button"
          className={cx(dbtn.quiet, "ml-auto")}
          onClick={async () => {
            // Leaving the wizard keeps everything; next time it's the list.
            await post({ action: "step", step, wizardDone: step === "review" });
            onList();
          }}
        >
          {step === "review" ? "Go to your setup list" : "Save and leave"}
        </button>
      </div>
    </section>
  );
}

function Start({ data, post }: { data: Setup; post: Post }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-2xl bg-tealtint p-4">
      <p className="font-semibold">
        {data.override
          ? `You’ve been cleared to start while the rest is finished (until ${formatDate(data.override.until)}).`
          : "Everything required has been approved."}
      </p>
      <button
        type="button"
        className={cx(dbtn.primary, "mt-3")}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await post({ action: "start" });
          setBusy(false);
        }}
      >
        Start using the Hub <Icon name="arrow-right" className="size-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Every visit after
// ---------------------------------------------------------------------------------------------

function Dashboard({ data, post, reload }: { data: Setup; post: Post; reload: () => void }) {
  // A link from the Inbox opens its task: /onboarding#task-<id>.
  const [open, setOpen] = useState<string | null>(() =>
    typeof window !== "undefined" && window.location.hash.startsWith("#task-") ? window.location.hash.slice(6) : null,
  );
  const [tour, setTour] = useState(false);
  const byId = new Map(data.tasks.map((t) => [t.id, t]));
  const groups: { key: keyof Setup["sections"]; title: string; empty?: string }[] = [
    {
      key: "next",
      title: "Your next action",
      empty: data.state === "ready" || data.state === "active" ? "Nothing to do right now." : "Nothing for you to do right now.",
    },
    { key: "waiting", title: "Waiting for review" },
    { key: "done", title: "Completed" },
    { key: "optional", title: "Optional for later" },
  ];
  return (
    <div className="mt-5 flex flex-col gap-6">
      <section aria-label="Where you’re up to" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        <p className="flex flex-wrap items-center gap-2">
          <Chip
            tone={data.state === "active" || data.state === "ready" ? "good" : data.state === "needs_action" || data.state === "renewal" ? "warn" : "neutral"}
          >
            {SETUP_STATES[data.state]}
          </Chip>
          <span className="font-semibold">{summary(data)}</span>
        </p>
        <p className="mt-2 text-ink-muted">
          {data.person.name} · {data.person.role}
          {data.person.organisation ? ` · ${data.person.organisation}` : ""}
          {data.activatedAt ? ` · active since ${formatDate(data.activatedAt)}` : ""}
        </p>
        {data.canStart && (
          <div className="mt-3">
            <Start data={data} post={post} />
          </div>
        )}
        {!data.canStart && !data.activatedAt && (
          <p className="mt-2 text-sm text-ink-muted">
            You can open your learning while setup is finished. Starting in full needs every required task approved.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Mismatch data={data} post={post} />
          <Link href="/settings" className={dbtn.quiet}>
            <Icon name="sliders" className="size-4" /> Picture, language and notifications
          </Link>
        </div>
      </section>

      {groups.map((g) => {
        const tasks = data.sections[g.key].map((id) => byId.get(id)!);
        if (!tasks.length && !g.empty) return null;
        return (
          <section key={g.key} aria-labelledby={`sec-${g.key}`}>
            <h2 id={`sec-${g.key}`} className="font-serif text-2xl font-semibold">
              {g.title} {tasks.length > 0 && <span className="text-ink-muted">({tasks.length})</span>}
            </h2>
            {tasks.length === 0 ? (
              <p className="mt-2 text-ink-muted">{g.empty}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {tasks.map((t) => (
                  <li key={t.id} id={`task-${t.id}`} className="scroll-mt-24 rounded-3xl bg-surface p-5 ring-1 ring-line">
                    <TaskHeader task={t} heading />
                    {open === t.id ? (
                      <div className="mt-3 border-t border-line pt-3">
                        <TaskPanel task={t} data={data} post={post} reload={reload} />
                        <button type="button" className={cx(dbtn.quiet, "mt-2")} onClick={() => setOpen(null)}>
                          Close
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={cx(g.key === "next" ? dbtn.primary : dbtn.secondary, "mt-3")}
                        aria-expanded={false}
                        onClick={() => setOpen(t.id)}
                      >
                        {actionLabel(t)}
                        <span className="sr-only">: {t.title}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {data.people && data.people.length > 0 && (
        <section aria-labelledby="sec-people">
          <h2 id="sec-people" className="font-serif text-2xl font-semibold">
            Your organisation’s people ({data.people.length})
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Where each person’s own setup is up to. You can’t see their documents or their starting-point answers.</p>
          <ul className="mt-3 flex flex-col divide-y divide-line rounded-3xl bg-surface px-5 ring-1 ring-line">
            {data.people.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="font-semibold">{p.name}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-ink-muted">
                    {p.done} of {p.of} required
                    {p.waitingOn === "reviewer" ? " · with a reviewer" : p.waitingOn === "organisation" ? " · waiting on your organisation" : ""}
                  </span>
                  <Chip tone={p.state === "active" || p.state === "ready" ? "good" : "neutral"}>{SETUP_STATES[p.state]}</Chip>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="sec-sample">
        <h2 id="sec-sample" className="font-serif text-2xl font-semibold">
          Try a sample topic
        </h2>
        {tour ? (
          <OnboardingView />
        ) : (
          <p className="mt-2">
            <button type="button" className={dbtn.secondary} onClick={() => setTour(true)}>
              <Icon name="bulb" className="size-4" /> Make a sample topic about something you’d like to learn
            </button>
          </p>
        )}
      </section>
    </div>
  );
}

const actionLabel = (t: TaskView) =>
  !t.mine
    ? "See details"
    : t.status === "submitted"
      ? "See what was sent"
      : t.status === "approved"
        ? t.kind === "document"
          ? "View or replace"
          : "View"
        : t.status === "needs_action"
          ? "Fix and resubmit"
          : t.status === "renew" || t.status === "expired"
            ? "Renew"
            : t.status === "in_progress"
              ? "Continue"
              : "Start";

function TaskHeader({ task: t, heading }: { task: TaskView; heading?: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        {heading ? <h3 className="font-serif text-xl font-semibold">{t.title}</h3> : <span className="sr-only">{t.title}</span>}
        <span className="flex flex-wrap gap-2">
          {!t.required && <Chip>Optional</Chip>}
          {t.scope === "organisation" && <Chip>Your organisation’s</Chip>}
          <Chip tone={TONE[t.status]}>{TASK_STATUS[t.status].label}</Chip>
        </span>
      </div>
      {t.why && <p className="mt-1 text-ink-muted">{t.why}</p>}
      <p className="mt-1 text-sm text-ink-muted">
        {!t.mine ? "Your organisation’s administrator does this one. " : t.status === "submitted" ? "" : `About ${t.minutes} min. `}
        {TASK_STATUS[t.status].meaning}
        {t.status === "submitted" && t.reviewer ? ` Reviewer: ${t.reviewer}.` : ""}
        {t.expiresAt && (t.status === "approved" || t.status === "renew" || t.status === "expired") ? ` Valid until ${formatDate(t.expiresAt)}.` : ""}
        {t.updatedAt ? ` Last updated ${formatDate(t.updatedAt)}.` : ""}
      </p>
      {t.status === "needs_action" && t.reason && (
        <p className="mt-2 rounded-2xl bg-[#fff1cc] px-4 py-3 text-[#6b4a00] dark:bg-[#3d2f08] dark:text-[#ffd97a]">
          <span className="font-semibold">What needs correcting:</span> {t.reason}
        </p>
      )}
      {t.reference && (
        <p className="mt-1 text-sm text-ink-muted">
          Need help with this? Quote reference <span className="font-mono">{t.reference}</span> to your Trilogy Care contact.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The tasks themselves
// ---------------------------------------------------------------------------------------------

function TaskPanel({ task: t, data, post, reload }: { task: TaskView; data: Setup; post: Post; reload: () => void }) {
  const ids = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    const ok = await post(body);
    setBusy(false);
    return ok;
  };
  if (!t.mine)
    return (
      <p>
        Your organisation’s administrator provides this once for everyone in your organisation. There’s nothing for you to do; this page shows when it’s
        approved.
      </p>
    );

  if (t.kind === "details")
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run({ taskId: t.id, name: new FormData(e.currentTarget).get("name") });
        }}
      >
        <label className="flex max-w-md flex-col gap-1 font-semibold">
          The name you’d like the Hub to use
          <input name="name" defaultValue={data.person.name} required minLength={2} maxLength={80} className={dinput} autoComplete="name" />
        </label>
        <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-ink-muted">Role</dt>
          <dd>{data.person.role}</dd>
          <dt className="text-ink-muted">Organisation</dt>
          <dd>{data.person.organisation || "Not set"}</dd>
        </dl>
        <p className="text-sm text-ink-muted">
          Your role and organisation come from Trilogy Care’s records and decide which tasks and learning you see. If they’re wrong, ask for them to be checked:
          you can’t change them yourself.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={dbtn.primary} disabled={busy}>
            {t.status === "approved" ? "Save" : "These are right"}
          </button>
        </div>
      </form>
    );

  if (t.kind === "acknowledge")
    return t.status === "approved" ? (
      <div>
        <p className="whitespace-pre-wrap rounded-2xl bg-bg p-4 ring-1 ring-line">{t.statement}</p>
        <p className="mt-2 flex items-center gap-2 font-semibold text-success">
          <Icon name="circle-check" className="size-5" /> You acknowledged this{t.updatedAt ? ` on ${formatDate(t.updatedAt)}` : ""}.
        </p>
      </div>
    ) : (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run({ taskId: t.id, agree: new FormData(e.currentTarget).get("agree") === "on" });
        }}
      >
        <p className="whitespace-pre-wrap rounded-2xl bg-bg p-4 ring-1 ring-line">{t.statement}</p>
        <label className="flex min-h-11 items-start gap-2 py-1.5">
          <input type="checkbox" name="agree" required className="mt-1 size-5 accent-[var(--color-action)]" />
          <span>I’ve read this and agree to it.</span>
        </label>
        <div>
          <button type="submit" className={dbtn.primary} disabled={busy}>
            Acknowledge
          </button>
        </div>
      </form>
    );

  if (t.kind === "learning")
    return (
      <div className="flex flex-col gap-2">
        <p>
          {t.status === "approved" ? "You’ve completed this." : "This is done when you finish it in the usual way. Your place is kept if you leave part-way."}
        </p>
        {t.asset && (
          <div>
            <Link href={t.asset.href} className={t.status === "approved" ? dbtn.secondary : dbtn.primary}>
              {t.status === "approved" ? "Open it again" : t.status === "in_progress" ? "Continue" : "Open"}: {t.asset.label}
            </Link>
          </div>
        )}
      </div>
    );

  if (t.kind === "diagnostic") return <StartingPoint onDone={reload} />;

  // A document.
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      const form = new FormData();
      form.set("taskId", t.id);
      form.set("file", file);
      const res = await fetch("/api/onboarding/documents", { method: "POST", body: form });
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? "That didn’t upload.");
      reload();
    } catch (e) {
      // Nothing already sent is lost: the file that was there before is still there.
      setProblem(`${e instanceof Error ? e.message : "That didn’t upload."} Try again.`);
    } finally {
      setBusy(false);
    }
  };
  const locked = t.status === "submitted";
  const ready = Boolean(t.document) && (t.status === "in_progress" || t.status === "needs_action");
  return (
    <div className="flex flex-col gap-3">
      {t.document ? (
        <p>
          <a
            href={`/api/onboarding/documents/${t.document.id}`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            {t.document.name}
          </a>
          <span className="text-ink-muted"> · uploaded {formatDate(t.document.uploadedAt)}</span>
        </p>
      ) : (
        <p className="text-ink-muted">No file yet.</p>
      )}
      {locked ? (
        <p>
          This is with {t.reviewer || "a reviewer"}. There’s nothing you need to do. If they ask for a change you’ll see the reason here and in your Inbox, and
          can replace the file then.
        </p>
      ) : (
        <>
          <div>
            <label htmlFor={`${ids}-f`} className="block font-semibold">
              {t.document ? "Replace the file" : "Choose a file"}
            </label>
            <input
              id={`${ids}-f`}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={busy}
              aria-describedby={`${ids}-fh`}
              className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-full file:border file:border-line-strong file:bg-surface file:px-4 file:font-semibold"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            <p id={`${ids}-fh`} className="mt-1 text-sm text-ink-muted">
              {DOCUMENT_TYPES}. It’s stored privately: only you{t.scope === "organisation" ? ", your organisation’s administrators" : ""} and{" "}
              {t.reviewer || "the reviewer"} can open it.
              {t.status === "approved" || t.status === "renew" ? " Your current approval keeps counting while a replacement is reviewed." : ""}
            </p>
          </div>
          {busy && <p className="text-ink-muted">Uploading…</p>}
          {problem && <Problem text={problem} />}
          {ready && (
            <div>
              <button type="button" className={dbtn.primary} disabled={busy} onClick={() => void run({ taskId: t.id })}>
                Submit for review
              </button>
              <p className="mt-1 text-sm text-ink-muted">Once it’s submitted it can’t be changed until the reviewer has looked at it.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** "This isn't my role or organisation": a request to have it checked. It changes nothing by itself. */
function Mismatch({ data, post }: { data: Setup; post: Post }) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  if (data.request?.state === "open")
    return <p className="text-sm text-ink-muted">You’ve asked for your role or organisation to be checked. Someone is looking at it.</p>;
  if (!open)
    return (
      <span className="flex flex-col gap-1">
        {data.request?.resolution && <span className="text-sm text-ink-muted">About your role: {data.request.resolution}</span>}
        <button type="button" className={cx(dbtn.quiet, "self-start")} onClick={() => setOpen(true)}>
          <Icon name="flag" className="size-4" /> This isn’t my role or organisation
        </button>
      </span>
    );
  return (
    <form
      className="flex w-full flex-col gap-2 rounded-2xl bg-bg p-4 ring-1 ring-line"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await post({ action: "mismatch", message: new FormData(e.currentTarget).get("message") })) setOpen(false);
      }}
    >
      <label htmlFor={`${ids}-m`} className="font-semibold">
        What should it say?
      </label>
      <textarea
        id={`${ids}-m`}
        name="message"
        required
        minLength={10}
        maxLength={600}
        className={cx(dinput, "min-h-20 py-2")}
        aria-describedby={`${ids}-mh`}
        autoFocus
      />
      <p id={`${ids}-mh`} className="text-sm text-ink-muted">
        This goes to the Trilogy Care team that looks after your account. Your access doesn’t change until they’ve checked.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={dbtn.secondary}>
          Ask for it to be checked
        </button>
        <button type="button" className={dbtn.quiet} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
