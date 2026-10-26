"use client";

import { useState } from "react";
import { AGREE, RATING_LABELS, type SurveyQuestion } from "@/content/surveys";
import { cx } from "@/lib/format";
import { Icon } from "./Icon";

export type PublicSurvey = { id: string; name: string; description: string; anonymous: boolean; required: boolean; questions: SurveyQuestion[] };
type Answers = Record<string, string | number>;

/** The survey as a learner sees it: big tap targets, one optional comment, works on a phone. */
export function SurveyForm({
  survey,
  context,
  onSubmit,
  onSkip,
  busy = false,
  error,
  preview = false,
}: {
  survey: PublicSurvey;
  context?: string;
  onSubmit?: (answers: Answers) => void;
  onSkip?: () => void;
  busy?: boolean;
  error?: string | null;
  preview?: boolean;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [tried, setTried] = useState(false);
  const missing = survey.questions.filter((q) => q.required && (answers[q.id] === undefined || answers[q.id] === ""));
  const set = (id: string, v: string | number) => setAnswers((a) => ({ ...a, [id]: v }));

  return (
    <form
      className="flex flex-col gap-5 rounded-3xl border-2 border-action/30 bg-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (missing.length || preview) return;
        onSubmit?.(answers);
      }}
      noValidate
    >
      <div>
        <p className="flex items-center gap-2 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
          <Icon name="chat" className="size-4" /> {context ?? "Quick survey"}
        </p>
        <h3 className="mt-1 font-serif text-2xl font-semibold leading-snug">{survey.name}</h3>
        <p className="mt-1 text-sm text-ink-muted">
          {survey.description ? `${survey.description} ` : ""}
          {survey.anonymous ? "Your answers are anonymous." : "Your name is shared with the learning team."} About a minute.
        </p>
      </div>

      {survey.questions.map((q, i) => {
        const err = tried && missing.includes(q);
        return (
          <fieldset key={q.id} className="flex flex-col gap-2" aria-invalid={err || undefined}>
            <legend className="mb-2 font-semibold leading-snug">
              {i + 1}. {q.prompt || <span className="text-ink-muted">Question</span>}
              {!q.required && <span className="font-normal text-ink-muted"> (optional)</span>}
            </legend>
            {(q.type === "rating" || q.type === "confidence") && (
              <div>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label
                      key={n}
                      className={cx(
                        "flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 font-mulish text-lg font-extrabold has-[:focus-visible]:outline-2",
                        answers[q.id] === n ? "border-action bg-action text-on-action" : "border-line-strong hover:bg-muted",
                      )}
                    >
                      <input type="radio" name={`${survey.id}-${q.id}`} value={n} className="sr-only" checked={answers[q.id] === n} onChange={() => set(q.id, n)} />
                      {n}
                    </label>
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-xs text-ink-muted">
                  <span>{RATING_LABELS[q.type][0]}</span>
                  <span>{RATING_LABELS[q.type][1]}</span>
                </div>
              </div>
            )}
            {(q.type === "agree" || q.type === "choice") && (
              <div className="flex flex-col gap-2">
                {(q.type === "agree" ? AGREE : q.options).map((o) => (
                  <label
                    key={o}
                    className={cx(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border px-3",
                      answers[q.id] === o ? "border-action bg-tealtint font-semibold" : "border-line-strong hover:bg-muted",
                    )}
                  >
                    <input type="radio" name={`${survey.id}-${q.id}`} className="size-5 accent-[var(--action)]" checked={answers[q.id] === o} onChange={() => set(q.id, o)} />
                    {o || "Option"}
                  </label>
                ))}
              </div>
            )}
            {q.type === "text" && (
              <textarea
                rows={3}
                maxLength={1000}
                className="w-full rounded-2xl border border-line-strong bg-surface px-3 py-2 text-[0.98rem]"
                value={(answers[q.id] as string) ?? ""}
                onChange={(e) => set(q.id, e.target.value)}
                aria-label={q.prompt}
              />
            )}
            {err && <p className="text-sm font-semibold text-danger">Please answer this one.</p>}
          </fieldset>
        );
      })}

      {error && <p className="rounded-2xl bg-danger/10 p-3 text-sm">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:opacity-45"
        >
          {busy ? "Sending…" : "Send answers"}
        </button>
        {!survey.required && onSkip && (
          <button type="button" disabled={busy} onClick={onSkip} className="inline-flex min-h-11 items-center rounded-full px-4 font-medium text-ink-muted hover:bg-muted hover:text-ink">
            Not now
          </button>
        )}
        {preview && <span className="text-sm text-ink-muted">Preview: nothing is sent.</span>}
      </div>
    </form>
  );
}

/** Survey card that loads what's waiting and sends answers. Used after a lesson and on the Learning page. */
export function PendingSurvey({
  item,
  onDone,
}: {
  item: { survey: PublicSurvey; target: { type: "path" | "lesson"; id: string; title: string } };
  onDone: (status: "submitted" | "skipped") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (action: "submit" | "skip", answers?: Answers) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, surveyId: item.survey.id, target: { type: item.target.type, id: item.target.id }, answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Your answers couldn’t be sent.");
      onDone(action === "submit" ? "submitted" : "skipped");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <SurveyForm
      survey={item.survey}
      context={item.target.type === "path" ? `You finished ${item.target.title}` : `About ${item.target.title}`}
      busy={busy}
      error={error}
      onSubmit={(a) => send("submit", a)}
      onSkip={() => send("skip")}
    />
  );
}
