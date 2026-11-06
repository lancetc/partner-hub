"use client";

import { useState } from "react";
import type { Card } from "@/content/lessons";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { SpokenAnswer } from "./VoiceInput";

/*
  Written answer card: the learner answers in their own words and Claude checks it against the
  author's criteria. Feedback lists each criterion as met, partly met or not yet.
*/

type WrittenCard = Extract<Card, { type: "written" }>;
export type CriterionResult = { id: string; result: "met" | "partly" | "not_met"; comment: string };
export type WrittenResult =
  | { unavailable: false; summary: string; criteria: CriterionResult[]; next_step: string; privacy_note: string; concern: boolean; passed: boolean }
  | { unavailable: true; message: string };

const RESULT = {
  met: { label: "Covered", icon: "check", className: "bg-success text-white" },
  partly: { label: "Partly", icon: "minus", className: "bg-gold text-[#0a1a2e]" },
  not_met: { label: "Not yet", icon: "close", className: "bg-orange/15 text-warm ring-1 ring-orange/40" },
} as const;

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** The feedback panel, shared with the editor's "Try it" preview. */
export function WrittenFeedback({
  result,
  criteria,
  stale,
}: {
  result: Extract<WrittenResult, { unavailable: false }>;
  criteria: WrittenCard["criteria"];
  stale?: boolean;
}) {
  const met = result.criteria.filter((c) => c.result === "met").length;
  return (
    <section
      aria-live="polite"
      aria-label="Feedback on your answer"
      className={cx("flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-ink", stale && "opacity-60")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx("rounded-full px-3 py-1 font-mulish text-xs font-extrabold", result.passed ? "bg-success text-white" : "bg-gold text-[#0a1a2e]")}>
          {result.passed ? "All covered" : `${met} of ${result.criteria.length} covered`}
        </span>
        <span className="text-xs text-ink-muted">Feedback from AI</span>
      </div>
      {result.concern && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-warm/60 bg-orange/10 p-3 text-[0.95rem]">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-warm" />
          <span>If someone may be at risk, tell your coordinator or manager today. Call 000 if anyone is in immediate danger.</span>
        </p>
      )}
      <p className="text-[1.02rem]">{result.summary}</p>
      <ul className="flex flex-col gap-2.5">
        {result.criteria.map((r) => {
          const c = criteria.find((x) => x.id === r.id);
          const look = RESULT[r.result];
          return (
            <li key={r.id} className="flex gap-2.5">
              <span className={cx("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", look.className)} title={look.label}>
                <Icon name={look.icon} className="size-3.5" />
                <span className="sr-only">{look.label}:</span>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{c?.text ?? r.id}</span>
                <span className="block text-[0.95rem] text-ink-muted">{r.comment}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {result.next_step && (
        <div className="rounded-xl bg-tealtint p-3">
          <p className="text-sm font-semibold">Next step</p>
          <p className="mt-1">{result.next_step}</p>
        </div>
      )}
      {result.privacy_note && <p className="text-sm text-ink-muted">{result.privacy_note}</p>}
    </section>
  );
}

export function WrittenAnswer({
  card,
  slug,
  lesson,
  preview,
  answers,
  setAnswer,
  tinted = false,
}: {
  card: WrittenCard;
  slug: string;
  lesson: { title: string; outcome: string };
  /** Author previews check against the card as written, without recording anything. */
  preview: boolean;
  answers: Record<string, unknown>;
  setAnswer: (key: string, value: string | number) => void;
  /** On a coloured card: the mic sits on the colour, notes take the card's text colour, and buttons are white. */
  tinted?: boolean;
}) {
  const note = tinted ? "opacity-85" : "text-ink-muted";
  const text = String(answers[`${card.id}.text`] ?? "");
  const tries = Number(answers[`${card.id}.tries`] ?? 0);
  const [result, setResult] = useState<{ for: string; r: WrittenResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExample, setShowExample] = useState(false);
  const min = card.minWords ?? 10;
  const max = card.maxAttempts ?? 3;
  const count = wordCount(text);
  const stale = result && result.for !== text.trim();
  const state = answers[card.id];

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const r = preview
        ? await api<WrittenResult>("/api/admin/written-test", { body: { lessonTitle: lesson.title, outcome: lesson.outcome, card, answer: text } })
        : await api<WrittenResult>("/api/lessons/written", { body: { lesson: slug, card: card.id, answer: text } });
      setResult({ for: text.trim(), r });
      if (r.unavailable) setAnswer(card.id, "unavailable");
      else {
        setAnswer(`${card.id}.tries`, tries + 1);
        if (r.passed) setAnswer(card.id, "passed");
        else if (state !== "passed") setAnswer(card.id, "tried");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const fb = result && !result.r.unavailable ? result.r : null;
  const outOfTries = card.mustPass && state === "tried" && tries >= max;
  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* The question, centred under the heading like the rest of a speaking card. */}
      <p id={`${card.id}-prompt`} className="text-center text-[1.05rem] font-medium leading-relaxed">
        {card.prompt}
      </p>
      {/* Speaking is the main way to answer: a big mic first, then the words in the answer box to check and correct. */}
      <SpokenAnswer
        id={`${card.id}-answer`}
        value={text}
        onChange={(t) => setAnswer(`${card.id}.text`, t)}
        disabled={busy}
        placeholder={card.placeholder || undefined}
        describedBy={`${card.id}-prompt ${card.id}-hint`}
        variant="hero"
        chips={["Your own words", "AI feedback", "Re-record anytime"]}
        tinted={tinted}
        after={
          <>
            <p id={`${card.id}-hint`} className={cx("flex flex-wrap justify-between gap-2 text-sm", note)}>
              <span>Leave out client names and details. Your answer and voice aren’t saved.</span>
              <span className={cx(count < min && "font-semibold")}>{count < min ? `${count} of at least ${min} words` : `${count} words`}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={check}
                disabled={count < min || busy || state === "unavailable"}
                className={cx(
                  "inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold disabled:opacity-45",
                  tinted ? "bg-white text-[#0a1a2e] shadow-md hover:bg-white/90" : "bg-action text-on-action hover:bg-action-hover",
                )}
              >
                {busy ? (
                  <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Icon name="spark" className="size-4" />
                )}
                {busy ? "Checking your answer…" : fb ? "Check again" : "Check my answer"}
              </button>
              {card.example && card.showExample && fb && (
                <button
                  type="button"
                  aria-expanded={showExample}
                  onClick={() => setShowExample((s) => !s)}
                  className={cx("min-h-11 px-2 font-semibold underline-offset-4", tinted ? "text-white underline" : "text-accent")}
                >
                  {showExample ? "Hide example answer" : "See an example answer"}
                </button>
              )}
            </div>
          </>
        }
      />
      {error && (
        <p role="alert" className={cx("rounded-2xl p-3 text-sm text-ink [text-shadow:none]", tinted ? "bg-surface" : "bg-orange/10")}>
          {error}
        </p>
      )}
      {result?.r.unavailable && (
        <p role="status" className={cx("rounded-2xl p-3 text-sm text-ink [text-shadow:none]", tinted ? "bg-surface" : "bg-muted")}>
          {result.r.message}
        </p>
      )}
      {fb && <WrittenFeedback result={fb} criteria={card.criteria} stale={Boolean(stale)} />}
      {fb && card.mustPass && !fb.passed && (
        <p className={cx("text-sm", note)} role="status">
          {outOfTries
            ? "You can carry on now. Have another look at this later."
            : `Improve your answer and check again to continue. ${Math.max(0, max - tries)} ${max - tries === 1 ? "try" : "tries"} left before you can move on anyway.`}
        </p>
      )}
      {showExample && card.example && (
        <div className={cx("rounded-2xl p-3 text-ink [text-shadow:none]", tinted ? "bg-surface" : "bg-muted")}>
          <p className="text-sm font-semibold">An example answer</p>
          <p className="mt-1">{card.example}</p>
        </div>
      )}
    </div>
  );
}
