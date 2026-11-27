"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cx, formatDate, hoursAndMinutes } from "@/lib/format";
import { BLOCK_LABELS, openActivities, pageBlocks, pageTitle, type Page } from "@/lib/magazine";
import type { ReaderGuide, ReaderNote } from "@/server/magazine";
import { Icon } from "../Icon";
import { GuideBlock, column, type BlockContext } from "./GuideBlocks";
import type { ReflectionSaved } from "./InteractiveBlocks";
import { AudioGuideCard } from "./AudioGuide";
import { IntroPlayer } from "./IntroPlayer";
import { CourseCover } from "./CourseCover";
import { useSelfReview } from "./SelfReview";
import { useMyNotes } from "./ReflectBlocks";
import { AddToDiscovery } from "../discovery/AddToDiscovery";
import { MemberCaption } from "../community/MemberCaption";
import { listenable } from "@/lib/magazineNarration";
import { useOnePlayer } from "@/lib/onePlayer";
import { StoryAt, useStory } from "../story/StoryMoments";
import { AvaRelay } from "../relay/AvaRelay";
import { FavouriteBanner } from "../favourites/FavouriteBanner";
import { ReturnOpeningPanel, useReturnOpening } from "../living/ReturnOpening";
import { Highlighter, SaveSection } from "../favourites/Highlighter";
import { SavedMarkChips, SavedMarks } from "../favourites/SavedMarks";
import { relayOn } from "@/lib/relayConfig";
import { chapterLabel, chapterOf, hasChapters, pageGroups } from "@/lib/magazineChapters";

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
  The course's voice-overs. They always play by themselves as a page opens, with sound (the owner, Nov 2026): there's no
  Audio guide switch any more. A learner can still pause any of them, and the Hub-wide "start audio automatically"
  setting (Profile and settings) still holds.
*/
function useAudioGuide(guide: ReaderGuide) {
  return { audio: guide.doc.audio };
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
      return Object.values(guide.quizzes).filter(Boolean).length > 1
        ? "Finish the required pages and pass every quiz to complete the course."
        : "Finish the required pages and pass the quiz to complete the course.";
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
  const audioGuide = useAudioGuide(guide);
  // One sound at a time: Ava on the cover and anything else here (lib/onePlayer).
  useOnePlayer();
  // The course's approved introduction, which Ava gives on the cover in her own voice.
  const intro = audioGuide.audio?.intro;
  // Her video for the course's introduction comes with the course (loadGuide), so the cover knows from the start.
  const introVideo = pages.length > 1 ? (guide.ava?.videos[`magazine:${guide.id}:intro`] ?? null) : null;
  // Ava on the cover only when an author has put her video there (a manual upload, never the default, Nov 2026): her video,
  // with its own words when it has a script. Without one, the cover is its picture and the approved introduction is the
  // Listen control beside the course's details, in the Hub's narrator voice.
  const introScript = audioGuide.audio?.levels.course && intro?.status === "approved" && intro.script.trim() ? intro.script.trim() : null;
  const avaIntro = introVideo ? introVideo.transcript || introScript || "" : null;
  // Without Ava, a recorded introduction goes on the cover itself (the reduced player with the live caption).
  const coverIntro = avaIntro === null && guide.cover && listenable(intro, audioGuide.audio) && audioGuide.audio?.levels.course ? intro : null;

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
      {/* One column on a phone that never grows past the screen (Ava's window has a long caption). */}
      <header className="mt-4 grid grid-cols-[minmax(0,1fr)] items-end gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
        <div>
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">
            Course · {pages.length} pages{guide.audience && <> · For {guide.audience}</>}
          </p>
          <h1 className="mt-2 font-serif text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">{guide.title}</h1>
          {guide.standfirst && <p className="mt-4 text-xl leading-relaxed text-ink-muted">{guide.standfirst}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="clock" className="size-4" /> About {hoursAndMinutes(guide.minutes)} in all
            </span>
            {pages.length > 1 && audioGuide.audio?.intro && (
              <AudioGuideCard
                variant="inline"
                narration={avaIntro !== null || coverIntro ? undefined : audioGuide.audio.intro}
                audio={audioGuide.audio}
                level="course"
                // Plays by itself when the course opens (the owner, Nov 2026), unless Ava's video is there, which starts itself.
                autoplay={avaIntro === null}
                onEvent={(outcome) => send("events", { event: "narration", pageId: "intro", detail: { outcome } }).catch(() => {})}
              />
            )}
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
        {/* Ava gives the course's introduction first, then the cover picture takes her place (CourseCover). */}
        {avaIntro !== null ? (
          <CourseCover
            line={`magazine:${guide.id}:intro`}
            ava={guide.ava}
            video={introVideo}
            title={guide.title}
            cover={guide.cover ?? null}
            script={avaIntro}
            startMuted={false}
            onEvent={(outcome) => send("events", { event: "narration", pageId: "intro", detail: { outcome } }).catch(() => {})}
          />
        ) : coverIntro && guide.cover ? (
          // The course's introduction on its cover: a small Play, and the words highlighted as they're said, as on Topics
          // and Discovery Paths. Plays by itself when the course opens (unless the learner has the Audio guide off).
          <IntroPlayer
            script={coverIntro.script}
            audio={coverIntro.audio}
            poster={{ src: guide.cover }}
            label="Listen to the introduction"
            posterTall
            autoPlay
            className="mt-0 rounded-3xl"
            onEvent={(action) =>
              void (
                action === "play" || action === "complete"
                  ? send("events", { event: "narration", pageId: "intro", detail: { outcome: action === "play" ? "started" : "finished" } })
                  : Promise.resolve()
              ).catch(() => {})
            }
          />
        ) : (
          guide.cover && (
            <figure className="relative overflow-hidden rounded-3xl bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={guide.cover} alt="" className="aspect-[16/9] w-full object-cover" />
              <MemberCaption src={guide.cover} />
            </figure>
          )
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
        {(() => {
          // A course in chapters lists its pages under chapter headings (h3), each page then an h4; otherwise one list as before.
          // Each page as a card with its picture (the owner, Nov 2026): the page's own top picture, else its first picture, else the course cover.
          const listClass = "flex flex-col gap-3";
          const pictureOf = (p: Page) => {
            if (p.hero?.src) return p.hero;
            for (const sec of p.sections)
              for (const bl of sec.blocks) {
                const m = bl.type === "image" || bl.type === "textMedia" ? bl.media : undefined;
                if (m?.src) return m;
              }
            return guide.cover ? { src: guide.cover, position: undefined } : null;
          };
          const chip = "rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-ink-muted";
          const item = (p: Page, i: number, Heading: "h3" | "h4") => {
            const done = finished.has(p.id);
            const state = done ? "Finished" : guide.progress.lastPage === p.id ? "In progress" : "Not started";
            const pic = pictureOf(p);
            return (
              <li key={p.id} className="tile tile-card group flex items-stretch">
                <div className="relative min-h-28 w-28 shrink-0 bg-gradient-to-br from-[#3cb8b9]/40 to-[#fab53d]/30 sm:w-44">
                  {pic && (
                    // eslint-disable-next-line @next/next/no-img-element -- a course picture, sized by its card
                    <img src={pic.src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" style={{ objectPosition: pic.position }} />
                  )}
                  <span
                    className={cx(
                      "absolute left-2.5 top-2.5 grid size-9 place-items-center rounded-full font-mulish text-sm font-extrabold shadow-sm",
                      done ? "bg-[#2f8f5b] text-white" : "bg-white/90 text-[#102a43]",
                    )}
                    aria-hidden
                  >
                    {done ? <Icon name="check" className="size-5" /> : i + 1}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-3 p-4 sm:p-5">
                  <div className="min-w-0 flex-1">
                    <Heading className="font-serif text-xl font-semibold leading-snug">
                      <Link href={`${base}/${p.id}`} className="tile-link">
                        {pageTitle(guide.doc, p, guide.title)}
                      </Link>
                    </Heading>
                    {p.purpose && <p className="mt-1 text-ink-muted">{p.purpose}</p>}
                    <p className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className={cx(chip, "inline-flex items-center gap-1")}>
                        <Icon name="clock" className="size-3.5" /> {guide.pageMinutes[p.id]} min
                      </span>
                      {p.kind === "assessment" && <span className={chip}>Quiz</span>}
                      {!p.required && <span className={chip}>Optional</span>}
                      {!preview && (
                        <span
                          className={cx(
                            chip,
                            state === "Finished" && "bg-[#e3f5ee] text-[#155c3b] dark:bg-[#1f4a3a] dark:text-[#bdeed6]",
                            state === "In progress" && "bg-[#fff1d6] text-[#6b4a12] dark:bg-[#4a3a1a] dark:text-[#f5d9a0]",
                          )}
                        >
                          {state}
                        </span>
                      )}
                    </p>
                  </div>
                  <Icon name="arrow-right" className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-1" />
                </div>
              </li>
            );
          };
          if (!hasChapters(pages)) return <ol className={cx("mt-5", listClass)}>{pages.map((p, i) => item(p, i, "h3"))}</ol>;
          return (
            <div className="mt-5 flex flex-col gap-8">
              {pageGroups(pages).map((g) =>
                g.chapter ? (
                  <section key={g.chapter.startPageId} aria-labelledby={`chapter-${g.chapter.startPageId}`}>
                    <h3 id={`chapter-${g.chapter.startPageId}`} className="font-serif text-xl font-semibold">
                      <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Chapter {g.chapter.number}</span>
                      {g.chapter.title}
                    </h3>
                    {g.chapter.intro && <p className="mt-1 text-ink-muted">{g.chapter.intro}</p>}
                    <ol className={cx("mt-3", listClass)}>{g.pages.map((p) => item(p, pages.indexOf(p), "h4"))}</ol>
                  </section>
                ) : (
                  <ol key="before" className={listClass} aria-label="Before the chapters">
                    {g.pages.map((p) => item(p, pages.indexOf(p), "h3"))}
                  </ol>
                ),
              )}
            </div>
          );
        })()}
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
      <p className="mt-12 border-t border-line pt-4 text-sm text-ink-muted">
        {guide.revision > 1 ? "Updated" : "Published"} {formatDate(guide.publishedAt)}
      </p>
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
  const audioGuide = useAudioGuide(guide);
  // One sound at a time: the introduction, Ava's transmissions and the video blocks (lib/onePlayer).
  useOnePlayer();
  // Ava introducing this page, when its introduction has a video (Admin → AI Learning Guide, Ava's talking videos): she
  // plays first where the page's picture goes, and the picture takes over once she's finished.
  // A one-page course has no cover, so Ava gives the course's introduction here instead, as she would on the cover:
  // its approved script spoken in her voice, or her video for it.
  const introLine = `magazine:${guide.id}:intro`;
  const courseIntro = audioGuide.audio?.levels.course && audioGuide.audio.intro?.status === "approved" ? audioGuide.audio.intro.script.trim() : "";
  const pageLine = course ? `magazine:${guide.id}:page:${page.id}` : introLine;
  const pageVideo = guide.ava?.videos[pageLine] ?? null;
  // Ava only with a video an author has put there (a manual upload, never the default): otherwise the page's picture, and a
  // one-page course's introduction is the Listen control in the page's details instead.
  const pageIntro = pageVideo
    ? pageVideo.transcript || (course ? (page.narration?.status === "approved" ? page.narration.script.trim() : "") : courseIntro)
    : null;
  const listenToCourseIntro = !course && !pageVideo && Boolean(courseIntro);
  // Story moments placed beside this course's pages and blocks (docs/story-plans.md): approved, optional, never counted.
  const story = useStory("guide", guide.id);
  // A return episode: what opens this page if it comes back to an earlier story, with a private line only its learner gets.
  const returning = useReturnOpening(guide.slug, page.id, Boolean(preview));
  // Highlights (docs/job-aids.md): text selected inside the page's own content can be saved to Favourites.
  const pageBody = useRef<HTMLDivElement>(null);
  /** After a transmission's Begin: bring the activity it hands over to into view and give it focus. */
  const beginAt = (id: string) => () => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el?.focus({ preventScroll: true });
  };
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
    savePlace: preview ? undefined : { id: guide.slug, revisionId: guide.revisionId, pageId: page.id },
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
    // Her videos too, for the Ava video blocks in the content.
    ava: guide.ava,
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
  // The page's recorded introduction (a course page's own, or a one-page course's), on the page's picture as a poster with
  // the live caption, as on Topics and Discovery Paths. Not where Ava's video is in the picture's place.
  const pageNarration = page.kind === "content" && listenable(page.narration, audioGuide.audio) ? page.narration : null;
  const courseNarration = listenToCourseIntro && listenable(audioGuide.audio?.intro, audioGuide.audio) ? audioGuide.audio!.intro! : null;
  const posterIntro =
    pageIntro === null && hero?.src
      ? pageNarration
        ? { n: pageNarration, intro: false }
        : courseNarration
          ? { n: courseNarration, intro: true }
          : null
      : null;
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

      {/* One column on a phone that never grows past the screen (Ava's window has a long caption). */}
      <header className="mt-4 grid grid-cols-[minmax(0,1fr)] items-end gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
        <div className={cx("mag-hero-text relative z-30", !hero?.src && "lg:col-span-2 lg:max-w-3xl")}>
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">
            {course ? (
              <>
                {(() => {
                  const ch = chapterOf(pages, page.id);
                  return ch && <span className="block pb-1">{chapterLabel(ch)}</span>;
                })()}
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
            {!preview && (
              <span className="lg:hidden">
                <AddToDiscovery itemKey={`page:${guide.id}:${page.id}`} />
              </span>
            )}
            {/* A one-page course without Ava's video: its approved introduction is here, and plays by itself. */}
            {page.kind === "content" && audioGuide.audio && listenToCourseIntro && (
              <AudioGuideCard
                key={page.id}
                variant="inline"
                narration={listenToCourseIntro && !posterIntro ? audioGuide.audio.intro : undefined}
                audio={audioGuide.audio}
                level={course ? "page" : "course"}
                // A one-page course's introduction plays by itself when the page opens (the owner, Nov 2026).
                autoplay={listenToCourseIntro && !posterIntro}
                onEvent={(outcome) => send("events", { event: "narration", pageId: "intro", detail: { outcome } }).catch(() => {})}
              />
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
          {/*
            Listen to the introduction (docs/magazine-audio-guide.md): beneath the heading and description, before the content,
            whenever the page has an approved, recorded introduction the author hasn't turned off. It plays by itself when the
            page opens. Not when Ava's video is in the picture's place: she introduces the page, with her own words on screen
            (the owner, Nov 2026). Never needed to finish the page.
          */}
          {page.kind === "content" && listenable(page.narration, audioGuide.audio) && !posterIntro && !pageVideo && (
            <IntroPlayer
              key={page.id}
              script={page.narration.script}
              audio={page.narration.audio}
              // Plays by itself when the page opens (the owner, Nov 2026).
              autoPlay
              onEvent={(action, detail) => void send("events", { event: "introAudio", pageId: page.id, detail: { action, ...detail } }).catch(() => {})}
            />
          )}
          {resume && (
            <a
              href={`#section-${resume.id}`}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-tealtint px-4 font-semibold hover:underline"
            >
              Pick up where you left off: {resume.title} <Icon name="arrow-right" className="size-4" />
            </a>
          )}
        </div>
        {pageIntro !== null ? (
          <CourseCover
            line={pageLine}
            ava={guide.ava}
            video={pageVideo}
            title={title}
            cover={hero?.src ?? null}
            script={pageIntro}
            startMuted={false}
            onEvent={(outcome) => send("events", { event: "narration", pageId: page.id, detail: { outcome } }).catch(() => {})}
          />
        ) : posterIntro && hero?.src ? (
          // The introduction on the page's picture: a small Play, and the words highlighted as they're said. Plays by itself.
          <IntroPlayer
            key={`${page.id}-poster`}
            script={posterIntro.n.script}
            audio={posterIntro.n.audio}
            poster={{ src: hero.src }}
            label="Listen to the introduction"
            posterTall
            autoPlay
            className="mt-0 rounded-3xl"
            onEvent={(action, detail) =>
              void (
                posterIntro.intro
                  ? action === "play" || action === "complete"
                    ? send("events", { event: "narration", pageId: "intro", detail: { outcome: action === "play" ? "started" : "finished" } })
                    : Promise.resolve()
                  : send("events", { event: "introAudio", pageId: page.id, detail: { action, ...detail } })
              ).catch(() => {})
            }
          />
        ) : (
          hero?.src && (
            // The picture at the top is decoration: the headline says what it's about.
            // When it's one of the Digital Members, their name and approach caption it (community/MemberCaption).
            <figure className="relative overflow-hidden rounded-3xl bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hero.src} alt="" className="mag-hero-picture aspect-[16/9] w-full object-cover" />
              <MemberCaption src={hero.src} />
            </figure>
          )
        )}
      </header>
      <Notices guide={guide} preview={preview} stale={stale} />

      {/* This reader's earlier highlights on this page, marked where they still stand word for word (favourites/SavedMarks). */}
      <SavedMarks root={pageBody} source="guide" id={guide.slug} page={page.id} off={preview}>
        <div className="mt-10 grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)]">
          <Rail
            guide={guide}
            page={page}
            base={base}
            active={active}
            finished={finished}
            extra={
              (selfReview.available || myNotes.available || !preview) && (
                <div className="flex flex-col items-start gap-2">
                  {selfReview.button("rail")}
                  {myNotes.button}
                  {/* Save this page (or, when it isn't offered by itself, its course) to a personal Discovery Path. */}
                  {!preview && <AddToDiscovery itemKey={`page:${guide.id}:${page.id}`} />}
                </div>
              )
            }
          />
          <div ref={pageBody} className="flex min-w-0 flex-col gap-16">
            {/* Opened from Favourites: the saved passage, where it stands against this version, and the way back. */}
            <FavouriteBanner className={column} />
            {/* A return episode (docs/living-cases.md): where we left the person, what's changed, what to decide. Before Ava's bar. */}
            {returning.opening && <ReturnOpeningPanel key={returning.opening.id} opening={returning.opening} noteId={returning.noteId} className={column} />}
            {/* Ava Relay (docs/ava-relay.md): one dial bar, after the page's introduction and before its first block. Part of the page, not of its content. */}
            {relayOn(guide.doc.relay, page) && (
              <AvaRelay
                key={page.id}
                className={column}
                slug={guide.slug}
                revisionId={guide.revisionId}
                pageId={page.id}
                preview={preview ? { guideId: guide.id, answers } : undefined}
              />
            )}
            <StoryAt moments={story} place={`page:${page.id}`} className={column} onBegin={beginAt(`section-${page.sections[0]?.id}`)} />
            {page.sections.map((s, i) => (
              <section key={s.id} id={`section-${s.id}`} tabIndex={-1} aria-labelledby={`h-${s.id}`} className="flex scroll-mt-24 flex-col gap-8 outline-none">
                <div className={cx(column, "mag-reveal")}>
                  {/* The section's number, with Save this section floated right on the same line, so it takes no room of its own. */}
                  <div className="flex min-h-11 items-center justify-between gap-3">
                    <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">{String(i + 1).padStart(2, "0")}</p>
                    {/* The same as highlighting, with nothing to select: for touch, a keyboard or a screen reader. */}
                    {!preview && page.kind === "content" && (
                      <div className="print:hidden">
                        <SaveSection source="guide" id={guide.slug} revisionId={guide.revisionId} pageId={page.id} sectionId={s.id} />
                      </div>
                    )}
                  </div>
                  <h2 id={`h-${s.id}`} className="mt-1 font-serif text-3xl font-semibold tracking-tight">
                    {s.title}
                  </h2>
                </div>
                {s.blocks.map((b) => (
                  <Fragment key={b.id}>
                    <StoryAt moments={story} place={b.id} className={column} onBegin={beginAt(`block-${b.id}`)} />
                    <div id={`block-${b.id}`} tabIndex={-1} className="mag-reveal scroll-mt-24 outline-none" data-reveal={b.reveal}>
                      <GuideBlock block={b} ctx={ctx} />
                      <SavedMarkChips blockId={b.id} className={cx(column, "mt-3")} />
                    </div>
                    <StoryAt moments={story} place={b.id} position="after" className={column} />
                  </Fragment>
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
        {!preview && <Highlighter root={pageBody} source="guide" id={guide.slug} revisionId={guide.revisionId} pageId={page.id} />}
      </SavedMarks>
      <p className="mt-12 border-t border-line pt-4 text-sm text-ink-muted">
        {guide.revision > 1 ? "Updated" : "Published"} {formatDate(guide.publishedAt)}
      </p>
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
  const pages = guide.doc.pages;
  const here = chapterOf(pages, page.id);
  // In a course with chapters, the pages are listed under their chapters, and the current chapter is marked.
  const pageList = (onPick?: (e: React.MouseEvent<HTMLAnchorElement>) => void) =>
    hasChapters(pages) ? (
      <ol className="flex flex-col gap-3">
        {pageGroups(pages).map((g) => {
          const isHere = Boolean(g.chapter && here && g.chapter.startPageId === here.startPageId);
          return (
            <li key={g.chapter?.startPageId ?? "before"}>
              {g.chapter && (
                <p
                  className={cx(
                    "mb-1 border-l-[3px] px-3 font-mulish text-xs font-extrabold uppercase tracking-[0.1em]",
                    isHere ? "border-accent text-accent" : "border-transparent text-ink-muted",
                  )}
                >
                  {chapterLabel(g.chapter)}
                  {isHere && <span className="sr-only"> (the chapter you’re in)</span>}
                </p>
              )}
              <ol className="flex flex-col gap-0.5" aria-label={g.chapter ? `Pages in chapter ${g.chapter.number}` : "Pages before the chapters"}>
                {g.pages.map((p) => pageRow(p, pages.indexOf(p), onPick))}
              </ol>
            </li>
          );
        })}
      </ol>
    ) : (
      <ol className="flex flex-col gap-0.5">{pages.map((p, i) => pageRow(p, i, onPick))}</ol>
    );
  function pageRow(p: Page, i: number, onPick?: (e: React.MouseEvent<HTMLAnchorElement>) => void) {
    const current = p.id === page.id;
    const done = finished.includes(p.id);
    return (
      <li key={p.id}>
        <Link
          href={`${base}/${p.id}`}
          onClick={onPick}
          aria-current={current ? "page" : undefined}
          className={cx(
            "flex items-start gap-2.5 rounded-xl border-l-[3px] px-3 py-2 text-base leading-snug",
            current ? "border-action bg-tealtint font-semibold" : "border-transparent text-ink-muted hover:bg-muted hover:text-ink",
          )}
        >
          <span
            className={cx(
              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full font-mulish text-xs font-extrabold",
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
  }
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
  // In a sentence, block names drop their capitals, but not an acronym's ("The SaH Journey" reads "the SaH journey").
  const todoNames = [...new Set(todo.map((b) => BLOCK_LABELS[b.type].replace(/\b[A-Z][a-z’']*\b/g, (w) => w.toLowerCase())))].join(", ");
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
      <span className="font-semibold transition-colors group-hover:text-[#007f7e] dark:group-hover:text-[#7fd6d2]">{title}</span>
    </Link>
  );
}
