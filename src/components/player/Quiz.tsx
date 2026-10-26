"use client";

import type { QuizQuestion } from "@/content/lessons";
import { Icon } from "../Icon";
import { cx } from "@/lib/format";

export function Quiz({
  cardId,
  questions,
  answers,
  onAnswer,
  checked,
  onCheckedChange,
}: {
  cardId: string;
  questions: QuizQuestion[];
  answers: Record<string, string | number | string[]>;
  onAnswer: (key: string, value: string) => void;
  checked: boolean;
  onCheckedChange: (c: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {questions.map((q, qi) => {
        const key = `${cardId}.${q.id}`;
        const picked = answers[key] as string | undefined;
        const right = picked === q.correct;
        return (
          <fieldset key={q.id} className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold leading-snug">
              <span className="text-ink-muted">Question {qi + 1} of {questions.length}. </span>
              {q.prompt}
            </legend>
            {q.options.map((o) => {
              const selected = picked === o.id;
              return (
                <label
                  key={o.id}
                  className={cx(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-2 transition-colors",
                    selected ? "border-action bg-tealtint" : "border-line hover:border-line-strong",
                    checked && "cursor-default",
                  )}
                >
                  <input
                    type="radio"
                    name={key}
                    value={o.id}
                    checked={selected}
                    disabled={checked && right}
                    onChange={() => {
                      onAnswer(key, o.id);
                      if (checked) onCheckedChange(false);
                    }}
                    className="size-5 shrink-0 accent-[var(--action)]"
                  />
                  <span>{o.label}</span>
                </label>
              );
            })}
            {checked && picked && (
              <p
                role="status"
                className={cx(
                  "mt-1 flex gap-2 rounded-2xl px-4 py-3 text-[0.95rem]",
                  right ? "bg-tealtint" : "border border-danger/60 bg-surface",
                )}
              >
                <Icon name={right ? "check" : "alert"} className={cx("mt-0.5 size-5 shrink-0", right ? "text-accent" : "text-danger")} />
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
