"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import type { GuideDoc, PracticeItem } from "@/lib/magazine";
import { liveItems, pickItems, REVIEW_SIZE } from "@/lib/magazineReview";
import type { PracticeQuestion, PracticeSession } from "@/server/magazinePractice";
import type { ReaderGuide } from "@/server/magazine";
import { Icon } from "../Icon";
import "../player/fx.css";

/*
  "Test myself" and its Quick review (docs/magazine-self-review.md): three questions on this page, or on the
  course so far, one at a time, with feedback and a way back to the part of the course each comes from.
  Optional and private: it never finishes a page or completes anything. Closing it (Escape, Close, or
  following a source link) pauses the review; it picks up where it left off, here or on another device.

  For learners the server chooses the questions and keeps the answers. In an author's preview it runs in the
  browser from the draft's approved questions and records nothing.
*/

type State = {
  revisionId: string;
  page: { id: string; questions: number };
  course: { pages: number; questions: number } | null;
  session: PracticeSession | null;
  changed: boolean;
  history: { id: string; at: string; scope: "page" | "course"; pageTitle: string; total: number; correct: number }[];
};
type Scope = "page" | "course";

const words = ["No", "One", "Two", "Three", "Four", "Five"];
const promise = (n: number) =>
  n >= 3 ? "Three questions. About two minutes. Just for you." : `${words[n] ?? n} question${n === 1 ? "" : "s"}. About a minute. Just for you.`;

/** The same moves for a learner (on the server) and an author's preview (in the browser, nothing kept). */
type Engine = {
  state: () => Promise<State>;
  start: (scope: Scope) => Promise<PracticeSession>;
  answer: (s: PracticeSession, itemId: string, choiceId: string) => Promise<PracticeSession>;
  moment: (action: "opened" | "pause" | "resume" | "source", s: PracticeSession | null, pageId?: string) => Promise<PracticeSession | null>;
};

function serverEngine(guide: ReaderGuide, pageId: string): Engine {
  const url = `/api/magazine/${guide.id}/practice`;
  return {
    state: () => api<State>(`${url}?pageId=${encodeURIComponent(pageId)}`),
    start: (scope) => api<PracticeSession>(url, { body: { action: "start", scope, pageId, revisionId: guide.revisionId } }),
    answer: async (s, itemId, choiceId) =>
      (await api<{ session: PracticeSession }>(url, { body: { action: "answer", sessionId: s.id, itemId, choiceId } })).session,
    moment: async (action, s, at) => {
      const out = await api<{ session?: PracticeSession }>(url, { body: { action, sessionId: s?.id, pageId: at ?? pageId } });
      return out.session ?? null;
    },
  };
}

/** The author's preview: the draft's approved questions, graded here, kept only while the page is open. */
function previewEngine(guide: ReaderGuide, pageId: string, kept: { current: { session: PracticeSession | null; items: PracticeItem[] } }): Engine {
  const doc = guide.doc as GuideDoc;
  const content = doc.pages.filter((p) => p.kind === "content").map((p) => p.id);
  const title = (id: string) => {
    const i = doc.pages.findIndex((p) => p.id === id);
    return doc.pages[i]?.title || (doc.pages.length === 1 ? guide.title : `Page ${i + 1}`);
  };
  const view = (it: PracticeItem, choiceId?: string): PracticeQuestion => {
    const picked = it.choices.find((c) => c.id === choiceId);
    return {
      id: it.id,
      kind: it.kind,
      prompt: it.prompt,
      ...(it.example && { example: it.example }),
      choices: it.choices.map((c) => ({ id: c.id, text: c.text })),
      source: { pageId: it.pageId, ...(it.sectionId && { sectionId: it.sectionId }), title: title(it.pageId) },
      ...(choiceId && {
        result: {
          choiceId,
          correct: choiceId === it.answer,
          answer: it.answer,
          answerText: it.choices.find((c) => c.id === it.answer)?.text ?? "",
          explanation: it.explanation,
          ...(picked?.feedback && { feedback: picked.feedback }),
        },
      }),
    } as PracticeQuestion;
  };
  return {
    state: async () => ({
      revisionId: "draft",
      page: { id: pageId, questions: liveItems(doc, [pageId]).length },
      course: doc.pages.length > 1 ? { pages: content.length, questions: liveItems(doc, content).length } : null,
      session: kept.current.session && kept.current.session.status !== "completed" ? kept.current.session : null,
      changed: false,
      history: [],
    }),
    start: async (scope) => {
      const { items } = pickItems(liveItems(doc, scope === "course" ? content : [pageId]), [], [], new Date());
      kept.current.items = items;
      kept.current.session = {
        id: "preview",
        scope,
        status: "active",
        position: 0,
        total: items.length,
        repeats: false,
        questions: items.map((it) => view(it)),
      };
      return kept.current.session;
    },
    answer: async (s, itemId, choiceId) => {
      const i = s.questions.findIndex((q) => q.id === itemId);
      const questions = s.questions.map((q, j) => (j === i ? view(kept.current.items[j], choiceId) : q));
      const done = i + 1 >= s.total;
      kept.current.session = { ...s, questions, position: i + 1, status: done ? "completed" : "active" };
      return kept.current.session;
    },
    moment: async (action, s) => {
      if (!s || s.status === "completed") return s;
      kept.current.session = { ...s, status: action === "resume" ? "active" : "paused" };
      return kept.current.session;
    },
  };
}

/**
  Self-review on a page: `button` for the reading rail (or a floating button on a phone), `dialog` once on the
  page. Shown only on reading pages of a course with self-review on and questions to ask.
*/
export function useSelfReview({ guide, pageId, base, preview }: { guide: ReaderGuide; pageId: string; base: string; preview: boolean }) {
  const router = useRouter();
  const doc = guide.doc as GuideDoc;
  const page = doc.pages.find((p) => p.id === pageId);
  const kept = useRef<{ session: PracticeSession | null; items: PracticeItem[] }>({ session: null, items: [] });
  // In a preview, the draft's own questions (even before self-review is switched on, so it can be tried first).
  const previewCount = preview ? liveItems(doc).length : 0;
  const available = page?.kind === "content" && (preview ? previewCount > 0 : Boolean(guide.practice && Object.keys(guide.practice.pages).length));
  const engineFor = useMemo(() => (preview ? previewEngine(guide, pageId, kept) : serverEngine(guide, pageId)), [guide, pageId, preview]);
  const engine = useRef<Engine>(engineFor);
  useEffect(() => {
    engine.current = engineFor;
  }, [engineFor]);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [view, setView] = useState<"intro" | "question" | "summary" | "history">("intro");
  const [scope, setScope] = useState<Scope>("page");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const descId = useId();
  const scopeKey = `practice-scope:${guide.id}`;

  // Whether there's a review to resume, for the button's label. Learners only (a preview starts fresh).
  useEffect(() => {
    if (!available || preview) return;
    let live = true;
    engineFor
      .state()
      .then((s) => {
        if (!live) return;
        setState(s);
        setSession(s.session);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [available, preview, engineFor]);

  const load = useCallback(async () => {
    const s = await engine.current.state();
    setState(s);
    setSession(s.session);
    let pref: Scope = "page";
    try {
      if (localStorage.getItem(scopeKey) === "course" && s.course) pref = "course";
    } catch {}
    setScope(pref);
    return s;
  }, [scopeKey]);

  const open = async (e?: React.MouseEvent<HTMLButtonElement>) => {
    if (e) trigger.current = e.currentTarget;
    setProblem(null);
    setPicked(null);
    setView("intro");
    dialog.current?.showModal();
    setIsOpen(true);
    try {
      const s = await load();
      void engine.current.moment("opened", null).catch(() => {});
      // Straight back into a review they were part-way through.
      if (s.session && s.session.status === "paused") setView("intro");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Quick review didn’t load. Try again.");
    }
  };

  /** Closing pauses a review in progress; focus goes back to the button. */
  const onClose = () => {
    setIsOpen(false);
    if (session && session.status === "active") {
      const s = { ...session, status: "paused" as const };
      setSession(s);
      void engine.current.moment("pause", session).catch(() => {});
    }
    trigger.current?.focus();
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Try again.";
      setProblem(msg);
      // The course changed under a review: it has ended; start again from the intro.
      if ((err as { status?: number }).status === 409) {
        setSession(null);
        setView("intro");
        void load().catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  };

  const start = (sc: Scope) =>
    run(async () => {
      try {
        localStorage.setItem(scopeKey, sc);
      } catch {}
      const s = await engine.current.start(sc);
      setSession(s);
      setPicked(null);
      setView("question");
    });
  const resume = () =>
    run(async () => {
      const s = (await engine.current.moment("resume", session)) ?? session;
      setSession(s);
      setPicked(null);
      setView("question");
    });

  const current = session ? (session.questions[session.position] ?? session.questions[session.questions.length - 1]) : null;
  // The question on screen: the one just answered (showing its feedback) until they move on.
  const [showing, setShowing] = useState<string | null>(null);
  const q = session?.questions.find((x) => x.id === showing) ?? current;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !q || !picked) return;
    void run(async () => {
      const s = await engine.current.answer(session, q.id, picked);
      setSession(s);
      setShowing(q.id);
    });
  };
  const next = () => {
    setShowing(null);
    setPicked(null);
    if (session?.status === "completed") setView("summary");
  };

  /** "See this in the course": pauses the review, closes the dialog and goes to the section. */
  const goToSource = (src: PracticeQuestion["source"]) => {
    const s = session;
    if (s && s.status === "active") {
      setSession({ ...s, status: "paused" });
      void engine.current.moment("source", s, src.pageId).catch(() => {});
    } else if (s) void engine.current.moment("source", s, src.pageId).catch(() => {});
    setShowing(null);
    setIsOpen(false);
    dialog.current?.close();
    const hash = src.sectionId ? `#section-${src.sectionId}` : "";
    if (src.pageId === pageId || doc.pages.length === 1) {
      const el = src.sectionId ? document.getElementById(`section-${src.sectionId}`) : null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState(null, "", hash);
        (el.querySelector("h2") as HTMLElement | null)?.focus?.();
      }
    } else router.push(`${base}/${src.pageId}${hash}`);
  };

  const resumable = session && (session.status === "paused" || session.status === "active") && session.position < session.total;
  const label = resumable ? "Resume review" : "Test myself";

  const button = (where: "rail" | "float") =>
    !available ? null : (
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className={cx(
          "fx-press inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-semibold",
          where === "rail"
            ? "w-full border-2 border-action bg-surface px-4 text-accent hover:bg-tealtint"
            : "fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 bg-action px-5 text-on-action shadow-lg hover:bg-action-hover lg:hidden",
        )}
      >
        <Icon name="spark" className="size-4" /> {label}
      </button>
    );

  const total = session?.total ?? 0;
  const answered = session?.questions.filter((x) => x.result) ?? [];
  const right = answered.filter((x) => x.result!.correct);
  const missed = answered.filter((x) => !x.result!.correct);
  const count = (sc: Scope) => (sc === "course" ? (state?.course?.questions ?? 0) : (state?.page.questions ?? 0));

  const body = () => {
    if (!state) return <p className="text-ink-muted">{problem ?? "Loading…"}</p>;
    if (view === "history")
      return (
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold">My reviews</h3>
          <p className="text-sm text-ink-muted">Only you can see these. They’re practice, so they don’t count towards finishing the course.</p>
          {state.history.length ? (
            <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
              {state.history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <span className="font-semibold">{h.scope === "course" ? "Course so far" : h.pageTitle}</span>
                    <span className="block text-ink-muted">{formatDate(h.at)}</span>
                  </span>
                  <span className="shrink-0 font-semibold">
                    {h.correct} of {h.total}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">No finished reviews yet.</p>
          )}
          <button type="button" className="self-start text-sm font-semibold text-accent hover:underline" onClick={() => setView("intro")}>
            Back
          </button>
        </div>
      );
    if (view === "summary" && session)
      return (
        <div className="flex flex-col gap-4">
          <p className="fx-pop inline-flex items-center gap-2 self-start rounded-full bg-tealtint px-3 py-1 text-sm font-semibold text-accent">
            <Icon name="circle-check" className="size-4" /> Review done
          </p>
          <h3 className="font-serif text-2xl font-semibold">
            You reviewed {total}{" "}
            {session.questions.every((x) => x.kind === "scenario") ? (total === 1 ? "decision" : "decisions") : total === 1 ? "question" : "questions"}
          </h3>
          {right.length > 0 && (
            <div>
              <p className="text-sm font-bold">Confident on</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {right.map((x) => (
                  <li key={x.id}>{x.prompt}</li>
                ))}
              </ul>
            </div>
          )}
          {missed.length > 0 && (
            <div>
              <p className="text-sm font-bold">Worth revisiting</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {missed.map((x) => (
                  <li key={x.id}>{x.prompt}</li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
                onClick={() => goToSource(missed[0].source)}
              >
                <Icon name="arrow-right" className="size-4" /> Revisit “{missed[0].source.title}”
              </button>
            </div>
          )}
          {session.repeats && <p className="text-sm text-ink-muted">This course has a small set of questions, so some may repeat.</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
              onClick={() => dialog.current?.close()}
            >
              Back to the page
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-5 font-semibold hover:bg-muted"
              disabled={busy}
              onClick={() => start(session.scope)}
            >
              Try another review
            </button>
          </div>
        </div>
      );
    if (view === "question" && session && q) {
      const i = session.questions.indexOf(q);
      const r = q.result;
      return (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold" aria-live="polite">
              {i + 1} of {session.total}
            </p>
            <span className="flex gap-1" aria-hidden>
              {session.questions.map((x, j) => (
                <span key={x.id} className={cx("h-1.5 w-6 rounded-full", j < i || (j === i && r) ? "bg-action" : j === i ? "bg-action/40" : "bg-muted")} />
              ))}
            </span>
            <span className="ml-auto text-xs font-semibold uppercase tracking-wide text-ink-muted">{q.kind === "spot" ? "Spot the issue" : "Scenario"}</span>
          </div>
          {q.example && (
            <blockquote className="rounded-2xl border-l-4 border-gold bg-muted/60 px-4 py-3 text-base leading-relaxed">{q.example}</blockquote>
          )}
          <fieldset disabled={Boolean(r) || busy} className="flex flex-col gap-2">
            <legend className="mb-2 font-serif text-xl font-semibold leading-snug">{q.prompt}</legend>
            {q.choices.map((c) => {
              const mine = r ? r.choiceId === c.id : picked === c.id;
              const best = r && r.answer === c.id;
              return (
                <label
                  key={c.id}
                  className={cx(
                    "fx-press flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                    best
                      ? "border-[#2f8f5b] bg-[#e9f6ef] dark:bg-[#17301f]"
                      : r && mine
                        ? "border-[#c7393e] bg-[#fdf1f0] dark:bg-[#3a1f1f]"
                        : mine
                          ? "border-action bg-tealtint"
                          : "border-line-strong hover:border-action",
                    r && best && mine && "fx-correct",
                  )}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    value={c.id}
                    checked={mine}
                    onChange={() => setPicked(c.id)}
                    className="mt-1 size-4 shrink-0 accent-[var(--color-action)]"
                  />
                  <span className="min-w-0 flex-1">
                    {c.text}
                    {best && <span className="mt-1 block text-xs font-bold text-[#0f5b3a] dark:text-[#8fe0b5]">Best answer</span>}
                    {r && mine && !best && <span className="mt-1 block text-xs font-bold text-[#a12d31] dark:text-[#f3a7a9]">Your answer</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
          {r ? (
            <div role="status" className="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
              <p className="flex items-center gap-2 font-semibold">
                <Icon name={r.correct ? "circle-check" : "info"} className={cx("size-5", r.correct ? "text-[#2f8f5b]" : "text-accent")} />
                {r.correct ? "Good call" : "Have another look"}
              </p>
              {!r.correct && r.feedback && (
                <p className="text-sm">
                  <span className="font-bold">What to revisit: </span>
                  {r.feedback}
                </p>
              )}
              <p className="text-sm">
                <span className="font-bold">What works: </span>
                {r.explanation}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={next}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
                >
                  {session.status === "completed" && i === session.total - 1 ? "See how you went" : "Next question"}{" "}
                  <Icon name="arrow-right" className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => goToSource(q.source)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-accent hover:underline"
                >
                  See this in the course
                  <span className="sr-only"> ({q.source.title})</span>
                </button>
              </div>
            </div>
          ) : (
            <button
              type="submit"
              disabled={!picked || busy}
              className="inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-action px-6 font-semibold text-on-action hover:bg-action-hover disabled:opacity-45"
            >
              {busy ? "Checking…" : "Check my answer"}
            </button>
          )}
        </form>
      );
    }
    // The start: what to review, or carry on where they left off.
    const n = count(scope);
    return (
      <div className="flex flex-col gap-4">
        {preview && !doc.review?.enabled && (
          <p className="rounded-2xl bg-[#fff6e4] px-4 py-2 text-sm dark:bg-[#3a2f17]">Preview: self-review is switched off, so learners don’t see this yet.</p>
        )}
        {state.changed && (
          <p className="rounded-2xl bg-muted px-4 py-2 text-sm">The course changed since your last review, so that review ended. Start a new one any time.</p>
        )}
        {resumable && session ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-tealtint p-4">
            <p className="font-semibold">
              You’re part-way through a review: question {Math.min(session.position + 1, session.total)} of {session.total}.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={resume}
                className="inline-flex min-h-11 items-center rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
              >
                Resume
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => start(session.scope)}
                className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface px-5 font-semibold hover:bg-muted"
              >
                Start again
              </button>
            </div>
          </div>
        ) : null}
        {state.course && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">What to review</legend>
            {(
              [
                ["page", "This page", `${state.page.questions} question${state.page.questions === 1 ? "" : "s"}`],
                ["course", "Course so far", `the ${state.course.pages} page${state.course.pages === 1 ? "" : "s"} you’ve opened`],
              ] as const
            ).map(([v, l, d]) => (
              <label
                key={v}
                className={cx(
                  "flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3",
                  scope === v ? "border-action bg-tealtint" : "border-line-strong hover:border-action",
                )}
              >
                <input
                  type="radio"
                  name="practice-scope"
                  value={v}
                  checked={scope === v}
                  onChange={() => setScope(v)}
                  className="size-4 accent-[var(--color-action)]"
                />
                <span>
                  <span className="font-semibold">{l}</span>
                  <span className="block text-sm text-ink-muted">{d}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {n > 0 ? (
          <>
            <p id={descId}>{promise(Math.min(REVIEW_SIZE, n))}</p>
            {n < REVIEW_SIZE && (
              <p className="text-sm text-ink-muted">
                There {n === 1 ? "is" : "are"} only {words[n]?.toLowerCase() ?? n} for now, so this review is shorter.
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => start(scope)}
              className="inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-action px-6 font-semibold text-on-action hover:bg-action-hover"
            >
              Start review <Icon name="arrow-right" className="size-4" />
            </button>
          </>
        ) : (
          <p id={descId} className="rounded-2xl bg-muted px-4 py-3 text-sm">
            There aren’t any questions to review {scope === "course" ? "for the pages you’ve opened" : "for this page"} yet. Carry on reading; you can try again
            later.
          </p>
        )}
        {!preview && state.history.length > 0 && (
          <button type="button" className="self-start text-sm font-semibold text-accent hover:underline" onClick={() => setView("history")}>
            My reviews ({state.history.length})
          </button>
        )}
      </div>
    );
  };

  const dialogEl = !available ? null : (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      className="m-auto max-h-[90vh] w-[min(40rem,calc(100vw-2rem))] max-w-none overflow-y-auto rounded-3xl bg-bg p-0 text-ink shadow-2xl backdrop:bg-[#0b1626]/70 max-sm:m-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-screen max-sm:rounded-none"
    >
      {isOpen && (
        <div className="flex flex-col gap-5 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className="font-serif text-2xl font-semibold">
                Quick review
              </h2>
              {view === "intro" && <p className="text-sm text-ink-muted">Practice just for you: it doesn’t count towards finishing the course.</p>}
            </div>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 font-semibold hover:bg-muted"
            >
              <Icon name="close" className="size-4" /> Close
            </button>
          </div>
          {problem && state && (
            <p role="alert" className="rounded-2xl bg-[#fdf1f0] px-4 py-2 text-sm text-[#a12d31] dark:bg-[#3a1f1f] dark:text-[#f3a7a9]">
              {problem}
            </p>
          )}
          {body()}
        </div>
      )}
    </dialog>
  );

  return { button, dialog: dialogEl, available };
}
