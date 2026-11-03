"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { minutesLabel } from "@/lib/pathQuizSettings";
import { btn } from "./admin/ui";
import { Icon } from "./Icon";

/*
  A learning path's upfront quiz, for people who think they already know the content. One question
  at a time, marked all at once at the end. Pass it and the whole path is complete.
*/

export type QuizOffer = {
  questions: number;
  passMark: number;
  attempts: number;
  left: number;
  minutes: number;
  inProgress: boolean;
  latest: (Result & { focus: Focus[] }) | null;
  passed: boolean;
  available: boolean;
};
type Focus = { slug: string; title: string };
type Result = { score: number; total: number; percent: number; passed: boolean; passMark: number; at: string };
type Question = { key: string; topic: string; prompt: string; options: { id: string; label: string }[] };
type Started = {
  attempt: number;
  path: { id: string; name: string };
  passMark: number;
  left: number;
  questions: Question[];
  /** Only in an author's preview: the right answers, so the page can mark them itself. */
  answers?: Record<string, string>;
};
type PathData = { id: string; name: string; quiz: QuizOffer | null };

/** Answers so far, kept on this device so a refresh or a dropped connection doesn't lose them. */
const saved = (attempt: number): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(`tc-path-quiz-${attempt}`) ?? "{}");
  } catch {
    return {};
  }
};
const keep = (attempt: number, answers: Record<string, string> | null) => {
  try {
    if (answers) localStorage.setItem(`tc-path-quiz-${attempt}`, JSON.stringify(answers));
    else localStorage.removeItem(`tc-path-quiz-${attempt}`);
  } catch {
    // Storage can be blocked; the answers still work for this visit.
  }
};

/** `preview`: an author trying the quiz from the path preview. Marked on the page; nothing is recorded. */
export function PathQuiz({ id, preview = false }: { id: string; preview?: boolean }) {
  const { data, error } = useApi<PathData>(`/api/paths/${encodeURIComponent(id)}`);
  const [started, setStarted] = useState<Started | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [at, setAt] = useState(0);
  const [result, setResult] = useState<(Result & { focus: Focus[]; left: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [actError, setActError] = useState<string | null>(null);
  const pathLink = `/paths/${encodeURIComponent(id)}${preview ? "?preview=1" : ""}`;

  async function start() {
    setBusy(true);
    setActError(null);
    try {
      const s = await api<Started>(`/api/paths/${encodeURIComponent(id)}/quiz`, { body: { action: preview ? "preview" : "start" } });
      const before = preview ? {} : saved(s.attempt);
      setAnswers(before);
      // Pick up at the first question still to answer.
      const first = s.questions.findIndex((q) => !before[q.key]);
      setAt(first === -1 ? s.questions.length - 1 : first);
      setStarted(s);
    } catch (e) {
      setActError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!started) return;
    if (preview && started.answers) {
      // Marked here, the same way the server marks a real attempt.
      const right = started.answers;
      const score = started.questions.filter((q) => answers[q.key] === right[q.key]).length;
      const total = started.questions.length;
      const missed = started.questions.filter((q) => answers[q.key] !== right[q.key]);
      setResult({
        score,
        total,
        percent: total ? Math.round((score / total) * 100) : 0,
        passed: total > 0 && score * 100 >= started.passMark * total,
        passMark: started.passMark,
        at: new Date().toISOString(),
        focus: [...new Map(missed.map((q) => [q.key.split("|")[0], { slug: q.key.split("|")[0], title: q.topic }])).values()],
        left: started.left,
      });
      window.scrollTo({ top: 0 });
      return;
    }
    setBusy(true);
    setActError(null);
    try {
      const r = await api<Result & { focus: Focus[]; left: number }>(`/api/paths/${encodeURIComponent(id)}/quiz`, {
        body: { action: "submit", attempt: started.attempt, answers },
      });
      keep(started.attempt, null);
      setResult(r);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setActError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (started && !preview) keep(started.attempt, answers);
  }, [started, answers, preview]);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">
      <Link href={pathLink} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> {data?.name ?? "Back to the path"}
      </Link>
      {preview && (
        <p className="mt-3 rounded-2xl border-2 border-dashed border-gold px-3 py-2 text-sm">
          <strong>Quiz preview.</strong> Questions are drawn the same way as for learners and marked here. Nothing is recorded, and no topics are completed.
        </p>
      )}
      {error ? (
        <p className="mt-4 rounded-2xl border border-line p-4 text-ink-muted">This learning path isn’t available. It may have been removed.</p>
      ) : !data ? (
        <p className="mt-4 text-ink-muted">Loading…</p>
      ) : result ? (
        <Outcome result={result} pathLink={pathLink} preview={preview} />
      ) : started ? (
        <Asking
          started={started}
          at={at}
          setAt={setAt}
          answers={answers}
          onAnswer={(key, v) => setAnswers((a) => ({ ...a, [key]: v }))}
          onSubmit={submit}
          busy={busy}
          error={actError}
        />
      ) : !data.quiz ? (
        <p className="mt-4 rounded-2xl border border-line p-4 text-ink-muted">This learning path doesn’t have a quiz.</p>
      ) : (
        <Intro
          name={data.name}
          // In a preview, the offer as a learner first sees it, whatever the author's own results.
          offer={preview ? { ...data.quiz, available: true, inProgress: false, latest: null, passed: false, left: data.quiz.attempts } : data.quiz}
          onStart={start}
          busy={busy}
          error={actError}
          pathLink={pathLink}
        />
      )}
    </div>
  );
}

function Intro({
  name,
  offer: o,
  onStart,
  busy,
  error,
  pathLink,
}: {
  name: string;
  offer: QuizOffer;
  onStart: () => void;
  busy: boolean;
  error: string | null;
  pathLink: string;
}) {
  const tries = o.attempts === 1 ? "one try" : `${o.attempts} tries`;
  return (
    <header className="mt-2">
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Upfront quiz</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold leading-tight sm:text-4xl">Already know {name}?</h1>
      <p className="mt-3 text-lg text-ink-muted">
        Test what you know. Score {o.passMark}% or more and the whole path is complete, certificate included. If you don’t pass, nothing is lost: carry on with
        the topics, and you’ll see which ones to focus on.
      </p>
      <ul className="mt-5 grid gap-2 sm:grid-cols-3">
        {[
          { icon: "list" as const, big: `${o.questions} questions`, small: "from across the path" },
          { icon: "clock" as const, big: `About ${minutesLabel(o.minutes)}`, small: "in one sitting is best" },
          { icon: "star" as const, big: `${o.passMark}% to pass`, small: o.attempts === 1 ? "you have one try" : `${o.left} of ${o.attempts} tries left` },
        ].map((f) => (
          <li key={f.big} className="flex items-start gap-3 rounded-2xl bg-muted p-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-accent">
              <Icon name={f.icon} className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold leading-snug">{f.big}</span>
              <span className="block text-sm text-ink-muted">{f.small}</span>
            </span>
          </li>
        ))}
      </ul>
      {o.available || o.inProgress ? (
        <>
          <ul className="mt-5 flex flex-col gap-2.5 text-ink-muted">
            <li className="flex items-start gap-3">
              <Icon name="check" className="mt-0.5 size-4 shrink-0 text-accent" /> Answer every question. It’s marked all at once at the end.
            </li>
            <li className="flex items-start gap-3">
              <Icon name="refresh" className="mt-0.5 size-4 shrink-0 text-accent" /> You can go back and change an answer before you submit.
            </li>
            <li className="flex items-start gap-3">
              <Icon name="info" className="mt-0.5 size-4 shrink-0 text-accent" /> You have {tries}. It only counts once you submit.
            </li>
          </ul>
          {error && <p className="mt-4 rounded-2xl border border-danger/60 p-3">{error}</p>}
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" className={btn.primary} onClick={onStart} disabled={busy}>
              {busy ? "Starting…" : o.inProgress ? "Carry on with the quiz" : "Start the quiz"} <Icon name="arrow-right" className="size-4" />
            </button>
            <Link href={pathLink} className={btn.secondary}>
              Work through the topics instead
            </Link>
          </div>
        </>
      ) : (
        <p className="mt-6 rounded-2xl border border-line p-4">
          {o.passed
            ? "You’ve passed this quiz, so the path is complete."
            : o.left === 0
              ? "You’ve used your tries at this quiz. Work through the topics to complete the path."
              : "You’ve already finished this path."}{" "}
          <Link href={pathLink} className="font-semibold text-accent hover:underline">
            Back to the path
          </Link>
        </p>
      )}
    </header>
  );
}

function Asking({
  started: s,
  at,
  setAt,
  answers,
  onAnswer,
  onSubmit,
  busy,
  error,
}: {
  started: Started;
  at: number;
  setAt: (n: number) => void;
  answers: Record<string, string>;
  onAnswer: (key: string, v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
}) {
  const q = s.questions[at];
  const answered = s.questions.filter((x) => answers[x.key]).length;
  const last = at === s.questions.length - 1;
  // A question left unanswered earlier on, which has to be answered before submitting.
  const skipped = s.questions.findIndex((x, i) => i !== at && !answers[x.key]);
  return (
    <section className="mt-2" aria-labelledby="quiz-question">
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Upfront quiz · {s.path.name}</p>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm text-ink-muted">
        <span>
          Question {at + 1} of {s.questions.length}
        </span>
        <span>{answered} answered</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${answered} of ${s.questions.length} questions answered`}>
        <div className="h-full rounded-full bg-[#0e7c7b] transition-[width]" style={{ width: `${(answered / s.questions.length) * 100}%` }} />
      </div>

      <fieldset key={q.key} className="mt-6 flex flex-col gap-2">
        <legend className="mb-3">
          <span className="block text-sm font-semibold text-ink-muted">From “{q.topic}”</span>
          <span id="quiz-question" className="mt-1 block font-serif text-2xl font-semibold leading-snug">
            {q.prompt}
          </span>
        </legend>
        {q.options.map((o) => {
          const selected = answers[q.key] === o.id;
          return (
            <label
              key={o.id}
              className={cx(
                "fx-press relative flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-2 transition-colors",
                selected ? "fx-pop border-action bg-[#DDE8D9] dark:bg-tealtint" : "border-line bg-surface hover:border-line-strong",
              )}
            >
              <input
                type="radio"
                name={q.key}
                value={o.id}
                checked={selected}
                onChange={() => onAnswer(q.key, o.id)}
                className="size-5 shrink-0 accent-[var(--action)]"
              />
              <span>{o.label}</span>
            </label>
          );
        })}
      </fieldset>

      {error && <p className="mt-4 rounded-2xl border border-danger/60 p-3">{error}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button type="button" className={btn.secondary} onClick={() => setAt(at - 1)} disabled={at === 0 || busy}>
          <Icon name="arrow-left" className="size-4" /> Back
        </button>
        {last ? (
          <button type="button" className={btn.primary} onClick={() => (skipped === -1 ? onSubmit() : setAt(skipped))} disabled={!answers[q.key] || busy}>
            {busy ? "Marking…" : skipped === -1 ? "Submit my answers" : `Answer question ${skipped + 1} first`}
          </button>
        ) : (
          <button type="button" className={btn.primary} onClick={() => setAt(at + 1)} disabled={!answers[q.key]}>
            Next <Icon name="arrow-right" className="size-4" />
          </button>
        )}
      </div>
    </section>
  );
}

function Outcome({ result: r, pathLink, preview }: { result: Result & { focus: Focus[]; left: number }; pathLink: string; preview: boolean }) {
  return (
    <section className="mt-2" aria-live="polite">
      <div
        role="status"
        className={cx(
          "fx-rise flex flex-col gap-1 rounded-3xl px-5 py-5",
          r.passed ? "bg-[#DDE8D9] text-[#102a43]" : "border-2 border-danger/60 bg-surface text-ink",
        )}
      >
        <span className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em]">{r.passed ? "Passed" : "Not yet passed"}</span>
        <span className="font-serif text-4xl font-semibold">
          {r.score} of {r.total} · {r.percent}%
        </span>
        <span>
          {preview
            ? r.passed
              ? "In a real attempt, every topic in the path would now be marked complete, and the certificate would be ready."
              : `A learner needs ${r.passMark}% to pass. In a real attempt, they'd carry on with the topics, starting with the ones below.`
            : r.passed
              ? "Well done. You know this material, so every topic in the path is now marked complete."
              : `You needed ${r.passMark}%. Nothing is lost: work through the topics to complete the path.${r.left > 0 ? ` You have ${r.left} more ${r.left === 1 ? "try" : "tries"} at the quiz.` : ""}`}
        </span>
      </div>

      {r.focus.length > 0 && (
        <section className="mt-6">
          <h2 className="font-serif text-xl font-semibold">{r.passed ? "Worth a second look" : "Topics to focus on"}</h2>
          <p className="mt-1 text-ink-muted">You missed a question from {r.focus.length === 1 ? "this topic" : "these topics"}.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {r.focus.map((f) => (
              <li key={f.slug}>
                <Link
                  href={`/learning/${encodeURIComponent(f.slug)}`}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2 font-semibold hover:border-line-strong"
                >
                  {f.title} <Icon name="arrow-right" className="size-4 shrink-0 text-accent" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {r.passed && !preview && (
          <Link href={`${pathLink}/certificate`} className={btn.primary}>
            <Icon name="star" className="size-4" /> See your certificate
          </Link>
        )}
        <Link href={pathLink} className={r.passed ? btn.secondary : btn.primary}>
          Back to the path
        </Link>
      </div>
    </section>
  );
}
