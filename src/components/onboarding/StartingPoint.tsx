"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { DIAGNOSTIC } from "@/lib/onboarding";
import type { diagnosticState } from "@/server/onboardingDiagnostic";
import { Icon } from "../Icon";
import { dbtn, dinput, Problem } from "../discovery/parts";

/*
  Check your starting point (docs/onboarding.md): a few reviewed work situations before assigned learning
  begins. No pass or fail, "I'm not sure" on every question, and nothing is revealed until every first
  answer is in. The result is a suggestion of where to start, never a score.
*/

type State = ReturnType<typeof diagnosticState>;

export function StartingPoint({ onDone }: { onDone: () => void }) {
  const ids = useId();
  const { data, error, reload, setData } = useApi<State>("/api/onboarding/diagnostic");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState("");
  const [goal, setGoal] = useState("");
  const [confidence, setConfidence] = useState(0);
  if (error) return <Problem text={error} onRetry={reload} />;
  if (!data) return <p className="text-ink-muted">Loading…</p>;

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      const next = await api<State>("/api/onboarding/diagnostic", { body });
      setData(next);
      setChoice("");
      if (next.status === "done") onDone();
    } catch (e) {
      // The answer chosen is still selected, so it can be sent again.
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
    } finally {
      setBusy(false);
    }
  };

  if (data.status === "none") return <p className="text-ink-muted">There’s no starting-point check for your role yet. It won’t hold up your setup.</p>;

  if (data.status === "ready")
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void post({ action: "start", goal, confidence: confidence || null });
        }}
      >
        <p>{data.intro}</p>
        <p className="text-sm text-ink-muted">
          {data.questions} short questions, about {Math.max(3, Math.round(data.questions * 0.8))} minutes. Your answers are yours: they suggest where to start,
          and they can’t hold up your setup or count as a test. Your organisation’s administrator doesn’t see them.
        </p>
        <div>
          <label htmlFor={`${ids}-goal`} className="block font-semibold">
            Which part of your work would you like more help with? <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <textarea id={`${ids}-goal`} className={cx(dinput, "mt-1 min-h-16 py-2")} maxLength={300} value={goal} onChange={(e) => setGoal(e.target.value)} />
          <p className="mt-1 text-sm text-ink-muted">Please don’t include a client’s name or health details.</p>
        </div>
        <fieldset>
          <legend className="font-semibold">
            How confident do you feel starting out? <span className="font-normal text-ink-muted">(optional)</span>
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {data.confidence.map((c, i) => (
              <label
                key={c}
                className={cx(
                  "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3 font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                  confidence === i + 1 ? "border-action bg-action text-on-action" : "border-line-strong bg-bg hover:bg-muted",
                )}
              >
                <input type="radio" name={`${ids}-conf`} className="sr-only" checked={confidence === i + 1} onChange={() => setConfidence(i + 1)} />
                {c}
              </label>
            ))}
          </div>
        </fieldset>
        {problem && <Problem text={problem} />}
        <div>
          <button type="submit" className={dbtn.primary} disabled={busy}>
            Begin
          </button>
        </div>
      </form>
    );

  if (data.status === "active" && data.question) {
    const q = data.question;
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (choice) void post({ questionId: q.id, choiceId: choice });
        }}
      >
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent" aria-live="polite">
          Question {data.position + 1} of {data.questions}
        </p>
        {q.context && <p className="rounded-2xl bg-muted px-4 py-3">{q.context}</p>}
        <fieldset>
          <legend className="font-serif text-xl font-semibold">{q.stem}</legend>
          <div className="mt-3 flex flex-col gap-2">
            {q.options.map((o) => (
              <label
                key={o.id}
                className={cx(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                  choice === o.id ? "border-action bg-tealtint" : "border-line-strong bg-bg hover:bg-muted",
                  o.id === "unsure" && "border-dashed",
                )}
              >
                <input
                  type="radio"
                  name={`${ids}-q`}
                  className="mt-1 size-4 accent-[var(--color-action)]"
                  checked={choice === o.id}
                  onChange={() => setChoice(o.id)}
                />
                <span>{o.text}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {problem && <Problem text={problem} />}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={dbtn.primary} disabled={busy || !choice}>
            {data.position + 1 === data.questions ? "Finish" : "Next question"}
          </button>
          <span className="text-sm text-ink-muted">Each answer is saved as you go. You can leave and come back.</span>
        </div>
      </form>
    );
  }

  const result = data.result;
  if (!result) return <p className="text-ink-muted">Loading…</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 font-semibold text-success">
        <Icon name="circle-check" className="size-5" /> Thanks. That’s your starting point recorded.
      </p>
      {result.suggestions.length > 0 ? (
        <div>
          <h4 className="font-serif text-xl font-semibold">Start with {result.suggestions.length === 1 ? "this" : `these ${result.suggestions.length}`}</h4>
          <ul className="mt-2 flex flex-col gap-2">
            {result.suggestions.map((s) => (
              <li key={s.href} className="rounded-2xl bg-bg p-4 ring-1 ring-line">
                <Link href={s.href} className="font-semibold text-accent underline-offset-4 hover:underline">
                  {s.label}
                </Link>
                <p className="text-sm text-ink-muted">{s.why}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>Nothing stood out as a gap. Your assigned learning is still the place to begin.</p>
      )}
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">What the reviewed guidance says for each question</summary>
        <ol className="mt-2 flex flex-col gap-3">
          {result.answers.map((a) => (
            <li key={a.id} className="rounded-2xl bg-bg p-4 ring-1 ring-line">
              <p className="font-semibold">{a.stem}</p>
              <p className="mt-1 text-sm">
                <span className="text-ink-muted">You chose:</span> {a.chosen}
              </p>
              {a.outcome !== "right" && a.best && (
                <p className="mt-1 text-sm">
                  <span className="text-ink-muted">The reviewed answer:</span> {a.best}
                </p>
              )}
              {a.guidance && <p className="mt-1 text-sm">{a.guidance}</p>}
            </li>
          ))}
        </ol>
      </details>
      <p className="text-sm text-ink-muted">
        {DIAGNOSTIC.label} is a starting point, not a test. It doesn’t complete any training or show that you can or can’t do something, and it doesn’t replace
        learning you’ve been assigned.
      </p>
    </div>
  );
}
