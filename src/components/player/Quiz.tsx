"use client";

import type { QuizQuestion } from "@/content/lessons";
import { Icon } from "../Icon";
import { Burst } from "./Burst";
import { cx } from "@/lib/format";
import { assessmentOrder, assessmentScore } from "@/lib/assessment";

export function Quiz({
  cardId,
  questions,
  answers,
  onAnswer,
  checked,
  onCheckedChange,
  assessment,
  seed = "",
}: {
  cardId: string;
  questions: QuizQuestion[];
  answers: Record<string, string | number | string[]>;
  onAnswer: (key: string, value: string) => void;
  checked: boolean;
  onCheckedChange: (c: boolean) => void;
  /** Assessment mode: shuffled, marked all at once, and no feedback after a fail. */
  assessment?: { passMark: number; draw?: number };
  /** Fixes this attempt's shuffled order. */
  seed?: string;
}) {
  // An assessment asks this attempt's draw, in this attempt's order, and is marked on those questions.
  const shown = assessment ? assessmentOrder(questions, seed, assessment.draw) : questions;
  const score = assessment ? assessmentScore(cardId, shown, answers, assessment.passMark) : null;
  // After a failed assessment, don't show which answers were wrong: the retake would just flip them.
  const showFeedback = checked && (!score || score.passed);
  return (
    <div className="flex flex-col gap-6">
      {assessment && !checked && (
        <p className="rounded-2xl bg-muted px-4 py-3 text-[0.95rem] [text-shadow:none]">
          <strong>Assessment.</strong> Answer every question, then submit. It’s marked all at once, and you need {assessment.passMark}% to pass.
        </p>
      )}
      {score && checked && (
        <div
          role="status"
          className={cx(
            "fx-rise flex flex-col gap-1 rounded-2xl px-4 py-4 text-[#102a43] [text-shadow:none]",
            score.passed ? "bg-[#DDE8D9]" : "border-2 border-danger/60 bg-surface text-ink",
          )}
        >
          <span className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em]">{score.passed ? "Passed" : "Not yet passed"}</span>
          <span className="font-serif text-3xl font-semibold">
            {score.right} of {score.total} · {score.percent}%
          </span>
          <span className="text-[0.95rem]">
            {score.passed
              ? "Well done. Read the feedback on each question below, then continue."
              : `You need ${assessment!.passMark}% to pass. Retake the assessment: ${assessment!.draw ? "you’ll get a new set of questions" : "the questions and answers will be in a new order"}.`}
          </span>
        </div>
      )}
      {shown.map((q, qi) => {
        const key = `${cardId}.${q.id}`;
        const picked = answers[key] as string | undefined;
        const right = picked === q.correct;
        return (
          <fieldset key={q.id} className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold leading-snug">
              <span className="text-ink-muted">
                Question {qi + 1} of {shown.length}.{" "}
              </span>
              {q.prompt}
            </legend>
            {q.options.map((o) => {
              const selected = picked === o.id;
              return (
                <label
                  key={o.id}
                  className={cx(
                    "fx-press relative flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-2 transition-colors",
                    selected ? "border-action bg-[#DDE8D9] dark:bg-tealtint" : "border-line bg-surface hover:border-line-strong",
                    checked && "cursor-default",
                    // Chosen: a springy pop. Checked: a glow and burst if right, a small shake if not.
                    selected && (showFeedback ? (right ? "fx-correct" : "fx-shake") : checked ? "" : "fx-pop"),
                  )}
                >
                  <input
                    type="radio"
                    name={key}
                    value={o.id}
                    checked={selected}
                    disabled={checked && (right || Boolean(assessment))}
                    onChange={() => {
                      onAnswer(key, o.id);
                      if (checked) onCheckedChange(false);
                    }}
                    className="size-5 shrink-0 accent-[var(--action)]"
                  />
                  <span>{o.label}</span>
                  {showFeedback && selected && right && <Burst />}
                </label>
              );
            })}
            {showFeedback && picked && (
              <p
                role="status"
                className={cx(
                  "fx-rise mt-1 flex gap-2 rounded-2xl px-4 py-3 text-[0.95rem]",
                  right ? "bg-[#DDE8D9] dark:bg-tealtint" : "border border-danger/60 bg-surface",
                )}
              >
                <Icon name={right ? "check" : "alert"} className={cx("fx-tick mt-0.5 size-5 shrink-0", right ? "text-accent" : "text-danger")} />
                <span>
                  <strong>{right ? "Correct. " : "Not yet. "}</strong>
                  {right ? q.feedback.correct.replace(/^(Right|Yes|Exactly)\.\s*/, "") : q.feedback.incorrect.replace(/^Not quite\.\s*/, "")}
                </span>
              </p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
