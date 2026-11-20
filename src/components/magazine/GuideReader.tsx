"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { BLOCK_LABELS, openActivities, pageBlocks, pageTitle, type Page } from "@/lib/magazine";
import type { ReaderGuide, ReaderNote } from "@/server/magazine";
import { Icon } from "../Icon";
import { GuideBlock, column, type BlockContext } from "./GuideBlocks";
import type { ReflectionSaved } from "./InteractiveBlocks";
import { AudioGuideCard } from "./AudioGuide";
import { useSelfReview } from "./SelfReview";
import { useMyNotes } from "./ReflectBlocks";
import { playable } from "@/lib/magazineNarration";

/*
  Reading a Magazine. A one-page Guide opens straight on its article; a Course opens on an overview
  (its pages, their purposes and times, what completing it takes, Start or Resume), then each page reads
  like a magazine article: the course's pages in a rail that shows where you are, a smaller index of the
  page's sections, and Previous and Next at the end. Finishing a page is the reader's choice, never
  scrolling; what completes the course follows its completion mode.

  base: where the course lives (/magazine/<slug>, or /magazine/draft/<id> for an author's preview).
  preview: an author looking at the saved draft. Nothing is recorded.
*/

type Done = ReaderGuide["completed"];

/**
  The learner's Audio Guide choice for this course (kept with their progress), and whether to offer it:
  only when the author allows automatic playback and something here can be heard. With "auto" it starts
  on until they turn it off; with "offer-auto" it starts off until they turn it on.
*/
function useAudioGuide(guide: ReaderGuide, send: ReturnType<typeof useSend>) {
  const audio = guide.doc.audio;
  const chosen = guide.progress.answers["audio:guide"];
  const [on, setOn] = useState(audio?.playback === "auto" ? chosen !== "off" : chosen === "on");
  const offered =
    (audio?.playback === "auto" || audio?.playback === "offer-auto") &&
    (playable(audio.intro, audio) || guide.doc.pages.some((p) => playable(p.narration, audio)));
  const change = (next: boolean) => {
    setOn(next);
    send("events", { event: "audioGuide", detail: { on: next } }).catch(() => {});
  };
  return { audio, on: Boolean(offered && on), offered: Boolean(offered), change };
}

/** Sends what the reader did. A 409 means the course was republished while the page was open. */
function useSend(guide: ReaderGuide, preview: boolean, onStale: () => void) {
  return useCallback(
    async <T,>(path: "events" | "finish" | "complete" | "reflect", body: Record<string, unknown>): Promise<T | null> => {
      if (preview) return null;
      try {
        return await api<T>(`/api/magazine/${guide.id}/${path}`, { body: { revisionId: guide.revisionId, ...body } });
      } catch (e) {
        if ((e as { status?: number }).status === 409) onStale();
        throw e;
      }
    },
    [guide.id, guide.revisionId, preview, onStale],
  );
}

function Notices({ guide, preview, stale }: { guide: ReaderGuide; preview: boolean; stale: boolean }) {
  return (
    <>
      {preview && (
        <p role="note" className="mt-6 flex items-center gap-2 rounded-2xl border-2 border-dashed border-gold bg-gold/10 p-4 font-semibold">
          <Icon name="eye" className="size-5 shrink-0" /> Preview of the saved draft. Learners see it like this once it’s published; nothing you do here is
          recorded.
        </p>
      )}
      {guide.olderEdition && !preview && (
        <div role="note" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-tealtint p-4">
          <p className="min-w-0 flex-1">You’re finishing the edition you started. A newer edition has been published since.</p>
          <button
            type="button"
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover"
            onClick={async () => {
              // Move on to the latest edition, starting it afresh; anything completed stays on record.
              await api(`/api/magazine/${guide.id}/events`, { body: { revisionId: guide.revisionId, event: "switch" } }).catch(() => {});
              window.location.reload();
            }}
          >
            <Icon name="refresh" className="size-4" /> Switch to the latest edition
          </button>
        </div>
      )}
      {stale && (
        <p role="alert" className="mt-6 rounded-2xl bg-[#fff6e4] p-4 font-semibold text-[#5c3d00]">
          This guide has been updated since you opened it.{" "}
          <button type="button" onClick={() => window.location.reload()} className="underline">
            Reload to read the latest edition
          </button>
          .
        </p>
      )}
    </>
  );
}

const doneText = (c: NonNullable<Done>) => `${c.kind === "acknowledged" ? "Marked as read" : "Completed"} on ${formatDate(c.at)}`;

function requirementText(guide: ReaderGuide) {
  const required = guide.doc.pages.filter((p) => p.required).length;
  const all = required === guide.doc.pages.length;
  switch (guide.completion) {
    case "reference":
      return "A reference course: read any page, whenever you need it.";
    case "confirm":
      return all ? "Finish each page to complete the course." : `Finish the ${required} required pages to complete the course; the others are optional.`;
    case "decision":
      return "Answer the questions on each required page, then finish it, to complete the course.";
    case "assessed":
      return "Finish the required pages and pass the quiz to complete the course.";
  }
}

// ---------------------------------------------------------------------------------------------------
// The course overview
// ---------------------------------------------------------------------------------------------------

export function CourseOverview({ guide, base, preview = false }: { guide: ReaderGuide; base: string; preview?: boolean }) {
  const [stale, setStale] = useState(false);
  const [completed, setCompleted] = useState<Done>(guide.completed);
  const [problem, setProblem] = useState<string | null>(null);
  const send = useSend(
    guide,
    preview,
    useCallback(() => setStale(true), []),
  );

  useEffect(() => {
    send("events", { event: "opened" }).catch(() => {});
  }, [send]);

  const pages = guide.doc.pages;
  const finished = new Set(guide.progress.finished);
  const resumeAt = guide.progress.lastPage ? pages.find((p) => p.id === guide.progress.lastPage) : undefined;
  const next = resumeAt ?? pages.find((p) => !finished.has(p.id)) ?? pages[0];
  const started = guide.progress.started && !preview;
  const doneHere = completed?.thisRevision ? completed : null;
  const audioGuide = useAudioGuide(guide, send);

  const acknowledge = async () => {
    setProblem(null);
    try {
      const out = await send<{ kind: "acknowledged" | "completed"; at: string }>("complete", {});
      if (out) setCompleted({ ...out, thisRevision: true });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
    }
  };

  return (
    <article className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <Link href={preview ? "/admin/magazine" : "/magazine"} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> {preview ? "Magazine admin" : "Magazine"}
      </Link>
      <header className="mt-4 grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
        <div>
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">
            Course · {pages.length} pages{guide.audience && <> · For {guide.audience}</>}
          </p>
          <h1 className="mt-2 font-serif text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">{guide.title}</h1>
          {guide.standfirst && <p className="mt-4 text-xl leading-relaxed text-ink-muted">{guide.standfirst}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="clock" className="size-4" /> About {guide.minutes} min in all
            </span>
            {pages.length > 1 && audioGuide.audio?.intro && (
              <AudioGuideCard
                variant="inline"
                toggle={audioGuide.offered ? { on: audioGuide.on, onChange: audioGuide.change } : undefined}
                narration={audioGuide.audio.intro}
                audio={audioGuide.audio}
                level="course"
                autoplay={audioGuide.on && !doneHere}
                onEvent={(outcome) => send("events", { event: "narration", pageId: "intro", detail: { outcome } }).catch(() => {})}
              />
            )}
            <span>
              {guide.revision > 1 ? "Updated" : "Published"} {formatDate(guide.publishedAt)}
            </span>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={`${base}/${next.id}`}
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-action px-6 font-semibold text-on-action hover:bg-action-hover"
            >
              {started ? `Resume: ${pageTitle(guide.doc, next, guide.title)}` : "Start the course"} <Icon name="arrow-right" className="size-4" />
            </Link>
            {doneHere && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#0f5b3a] dark:text-[#8fe0b5]">
                <Icon name="circle-check" className="size-5" /> {doneText(doneHere)}
              </span>
            )}
          </div>
        </div>
        {guide.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={guide.cover} alt="" className="aspect-[16/9] w-full rounded-3xl bg-muted object-cover" />
        )}
      </header>
      <Notices guide={guide} preview={preview} stale={stale} />

      <section aria-labelledby="pages-h" className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="pages-h" className="font-serif text-2xl font-semibold">
            In this course
          </h2>
          <p className="text-sm text-ink-muted">{requirementText(guide)}</p>
        </div>
        <ol className="mt-5 flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface">
          {pages.map((p, i) => {
            const state = finished.has(p.id) ? "Finished" : guide.progress.lastPage === p.id ? "In progress" : "Not started";
            return (
              <li key={p.id} className="group relative flex items-start gap-4 p-4 sm:p-5">
                <span
                  className={cx(
                    "grid size-10 shrink-0 place-items-center rounded-full font-mulish text-sm font-extrabold",
                    finished.has(p.id) ? "bg-[#2f8f5b] text-white" : "bg-tealtint text-ink",
                  )}
                  aria-hidden
                >
                  {finished.has(p.id) ? <Icon name="check" className="size-5" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-serif text-xl font-semibold leading-snug">
                    <Link
                      href={`${base}/${p.id}`}
                      className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4"
                    >
                      {pageTitle(guide.doc, p, guide.title)}
                    </Link>
                  </h3>
                  {p.purpose && <p className="mt-1 text-ink-muted">{p.purpose}</p>}
                  <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-ink-muted">
                    <span>{guide.pageMinutes[p.id]} min</span>
                    {p.kind === "assessment" && <span>Quiz</span>}
                    {!p.required && <span>Optional</span>}
                    {!preview && <span className={cx(state === "Finished" && "font-semibold text-[#0f5b3a] dark:text-[#8fe0b5]")}>{state}</span>}
                  </p>
                </div>
                <Icon name="arrow-right" className="mt-3 size-4 shrink-0 text-accent" />
              </li>
            );
          })}
        </ol>
        {guide.completion === "reference" && !doneHere && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={acknowledge}
              disabled={preview}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-5 font-semibold hover:bg-muted disabled:opacity-50"
            >
              <Icon name="check" className="size-4" /> Mark as read
            </button>
            {problem && <p className="text-sm font-semibold text-danger">{problem}</p>}
          </div>
        )}
      </section>
    </article>
  );
}

// ---------------------------------------------------------------------------------------------------
// A page
// ---------------------------------------------------------------------------------------------------

export function GuideReader({ guide, pageId, base, preview = false }: { guide: ReaderGuide; pageId: string; base: string; preview?: boolean }) {
  const pages = guide.doc.pages;
  const index = Math.max(
    0,
    pages.findIndex((p) => p.id === pageId),
  );
  const page = pages[index];
  const course = pages.length > 1;
  const [answers, setAnswers] = useState(guide.progress.answers);
  const [finished, setFinished] = useState<string[]>(guide.progress.finished);
  const [reflections, setReflections] = useState<Record<string, ReflectionSaved>>(guide.progress.reflections ?? {});
  // Reflect and apply: the learner's own journal entries, action notes and pulse answers.
  const [notes, setNotes] = useState<Record<string, ReaderNote>>(guide.progress.notes ?? {});
  const perspectivesSent = useRef(new Set<string>());
  const [completed, setCompleted] = useState<Done>(guide.completed);
  const [active, setActive] = useState<string>(page.sections[0]?.id ?? "");
  const [stale, setStale] = useState(false);
  const reported = useRef<string | null>(guide.progress.lastSection);
  const engagedSent = useRef(new Set<string>());
  const send = useSend(
    guide,
    preview,
    useCallback(() => setStale(true), []),
  );
  const audioGuide = useAudioGuide(guide, send);
  // Self-review: "Test myself" in the rail (floating on a phone), and its Quick review dialog.
  const selfReview = useSelfReview({ guide, pageId: page.id, base, preview });

  // Opening the page is recorded (it's not a finish).
  useEffect(() => {
    send("events", course ? { event: "page", pageId: page.id } : { event: "opened" }).catch(() => {});
  }, [send, course, page.id]);

  // A link to a section (…#section-x) lands there once the page has streamed in.
  useEffect(() => {
    const target = decodeURIComponent(window.location.hash.slice(1));
    if (target) document.getElementById(target)?.scrollIntoView();
  }, []);

  // The section index follows the section in view, and the section reached is kept so they can pick up there.
  useEffect(() => {
    const els = page.sections.map((s) => document.getElementById(`section-${s.id}`)).filter((x): x is HTMLElement => Boolean(x));
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id.replace(/^section-/, ""), e.isIntersecting);
        const current = page.sections.find((s) => seen.get(s.id));
        if (current) setActive(current.id);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    els.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [page.sections]);

  useEffect(() => {
    if (preview || !active || reported.current === active) return;
    const t = setTimeout(() => {
      reported.current = active;
      send("events", { event: "section", sectionId: active }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [active, send, preview]);

  const ctx: BlockContext = {
    answers,
    preview,
    guideId: guide.id,
    quizzes: guide.quizzes,
    reflections,
    answer: async (blockId, choiceId) => {
      await send("events", { event: "decision", blockId, choiceId });
      setAnswers((a) => ({ ...a, [blockId]: choiceId }));
    },
    rate: async (blockId, rating) => {
      await send("events", { event: "confidence", blockId, rating });
      setAnswers((a) => ({ ...a, [blockId]: String(rating) }));
    },
    // How an interactive block went. Nothing waits on it, and a miss doesn't matter.
    activity: (blockId, detail) => void send("events", { event: "activity", blockId, detail }).catch(() => {}),
    // The reader has worked through a block: counted here at once, and kept for when they come back.
    engaged: (blockId) => {
      if (engagedSent.current.has(blockId)) return;
      engagedSent.current.add(blockId);
      setAnswers((a) => (a[`done:${blockId}`] ? a : { ...a, [`done:${blockId}`]: "1" }));
      void send("events", { event: "engaged", blockId }).catch(() => {});
    },
    reflect: async (blockId, response) => {
      const saved = await send<ReflectionSaved>("reflect", { blockId, response });
      if (!saved) throw new Error("Feedback works once the guide is published.");
      setReflections((r) => ({ ...r, [blockId]: saved }));
      return saved;
    },
    guide: guide.guide,
    // What they did with a guide recording: for the course's analytics only. Nothing waits on it.
    guideEvent: (blockId, outcome) => void send("events", { event: "guide", blockId, detail: { outcome } }).catch(() => {}),
    notes,
    find: (blockId) => pages.flatMap(pageBlocks).find((x) => x.id === blockId),
    saveNote: async (blockId, patch) => {
      let note: ReaderNote;
      if (preview) {
        // An author's preview: kept on the page only, so the blocks can be tried. Nothing is saved.
        const b = pages.flatMap(pageBlocks).find((x) => x.id === blockId);
        const at = new Date().toISOString();
        const label =
          b?.type === "pulse"
            ? b.options.find((o) => o.id === patch.choice)?.label
            : b?.type === "action"
              ? b.suggestions.find((sg) => sg.id === patch.choice)?.text
              : undefined;
        note = {
          blockId,
          kind: b?.type === "pulse" ? "pulse" : b?.type === "action" ? "action" : "journal",
          body: patch.state === "skipped" ? "" : (patch.body ?? ""),
          choice: label ? (patch.choice ?? null) : null,
          choiceLabel: label ?? null,
          status: patch.status ?? null,
          state: patch.state ?? "saved",
          createdAt: notes[blockId]?.createdAt ?? at,
          updatedAt: at,
        };
      } else note = (await api<{ note: ReaderNote }>(`/api/magazine/${guide.id}/notes`, { body: { revisionId: guide.revisionId, blockId, ...patch } })).note;
      setNotes((n) => ({ ...n, [blockId]: note }));
      return note;
    },
    opened: (blockId) => {
      if (preview || perspectivesSent.current.has(blockId)) return;
      perspectivesSent.current.add(blockId);
      void api(`/api/magazine/${guide.id}/notes`, { body: { action: "perspectives", revisionId: guide.revisionId, blockId } }).catch(() => {});
    },
  };
  // My Notes: their own entries in this course.
  const myNotes = useMyNotes({
    guide,
    preview,
    notes,
    onChanged: (blockId, note) =>
      setNotes((n) => {
        const next = { ...n };
        if (note) next[blockId] = note;
        else delete next[blockId];
        return next;
      }),
  });

  const resume =
    !course && guide.progress.lastSection && guide.progress.lastSection !== page.sections[0]?.id
      ? page.sections.find((s) => s.id === guide.progress.lastSection)
      : null;
  const title = pageTitle(guide.doc, page, guide.title);
  const hero = course ? page.hero : guide.cover ? { src: guide.cover, alt: "" } : undefined;
  const doneHere = completed?.thisRevision ? completed : null;

  return (
    <article className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
        <Link href={preview ? "/admin/magazine" : "/magazine"} className="inline-flex items-center gap-1 text-accent hover:underline">
          <Icon name="arrow-left" className="size-4" /> {preview ? "Magazine admin" : "Magazine"}
        </Link>
        {course && (
          <>
            <span className="text-ink-muted" aria-hidden>
              /
            </span>
            <Link href={base} className="text-accent hover:underline">
              {guide.title}
            </Link>
          </>
        )}
      </nav>

      <header className="mt-4 grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
        <div className={cx("mag-hero-text relative z-30", !hero?.src && "lg:col-span-2 lg:max-w-3xl")}>
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">
            {course ? (
              <>
                Page {index + 1} of {pages.length}
                {!page.required && " · Optional"}
              </>
            ) : (
              <>Guide{guide.audience && <> · For {guide.audience}</>}</>
            )}
          </p>
          <h1 className="mt-2 font-serif text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">{title}</h1>
          {(course ? page.purpose : guide.standfirst) && (
            <p className="mt-4 text-xl leading-relaxed text-ink-muted">{course ? page.purpose : guide.standfirst}</p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="clock" className="size-4" /> {guide.pageMinutes[page.id]} min read
            </span>
            {/* On a phone the reading rail is a menu, so My notes sits here. */}
            {myNotes.button && <span className="lg:hidden">{myNotes.button}</span>}
            {page.kind === "content" && audioGuide.audio && (audioGuide.offered || playable(page.narration, audioGuide.audio)) && (
              <AudioGuideCard
                key={page.id}
                variant="inline"
                toggle={audioGuide.offered ? { on: audioGuide.on, onChange: audioGuide.change } : undefined}
                narration={page.narration}
                audio={audioGuide.audio}
                level={course ? "page" : "course"}
                autoplay={audioGuide.on && !finished.includes(page.id)}
                onEvent={(outcome) => send("events", { event: "narration", pageId: page.id, detail: { outcome } }).catch(() => {})}
              />
            )}
            {!course && (
              <span>
                {guide.revision > 1 ? "Updated" : "Published"} {formatDate(guide.publishedAt)}
              </span>
            )}
            {finished.includes(page.id) && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#0f5b3a] dark:text-[#8fe0b5]">
                <Icon name="circle-check" className="size-4" /> {course ? "Page finished" : "Completed"}
              </span>
            )}
            {!course && doneHere?.kind === "acknowledged" && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#0f5b3a] dark:text-[#8fe0b5]">
                <Icon name="circle-check" className="size-4" /> Read
              </span>
            )}
          </div>
          {resume && (
            <a
              href={`#section-${resume.id}`}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-tealtint px-4 font-semibold hover:underline"
            >
              Pick up where you left off: {resume.title} <Icon name="arrow-right" className="size-4" />
            </a>
          )}
        </div>
        {hero?.src && (
          // The picture at the top is decoration: the headline says what it's about.
          <div className="overflow-hidden rounded-3xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero.src} alt="" className="mag-hero-picture aspect-[16/9] w-full object-cover" />
          </div>
        )}
      </header>
      <Notices guide={guide} preview={preview} stale={stale} />

      <div className="mt-10 grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)]">
        <Rail
          guide={guide}
          page={page}
          base={base}
          active={active}
          finished={finished}
          extra={
            (selfReview.available || myNotes.available) && (
              <div className="flex flex-col gap-2">
                {selfReview.button("rail")}
                {myNotes.button}
              </div>
            )
          }
        />
        <div className="flex min-w-0 flex-col gap-16">
          {page.sections.map((s, i) => (
            <section key={s.id} id={`section-${s.id}`} aria-labelledby={`h-${s.id}`} className="flex scroll-mt-24 flex-col gap-8">
              <div className={cx(column, "mag-reveal")}>
                <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">{String(i + 1).padStart(2, "0")}</p>
                <h2 id={`h-${s.id}`} className="mt-1 font-serif text-3xl font-semibold tracking-tight">
                  {s.title}
                </h2>
              </div>
              {s.blocks.map((b) => (
                <div key={b.id} className="mag-reveal" data-reveal={b.reveal}>
                  <GuideBlock block={b} ctx={ctx} />
                </div>
              ))}
            </section>
          ))}
          <Finish
            guide={guide}
            page={page}
            base={base}
            preview={preview}
            answers={answers}
            finished={finished}
            completed={completed}
            send={send}
            onFinished={(f, c) => {
              setFinished(f);
              if (c) setCompleted({ ...c, thisRevision: true });
            }}
          />
        </div>
      </div>
      {selfReview.button("float")}
      {selfReview.dialog}
      {myNotes.dialog}
    </article>
  );
}

/** The course's pages (where you are, what's finished), then this page's sections. One menu on a phone. */
function Rail({
  guide,
  page,
  base,
  active,
  finished,
  extra,
}: {
  guide: ReaderGuide;
  page: Page;
  base: string;
  active: string;
  finished: string[];
  /** Kept in reach at the end of the rail (self-review's Test myself). */
  extra?: React.ReactNode;
}) {
  const course = guide.doc.pages.length > 1;
  const close = (e: React.MouseEvent<HTMLAnchorElement>) => e.currentTarget.closest("details")?.removeAttribute("open");
  const pageList = (onPick?: (e: React.MouseEvent<HTMLAnchorElement>) => void) => (
    <ol className="flex flex-col gap-0.5">
      {guide.doc.pages.map((p, i) => {
        const current = p.id === page.id;
        const done = finished.includes(p.id);
        return (
          <li key={p.id}>
            <Link
              href={`${base}/${p.id}`}
              onClick={onPick}
              aria-current={current ? "page" : undefined}
              className={cx(
                "flex items-start gap-2.5 rounded-xl border-l-[3px] px-3 py-2 text-[0.95rem] leading-snug",
                current ? "border-action bg-tealtint font-semibold" : "border-transparent text-ink-muted hover:bg-muted hover:text-ink",
              )}
            >
              <span
                className={cx(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full font-mulish text-[0.65rem] font-extrabold",
                  done ? "bg-[#2f8f5b] text-white" : "border border-line-strong",
                )}
                aria-hidden
              >
                {done ? <Icon name="check" className="size-3" /> : i + 1}
              </span>
              <span className="min-w-0">
                {pageTitle(guide.doc, p, guide.title)}
                {done && <span className="sr-only"> (finished)</span>}
                {!p.required && <span className="block text-xs font-normal text-ink-muted">Optional</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
  const sectionList = (onPick?: (e: React.MouseEvent<HTMLAnchorElement>) => void) => (
    <ol className="flex flex-col gap-0.5">
      {page.sections.map((s, i) => (
        <li key={s.id}>
          <a
            href={`#section-${s.id}`}
            onClick={onPick}
            aria-current={active === s.id ? "location" : undefined}
            className={cx(
              "flex gap-2.5 rounded-lg border-l-[3px] px-3 py-1.5 text-sm leading-snug",
              active === s.id
                ? course
                  ? "border-transparent font-semibold text-ink"
                  : "border-action bg-tealtint font-semibold"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            <span className="font-mulish text-xs font-bold tabular-nums leading-5">{String(i + 1).padStart(2, "0")}</span>
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      <div className="hidden lg:block">
        <div className="sticky top-24 flex max-h-[calc(100vh-7rem)] flex-col gap-6 overflow-y-auto">
          {course && (
            <nav aria-label="Pages in this course">
              <p className="mb-2 px-3 font-mulish text-xs font-extrabold uppercase tracking-[0.14em]">In this course</p>
              {pageList()}
            </nav>
          )}
          <nav aria-label={course ? "On this page" : "In this guide"}>
            <p className={cx("mb-2 px-3 font-mulish text-xs font-extrabold uppercase tracking-[0.14em]", course && "text-ink-muted")}>
              {course ? "On this page" : "In this guide"}
            </p>
            {sectionList()}
          </nav>
          {extra && <div className="px-1 pb-1">{extra}</div>}
        </div>
      </div>
      <details className="rounded-2xl border border-line bg-surface lg:hidden">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 font-semibold">
          {course ? "Pages and sections" : "In this guide"} <Icon name="chevron-down" className="size-4" />
        </summary>
        <div className="flex flex-col gap-4 px-2 pb-3">
          {course && <nav aria-label="Pages in this course">{pageList(close)}</nav>}
          <nav aria-label={course ? "On this page" : "In this guide"}>{sectionList(close)}</nav>
        </div>
      </details>
    </>
  );
}

type Sender = ReturnType<typeof useSend>;

/**
  The end of a page: finish it (when the course asks for that), then Previous, Next and Back to course.
  A one-page guide finishes the whole guide here. Moving to the next page never finishes anything.
*/
function Finish({
  guide,
  page,
  base,
  preview,
  answers,
  finished,
  completed,
  send,
  onFinished,
}: {
  guide: ReaderGuide;
  page: Page;
  base: string;
  preview: boolean;
  answers: Record<string, string>;
  finished: string[];
  completed: Done;
  send: Sender;
  onFinished: (finished: string[], completed: { kind: "completed" | "acknowledged"; at: string } | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pages = guide.doc.pages;
  const course = pages.length > 1;
  const i = pages.indexOf(page);
  const prev = pages[i - 1];
  const next = pages[i + 1];
  const reference = guide.completion === "reference";
  const isDone = finished.includes(page.id);
  const doneHere = completed?.thisRevision ? completed : null;

  // What this page still needs before it can be finished.
  const open = guide.completion === "decision" ? pageBlocks(page).filter((b) => b.type === "decision" && !answers[b.id]).length : 0;
  const quizPassed = pageBlocks(page).some((b) => b.type === "quiz" && guide.quizzes[b.id]?.passed);
  // Every activity on the page, unless its author turned that off (a reference course is only read).
  const todo = reference ? [] : openActivities(page, answers, guide.quizzes);
  const todoNames = [...new Set(todo.map((b) => BLOCK_LABELS[b.type].toLowerCase()))].join(", ");
  const blocked = open > 0 || (page.kind === "assessment" && !quizPassed) || todo.length > 0;

  const run = async (path: "finish" | "complete") => {
    // An author's preview tries it out without recording anything: the page shows as finished here only.
    if (preview) {
      const now = new Date().toISOString();
      if (path === "complete") return onFinished(finished, { kind: "acknowledged", at: now });
      const next = finished.includes(page.id) ? finished : [...finished, page.id];
      return onFinished(next, course ? null : { kind: "completed", at: now });
    }
    setBusy(true);
    setProblem(null);
    try {
      if (path === "complete") {
        const out = await send<{ kind: "completed" | "acknowledged"; at: string }>("complete", {});
        if (out) onFinished(finished, out);
      } else {
        const out = await send<{ finished: string[]; completed: { kind: "completed"; at: string } | null }>("finish", { pageId: page.id });
        if (out) onFinished(out.finished, out.completed);
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const what = reference
    ? course
      ? "This page stays here for when you need it."
      : "This is a reference guide: come back to it whenever you need it."
    : open > 0
      ? `Answer the ${open === 1 ? "decision question" : `${open} decision questions`} above, then ${course ? "finish the page" : "mark the guide as complete"}.`
      : page.kind === "assessment" && !quizPassed
        ? "Pass the quiz above, then finish the page."
        : todo.length
          ? `Work through every activity above first: ${todoNames}. Then ${course ? "finish the page" : "mark the guide as complete"}.`
          : course
            ? "When you’ve worked through this page, finish it. It’s added to your progress."
            : "When you’ve read it, mark it as complete. It’s added to your learning record.";

  const showDone = course ? isDone : Boolean(doneHere);
  return (
    <section aria-labelledby={`finish-${page.id}`} className={cx(column, "flex flex-col gap-5")}>
      <div className="rounded-3xl border border-[#f3d48c] bg-[#fff8e1] p-6 text-center sm:p-8 dark:border-[#5a4a22] dark:bg-[#3a2f17]">
        <h2 id={`finish-${page.id}`} className="font-serif text-2xl font-semibold">
          {course
            ? isDone
              ? "Page finished"
              : "Finished this page?"
            : doneHere
              ? doneHere.kind === "acknowledged"
                ? "Thanks for reading"
                : "Guide complete"
              : "Finished reading?"}
        </h2>
        {showDone ? (
          <p className="mt-2 flex items-center justify-center gap-2 text-ink-muted">
            <Icon name="circle-check" className="size-5 shrink-0 text-[#2f8f5b]" />
            {course
              ? doneHere
                ? `Course ${doneHere.kind === "completed" ? "completed" : "marked as read"} on ${formatDate(doneHere.at)}.`
                : next
                  ? "On to the next page when you’re ready."
                  : "That was the last page."
              : `${doneText(doneHere!)}. It stays here for when you need it again.`}
          </p>
        ) : reference && course ? (
          <p className="mt-2 text-ink-muted">{what}</p>
        ) : (
          <>
            <p className="mt-2 text-ink-muted">{what}</p>
            {completed && !completed.thisRevision && !course && (
              <p className="mt-2 text-sm text-ink-muted">
                You completed an earlier edition on {formatDate(completed.at)}. This edition has been updated since.
              </p>
            )}
            <button
              type="button"
              onClick={() => void run(reference ? "complete" : "finish")}
              disabled={busy || (!preview && !reference && blocked)}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-6 font-semibold text-on-action hover:bg-action-hover disabled:opacity-50"
            >
              <Icon name="check" className="size-4" /> {busy ? "Saving…" : reference ? "Mark as read" : course ? "Finish this page" : "Mark as complete"}
            </button>
            {preview && (
              <p className="mt-3 text-sm text-ink-muted">
                Preview: you can try this, but nothing is recorded.{!reference && blocked ? " Learners have to do what’s above first." : ""}
              </p>
            )}
            {problem && (
              <p role="alert" className="mt-3 text-sm font-semibold text-danger">
                {problem}
              </p>
            )}
          </>
        )}
      </div>

      {course ? (
        <nav aria-label="Pages" className="grid gap-3 sm:grid-cols-2">
          <PageLink
            href={prev ? `${base}/${prev.id}` : base}
            dir="back"
            label={prev ? "Previous" : "Back to"}
            title={prev ? pageTitle(guide.doc, prev, guide.title) : "The course"}
          />
          <PageLink
            href={next ? `${base}/${next.id}` : base}
            dir="on"
            label={next ? "Next" : "Back to"}
            title={next ? pageTitle(guide.doc, next, guide.title) : "The course"}
            // On to the next page once this one's activities are done (an author's preview can always move on).
            locked={Boolean(next) && !preview && !isDone && todo.length > 0 ? `Work through every activity on this page first: ${todoNames}.` : undefined}
          />
        </nav>
      ) : (
        <Link
          href={preview ? "/admin/magazine" : "/magazine"}
          className="inline-flex items-center justify-center gap-1 font-semibold text-accent hover:underline"
        >
          More in Magazine <Icon name="arrow-right" className="size-4" />
        </Link>
      )}
    </section>
  );
}

function PageLink({ href, dir, label, title, locked }: { href: string; dir: "back" | "on"; label: string; title: string; locked?: string }) {
  if (locked)
    return (
      <span
        aria-disabled="true"
        title={locked}
        className={cx(
          "flex cursor-not-allowed flex-col gap-1 rounded-2xl border border-dashed border-line-strong bg-surface p-4 opacity-60",
          dir === "on" && "text-right sm:col-start-2",
        )}
      >
        <span className={cx("inline-flex items-center gap-1 text-sm text-ink-muted", dir === "on" && "justify-end")}>
          <Icon name="lock" className="size-4" /> {label}
        </span>
        <span className="font-semibold">{title}</span>
        <span className="sr-only">. {locked}</span>
      </span>
    );
  // Next is the way on, in solid teal; Previous and Back to the course are quieter, in soft teal.
  const next = dir === "on" && label === "Next";
  return (
    <Link
      href={href}
      className={cx(
        "group flex flex-col gap-1 rounded-2xl border p-4 transition-[filter,box-shadow]",
        next
          ? "border-action bg-action text-on-action shadow-sm hover:shadow-md hover:brightness-110"
          : "border-[#b7dede] bg-tealtint hover:brightness-95 dark:border-[#2c5757]",
        dir === "on" && "text-right sm:col-start-2",
      )}
    >
      <span className={cx("inline-flex items-center gap-1 text-sm", next ? "text-on-action/85" : "text-accent", dir === "on" && "justify-end")}>
        {dir === "back" && <Icon name="arrow-left" className="size-4" />} {label} {dir === "on" && <Icon name="arrow-right" className="size-4" />}
      </span>
      <span className="font-semibold group-hover:underline">{title}</span>
    </Link>
  );
}
