"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { HELP_KINDS, type HelpKind } from "@/lib/onboardingCourses";
import type { StepView } from "@/server/onboardingCourses";
import { Icon } from "../Icon";
import { Chip, dbtn, dinput } from "../discovery/parts";

/* Pieces shared by the starting-course pages, the homepage card and the admin preview (docs/onboarding.md, "Starting courses"). */

export function DemoNote({ className }: { className?: string }) {
  return (
    <p className={cx("flex items-start gap-2 rounded-2xl bg-[#fab53d]/15 px-3 py-2 text-sm text-ink ring-1 ring-[#fab53d]/50", className)}>
      <Icon name="info" className="mt-0.5 size-4 shrink-0 text-[#7a4a00] dark:text-[#ffd97a]" />
      <span>
        <strong>Demonstration.</strong> Made-up examples on real Hub content. This isn’t current Trilogy Care policy, and nobody has made it a requirement.
      </span>
    </p>
  );
}

/** How far through, as a bar and in words. The words carry the meaning; the bar is decoration. */
export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <p className="text-sm font-semibold">
        {done} of {total} required step{total === 1 ? "" : "s"} done
      </p>
      <div aria-hidden className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[#3cb8b9]/20">
        <div className="h-full rounded-full bg-[#008282] dark:bg-[#3cb8b9]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const STATE: Record<StepView["state"], { label: string; tone: "neutral" | "good" | "warn" }> = {
  done: { label: "Done", tone: "good" },
  started: { label: "Started", tone: "neutral" },
  todo: { label: "To do", tone: "neutral" },
  unavailable: { label: "Not open yet", tone: "warn" },
};

/** The steps in order. The current one is marked for screen readers as well as by colour. */
export function StepList({ steps, currentId, compact = false }: { steps: StepView[]; currentId?: string | null; compact?: boolean }) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s, i) => {
        const current = s.id === currentId;
        return (
          <li
            key={s.id}
            aria-current={current ? "step" : undefined}
            className={cx("rounded-2xl bg-surface p-3 ring-1 ring-line sm:p-4", current && "ring-2 ring-[#008282] dark:ring-[#3cb8b9]")}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={cx(
                  "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold",
                  s.state === "done" ? "bg-[#008282] text-white" : "bg-muted text-ink",
                )}
              >
                {s.state === "done" ? <Icon name="check" className="size-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug">
                  {current && <span className="sr-only">Current step: </span>}
                  {s.title}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
                  <span>{s.kindLabel}</span>
                  {s.minutes ? <span>· about {s.minutes} min</span> : null}
                  {!s.required && <span>· optional</span>}
                  <Chip tone={STATE[s.state].tone}>{STATE[s.state].label}</Chip>
                </p>
                {s.credit && <p className="mt-1 text-sm">{s.credit}</p>}
                {s.unavailable && <p className="mt-1 text-sm text-ink-muted">{s.unavailable}</p>}
              </div>
              {!compact && s.href && (
                <Link href={s.href} className={cx(current ? dbtn.primary : dbtn.secondary, "shrink-0")}>
                  {s.state === "done" ? "Open again" : s.state === "started" ? "Continue" : "Start"}
                  <span className="sr-only">: {s.title}</span>
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** "Why am I seeing this?": the reason in plain words, who owns it, and whether it's required. */
export function WhyBox({ why }: { why: { text: string; owner: string | null; demo: boolean; mandatory: boolean } }) {
  return (
    <details className="group rounded-2xl bg-muted/60 px-4 py-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-accent [&::-webkit-details-marker]:hidden">
        <Icon name="info" className="size-4" /> Why am I seeing this?
      </summary>
      <div className="pb-2 text-sm">
        <p>{why.text}</p>
        {why.owner && <p className="mt-1 text-ink-muted">Owned by {why.owner}.</p>}
        <p className="mt-1 text-ink-muted">{why.mandatory ? "This is required." : "This is recommended. There’s no due date."}</p>
        {why.demo && <p className="mt-1 text-ink-muted">It’s a demonstration course, not current Trilogy Care policy.</p>}
      </div>
    </details>
  );
}

/** For anything urgent: never an onboarding chat. */
export function UrgentNote({ text, href }: { text: string; href: string }) {
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-[#c7393e]/10 px-3 py-2 text-sm ring-1 ring-[#c7393e]/30">
      <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-[#c7393e] dark:text-[#ff9ea2]" />
      <span>
        {text}{" "}
        <Link href={href} className="font-semibold underline underline-offset-4">
          Incident first steps
        </Link>
      </span>
    </p>
  );
}

/** Get help: language or access, something broken, a work question, or progress that's wrong. */
export function HelpForm({ enrolmentId, initial = "question" }: { enrolmentId?: string; initial?: HelpKind }) {
  const [kind, setKind] = useState<HelpKind>(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const r = await api<{ message: string }>("/api/onboarding/courses", { body: { action: "help", kind, message, enrolmentId } });
      setResult({ ok: true, text: r.message });
      setMessage("");
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "That didn’t send. Try again." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      <fieldset>
        <legend className="font-semibold">What do you need help with?</legend>
        <div className="mt-2 flex flex-col gap-1">
          {(Object.keys(HELP_KINDS) as HelpKind[]).map((k) => (
            <label key={k} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-muted">
              <input type="radio" name="help-kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="size-5 accent-[#008282]" />
              <span>{HELP_KINDS[k]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">
          Tell us a little more {kind === "language" && <span className="font-normal text-ink-muted">(optional, in any language)</span>}
        </span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className={cx(dinput, "py-2")} maxLength={800} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={dbtn.primary}>
          {busy ? "Sending…" : "Send"}
        </button>
        <p role="status" aria-live="polite" className={cx("text-sm", result && !result.ok && "text-[#c7393e] dark:text-[#ff9ea2]")}>
          {result?.text}
        </p>
      </div>
    </form>
  );
}
