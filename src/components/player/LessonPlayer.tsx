"use client";

import Image from "next/image";
import { MotionPhoto } from "../MotionPhoto";
import { CardFigure } from "./CardFigure";
import { CardDocument } from "./CardDocument";
import { CardBookmark } from "./CardBookmark";
import { ReviewButton, useReview } from "./ReviewPanel";
import { ordered } from "@/lib/lessonGraph";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { panelledOnColour, toneClasses, useTextTone } from "@/lib/imageTone";
import { cardSurface } from "@/content/themes";
import type { Card, Lesson } from "@/content/lessons";
import { commentsOn } from "@/lib/cardComments";
import { nowIso, setHub, useHub, useHydrated, type LessonAttempt } from "@/lib/store";
import { send as sendOrQueue } from "@/lib/outbox";
import { cumulative, cx, formatDate, spacedWhen } from "@/lib/format";
import { Icon } from "../Icon";
import { Frame, type SaveState } from "./Frame";
import { api, durationLabel, formatWhen, useApi } from "@/lib/api";
import { WaitingSurveys } from "../WaitingSurveys";
import { ListenCard } from "./AudioStage";
import { VideoBubbles } from "./VideoBubbles";
import { completionGate, LISTEN_GATE } from "@/lib/completionGate";
import { CardVisual, PhotoCredit } from "./CardVisual";
import { WrittenAnswer } from "./WrittenAnswer";
import { Hotspots } from "./Hotspots";
import { Resources } from "./Resources";
import { Checklist } from "./Checklist";
import { checklistDone, tickedFrom } from "@/lib/checklist";
import { CardComments } from "./CardComments";
import { ReportProblem } from "./ReportProblem";
import { OfflineButton } from "../OfflineButton";
import { hotspotsNeeded } from "@/lib/hotspots";
import { Narration, useNarration } from "./Narration";
import { Calculator } from "./Calculator";
import { Widget } from "./Widget";
import { RichInline, RichText } from "../RichText";
import { Quiz } from "./Quiz";
import { confirmAction } from "@/lib/confirm";
import { leavesSite, rememberCard, takeReturnCard } from "@/lib/lessonReturn";
// Press, pop, burst and other feedback on interactive cards.
import "./fx.css";
import { PathCelebration } from "../PathCelebration";

type Phase = "intro" | "playing" | "complete";
type CompletionResult = {
  completedAt: string;
  followUps: {
    pathName: string;
    firstRelease: string | null;
    durationSec: number;
    timezone: string;
  }[];
};

/** `instanceId` plays the lesson as a step in a learning sequence; completion is recorded against that step. */
export function LessonPlayer({
  lesson,
  instanceId,
  preview = false,
  skipHolds = false,
  notice,
  startAt,
  backTo,
  reviewToken,
}: {
  lesson: Lesson;
  instanceId?: string;
  preview?: boolean;
  /** On a learning path that allows skipping (testers): never wait for audio, video or activities. */
  skipHolds?: boolean;
  /** Shown on the start screen, e.g. that the lesson is machine translated. */
  notice?: React.ReactNode;
  /** Open straight on this card instead of the start screen: an author's preview, or a learner's bookmark (as a review). */
  startAt?: string;
  /** Where closing or finishing leads, e.g. back to the learning path being previewed. */
  backTo?: { href: string; label: string };
  /** Opened from a review link (with `preview`): every card gets a Comments button for review comments. */
  reviewToken?: string;
}) {
  const hydrated = useHydrated();
  const stored = useHub((s) => s.lessons[lesson.slug]);
  const [phase, setPhase] = useState<Phase>("intro");
  const [attempt, setAttempt] = useState<LessonAttempt | null>(null);
  const [review, setReview] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [completing, setCompleting] = useState<"idle" | "saving" | "error">("idle");
  // Completed offline: recorded on this device, waiting to sync.
  const [completionQueued, setCompletionQueued] = useState(false);
  const [followUps, setFollowUps] = useState<CompletionResult["followUps"]>([]);
  const [choice, setChoice] = useState<string | null>(null);
  const [stayFeedback, setStayFeedback] = useState<string | null>(null);
  // A good choice can show its feedback first; the next press continues.
  const [pendingNext, setPendingNext] = useState<string | null>(null);
  const [quizChecked, setQuizChecked] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reviewing = useReview(reviewToken);
  const seq = useRef(0);
  const pending = useRef<LessonAttempt | null>(null);

  const node = attempt ? lesson.nodes[attempt.nodeId] : undefined;
  // "Required completion": cards whose audio, video or activity is done (or that were already passed).
  const [finished, setFinished] = useState<Set<string>>(() => new Set());
  const markDone = (id: string) => setFinished((f) => (f.has(id) ? f : new Set(f).add(id)));
  const narration = useNarration(node ? `lesson:${lesson.slug}:${node.id}` : "");
  // Synthesia's own player can't say when it's finished, so a required one unlocks after its stated length.
  const timedId =
    node?.requireComplete &&
    node.type === "presenter" &&
    node.visual.kind === "presenter" &&
    node.visual.video?.provider === "synthesia" &&
    !node.visual.video.src
      ? node.id
      : null;
  const timedFor = node?.type === "presenter" ? node.durationSec : 0;
  useEffect(() => {
    if (!timedId) return;
    const t = window.setTimeout(() => setFinished((f) => new Set(f).add(timedId)), Math.max(5, timedFor) * 1000);
    return () => window.clearTimeout(t);
  }, [timedId, timedFor]);
  // Light or dark text over a full-background photo: the author's choice, or measured from the photo.
  const textTone = useTextTone(
    node?.visual.kind === "illustration" && node.visual.layout === "background" ? node.visual.photo?.src : undefined,
    node?.visual.kind === "illustration" ? (node.visual.textTone ?? "auto") : "auto",
  );

  useEffect(() => {
    if (phase !== "intro") headingRef.current?.focus();
  }, [attempt?.nodeId, phase]);

  /**
    Saves progress on this device straight away, then sends it to the server through the outbox
    (kept on the device while offline). Author previews stay on the device.
  */
  function persist(a: LessonAttempt) {
    const mine = ++seq.current;
    pending.current = a;
    // Author previews record nothing, not even on this device, so the author's own progress is untouched.
    if (preview) {
      setSaveState("saved");
      return Promise.resolve();
    }
    const saved = { ...a, savedAt: nowIso() };
    setHub((s) => ({ ...s, lessons: { ...s.lessons, [lesson.slug]: saved } }));
    setSaveState("saving");
    return sendOrQueue(
      "/api/progress",
      { slug: lesson.slug, attempt: saved, savedAt: saved.savedAt },
      {
        method: "PUT",
        label: `Progress in “${lesson.title}”`,
        coalesce: `progress:${lesson.slug}`,
      },
    ).then(
      (r) => {
        if (mine === seq.current) setSaveState(r.queued ? "queued" : "saved");
      },
      (err) => {
        if (mine === seq.current) setSaveState("error");
        throw err;
      },
    );
  }

  /** Background save for card moves; failures surface through the save indicator. */
  const save = (a: LessonAttempt) => {
    if (!review) persist(a).catch(() => {});
  };

  function resetCardState() {
    setChoice(null);
    setStayFeedback(null);
    setPendingNext(null);
    setQuizChecked(false);
    setDetailOpen(false);
  }

  function begin(fresh: boolean, asReview = false, from = lesson.start) {
    const a: LessonAttempt =
      !fresh && stored && stored.version === lesson.version
        ? stored
        : {
            version: lesson.version,
            nodeId: from,
            route: [from],
            answers: {},
            status: "in_progress",
            startedAt: nowIso(),
            previousRoutes: stored && fresh && !asReview ? [...stored.previousRoutes, stored.route] : [],
          };
    setReview(asReview);
    setAttempt(a);
    setPhase("playing");
    resetCardState();
    // `review` state has not updated yet here, so check the argument directly.
    if (!asReview && a !== stored) persist(a).catch(() => {});
    if (!asReview && instanceId) sendOrQueue(`/api/follow-ups/${instanceId}`, { action: "start" }, { label: "Follow up started" }).catch(() => {});
  }

  // An author previewing a card from the editor, or a learner opening a bookmarked card, goes straight to it
  // (as a review, so their progress is left alone).
  const started = useRef(false);
  useEffect(() => {
    if (!hydrated || started.current) return;
    // Back from a web link opened on a card: reopen that card. Their own progress carries on if it's where
    // they'd got to; otherwise (or in a preview) it opens as a review.
    const back = takeReturnCard();
    if (back && lesson.nodes[back]) {
      started.current = true;
      // A one-off start once the page has loaded, like opening on a card below.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!preview && stored?.version === lesson.version && stored.nodeId === back && stored.status !== "completed") begin(false);
      else begin(true, true, back);
      return;
    }
    if (!startAt || !lesson.nodes[startAt]) return;
    started.current = true;
    begin(true, true, startAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, preview, startAt]);

  // Web links open in this window: remember the card first, so Back returns to it.
  const onCard = useRef<string | null>(null);
  useEffect(() => {
    onCard.current = phase === "playing" ? (attempt?.nodeId ?? null) : null;
  });
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (a && onCard.current && leavesSite(a)) rememberCard(onCard.current);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  function go(next: string, answers?: LessonAttempt["answers"]) {
    if (!attempt) return;
    const leaving = attempt.nodeId;
    const a = {
      ...attempt,
      nodeId: next,
      route: [...attempt.route, next],
      // Saved with their progress: a card they've moved on from never locks again, even after a resume.
      answers: { ...(answers ?? attempt.answers), [`done:${leaving}`]: 1 },
    };
    withDeck("forward", () => {
      setAttempt(a);
      resetCardState();
      // A card you've moved on from never locks again if you come back to it.
      markDone(leaving);
    });
    save(a);
  }

  function back() {
    if (!attempt || attempt.route.length < 2) return;
    const route = attempt.route.slice(0, -1);
    const leaving = lesson.nodes[attempt.nodeId];
    const prev = lesson.nodes[route[route.length - 1]];
    // Returning to an earlier choice starts a new route; keep the abandoned one for audit.
    const previousRoutes = prev.type === "decision" && leaving ? [...attempt.previousRoutes, attempt.route] : attempt.previousRoutes;
    const a = {
      ...attempt,
      route,
      nodeId: route[route.length - 1],
      previousRoutes,
    };
    withDeck("back", () => {
      setAttempt(a);
      resetCardState();
      if (prev.type === "decision") setChoice((attempt.answers[prev.id] as string) ?? null);
    });
    save(a);
  }

  // Built on the latest attempt, so a card can save several answers in a row.
  function setAnswer(key: string, value: string | number) {
    setAttempt((a) => (a ? { ...a, answers: { ...a.answers, [key]: value } } : a));
  }

  async function complete() {
    if (!attempt) return;
    const done: LessonAttempt = {
      ...attempt,
      status: "completed",
      completedAt: nowIso(),
    };
    if (review) {
      setAttempt(done);
      setPhase("complete");
      return;
    }
    setCompleting("saving");
    try {
      // The server records the confirmed completion time and any follow up enrolment. In a learning
      // sequence, completion and first-attempt results are recorded against the step instead.
      const results = Object.entries(attempt.answers)
        .filter(([k]) => k.startsWith("first:"))
        .map(([k, v]) => ({ id: k.slice(6), correct: v === 1 }));
      // Offline, the completion is kept on this device and recorded when the connection returns.
      const label = `Lesson completed: “${lesson.title}”`;
      const sent = instanceId
        ? await sendOrQueue<{ completedAt: string }>(`/api/follow-ups/${instanceId}`, { action: "complete_lesson", results }, { label })
        : await sendOrQueue<CompletionResult>("/api/lessons/complete", { slug: lesson.slug, version: lesson.version }, { label });
      const server: Pick<CompletionResult, "completedAt" | "followUps"> = sent.queued
        ? { completedAt: done.completedAt!, followUps: [] }
        : { completedAt: (sent.data as { completedAt?: string }).completedAt ?? nowIso(), followUps: (sent.data as Partial<CompletionResult>).followUps ?? [] };
      setCompletionQueued(sent.queued);
      const confirmed = { ...done, completedAt: server.completedAt };
      await persist(confirmed);
      setFollowUps(server.followUps);
      setAttempt(confirmed);
      setCompleting("idle");
      setPhase("complete");
    } catch {
      setCompleting("error");
    }
  }

  if (!hydrated) {
    return <Frame closeHref={backTo?.href} title={`Lesson: ${lesson.title}`} beats={lesson.beats} saveState="idle" progress={null} />;
  }

  if (phase === "intro") {
    return (
      <Frame
        closeHref={backTo?.href}
        title={`Lesson: ${lesson.title}`}
        beats={lesson.beats}
        saveState="idle"
        progress={null}
        footer={
          <Intro
            part="actions"
            lesson={lesson}
            stored={preview ? undefined : stored}
            onStart={() => begin(true, preview)}
            onResume={() => begin(false)}
            onReview={() => begin(true, true)}
          />
        }
      >
        {notice && <div className="mb-3">{notice}</div>}
        {preview && (
          <p className="mb-3 rounded-2xl border-2 border-dashed border-gold px-3 py-2 text-sm">
            {reviewToken ? (
              <>
                <strong>You’re reviewing this lesson.</strong> Work through it as a learner would, and press <strong>Comment</strong> at the top of any card to
                leave feedback for the author. Nothing you answer is recorded.
              </>
            ) : (
              <>
                <strong>Author preview.</strong> Nothing is recorded. This draft isn’t visible to learners until it’s approved.
              </>
            )}
          </p>
        )}
        <Intro
          part="body"
          lesson={lesson}
          stored={preview ? undefined : stored}
          onStart={() => begin(true, preview)}
          onResume={() => begin(false)}
          onReview={() => begin(true, true)}
        />
        {!preview && lesson.track !== "reinforcement" && <SpacedNote slug={lesson.slug} />}
        {!preview && <OfflineButton lessons={[{ slug: lesson.slug, version: lesson.version }]} className="mt-3" />}
      </Frame>
    );
  }

  if (phase === "complete" && attempt) {
    return (
      <Frame
        closeHref={backTo?.href}
        title={`Lesson: ${lesson.title}`}
        beats={lesson.beats}
        saveState={saveState}
        progress={{ beat: lesson.beats.length, done: true }}
      >
        <Complete
          lesson={lesson}
          attempt={attempt}
          review={review || preview}
          preview={preview}
          reviewLink={Boolean(reviewToken)}
          headingRef={headingRef}
          followUps={followUps}
          queued={completionQueued}
          backTo={backTo}
        />
      </Frame>
    );
  }

  if (!node || !attempt) return null;

  const primary = primaryAction(node, {
    choice,
    quizChecked,
    answers: attempt.answers,
    pendingNext,
  });

  // A vertical presenter video takes the whole card: no label, heading or body on screen.
  const fullVideo =
    node.visual.kind === "presenter" &&
    node.visual.video?.orientation === "portrait" &&
    (Boolean(node.visual.video.src) || node.visual.video.provider === "youtube");
  // A photo set as the full background fills the card, with the text over a dark fade.
  const bgPhoto = node.visual.kind === "illustration" && node.visual.layout === "background" ? node.visual.photo : undefined;
  const tone = toneClasses(textTone);
  // A gradient behind the card (a full-background photo wins). Its text colour comes with the preset.
  // The dedicated audio card fills the card on a soft gradient (mist unless the author picked another).
  const listen = node.type === "listen";
  // Its own colour first, then the lesson's theme (see content/themes.ts).
  const gradient = !bgPhoto ? cardSurface(lesson, node) : null;
  const onColour = bgPhoto ? tone : gradient ? toneClasses(gradient.text) : null;
  // Where the text sits: the top by default, or the bottom over a full-background photo.
  const textPosition = node.textPosition ?? (bgPhoto ? "bottom" : "top");

  // Card audio lives in the footer so it never pushes the card content down.
  const dock =
    node.type === "presenter"
      ? {
          text: node.transcript,
          label: "Introduction",
          durationSec: node.durationSec,
          // The video speaks for itself; an AI presenter still waiting for its video has the script read instead.
          speech: !(node.visual.kind === "presenter" && node.visual.video && !(node.visual.video.provider === "elevenlabs" && !node.visual.video.src)),
        }
      : node.type === "audio" || node.type === "listen"
        ? { text: node.script, label: node.type === "listen" ? "Audio" : "Explanation" }
        : node.narration
          ? {
              text: node.narration,
              label: node.type === "decision" || node.type === "quiz" ? "Question" : "Listen",
            }
          : null;

  /*
    Required completion: what still has to happen before Continue (or a swipe) moves on.
    Not applied in review or author previews, on learning paths that allow skipping, or when the
    audio can't play at all.
  */
  const gate = completionGate(node, {
    answers: attempt.answers,
    finished,
    exempt: review || preview || skipHolds,
    narration: narration ? { playable: narration.playable, state: narration.state } : null,
    speaks: Boolean(dock && dock.speech !== false),
    holdForAudio: lesson.holdForAudio,
  });
  const locked = Boolean(gate) && !primary.disabled;

  function onPrimary() {
    if (!node || !attempt) return;
    switch (primary.kind) {
      case "choose": {
        if (node.type !== "decision" || !choice) return;
        if (pendingNext) return go(pendingNext);
        const opt = node.options.find((o) => o.id === choice)!;
        const answers = { ...attempt.answers, [node.id]: opt.id };
        if (opt.correct !== undefined && answers[`first:${node.id}`] === undefined) answers[`first:${node.id}`] = opt.correct ? 1 : 0;
        if (opt.next && opt.feedback && !opt.stay) {
          setAttempt({ ...attempt, answers });
          setStayFeedback(opt.feedback);
          setPendingNext(opt.next);
          requestAnimationFrame(() => document.getElementById("stay-feedback")?.scrollIntoView({ block: "nearest" }));
          return;
        }
        if (opt.stay || !opt.next) {
          setAttempt({ ...attempt, answers });
          setStayFeedback(opt.feedback ?? null);
          requestAnimationFrame(() => document.getElementById("stay-feedback")?.scrollIntoView({ block: "nearest" }));
          return;
        }
        go(opt.next, answers);
        return;
      }
      case "check": {
        setQuizChecked(true);
        if (node.type !== "quiz") return;
        // Keep each question's first answer for reporting and adaptive follow ups.
        const answers = { ...attempt.answers };
        node.questions.forEach((q) => {
          const key = `first:${node.id}.${q.id}`;
          if (answers[key] === undefined) {
            answers[key] = answers[`${node.id}.${q.id}`] === q.correct ? 1 : 0;
            // Which option they chose first, so authors can see common wrong answers.
            answers[`pick:${node.id}.${q.id}`] = answers[`${node.id}.${q.id}`] as string;
          }
        });
        setAttempt({ ...attempt, answers });
        return;
      }
      case "retry": {
        if (node.type !== "quiz") return;
        const answers = { ...attempt.answers };
        node.questions.forEach((q) => {
          if (answers[`${node.id}.${q.id}`] !== q.correct) delete answers[`${node.id}.${q.id}`];
        });
        setAttempt({ ...attempt, answers });
        setQuizChecked(false);
        return;
      }
      case "complete":
        complete();
        return;
      case "next":
        if ("next" in node && node.next) go(node.next);
    }
  }

  return (
    <Frame
      closeHref={backTo?.href}
      title={`Lesson: ${lesson.title}`}
      beats={lesson.beats}
      saveState={review ? "idle" : saveState}
      headerAction={
        reviewToken ? (
          <ReviewButton review={reviewing} card={node} cards={ordered(lesson)} onJump={(id) => go(id)} />
        ) : preview ? undefined : (
          <CardBookmark lesson={lesson.slug} lessonTitle={lesson.title} card={node.id} label={node.label} heading={node.heading} />
        )
      }
      onRetry={() => pending.current && save(pending.current)}
      progress={{ beat: node.beat, done: false }}
      review={review}
      fill={fullVideo || Boolean(bgPhoto) || listen}
      deck={{
        id: node.id,
        behind: lesson.beats.length - 1 - node.beat,
        // Swiping left does what Continue does, when Continue would move on.
        onNext: !locked && ((primary.kind === "next" && !primary.disabled) || (primary.kind === "choose" && pendingNext)) ? onPrimary : undefined,
        onBack: attempt.route.length > 1 ? back : undefined,
        surface: gradient ? { style: { backgroundImage: gradient.css }, className: toneClasses(gradient.text).text } : undefined,
      }}
      footer={
        <div className="flex flex-col gap-2">
          {completing === "error" && (
            <p role="alert" className="flex items-start gap-2 rounded-2xl border border-danger/60 px-3 py-2 text-sm">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-danger" />
              We couldn’t save your result, so the lesson isn’t marked complete yet. Check your connection and try again.
            </p>
          )}
          {/* How much of the card's audio has played: a line across the top of the footer. */}
          {narration && narration.playable && (
            <div
              role="progressbar"
              aria-label="Audio played"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(narration.progress * 100)}
              className="absolute inset-x-0 top-0 h-1 bg-line"
            >
              <div
                className={cx("h-full transition-[width] duration-300 ease-linear", narration.state === "ended" ? "bg-success" : "bg-[var(--action)]")}
                style={{ width: `${Math.min(100, narration.progress * 100)}%` }}
              />
            </div>
          )}
          <div id="card-caption" />
          {/* Waiting for audio: the line across the top of the footer shows it, so only screen readers get the words. */}
          {locked &&
            (gate === LISTEN_GATE ? (
              <p role="status" className="sr-only">
                {gate}
              </p>
            ) : (
              <p role="status" className="flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-ink-muted">
                <Icon name="lock" className="size-3.5" /> {gate}
              </p>
            ))}
          <div className="flex items-center justify-between gap-2">
            {attempt.route.length > 1 ? (
              <button
                type="button"
                onClick={back}
                aria-label="Back"
                className="inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-full border border-line-strong px-3 font-medium hover:bg-muted min-[400px]:px-4"
              >
                <Icon name="arrow-left" className="size-4" /> <span className="hidden min-[400px]:inline">Back</span>
              </button>
            ) : (
              dock && <span aria-hidden className="w-12 min-[400px]:w-[5.75rem]" />
            )}
            {dock && (
              <Narration
                key={node.id}
                {...dock}
                audioSrc={node.audioSrc}
                // The dedicated audio card shows its own caption and play button.
                captionTarget={node.type === "listen" ? undefined : "card-caption"}
                controls={node.type !== "listen"}
                autoPlay={node.type !== "listen"}
                ttsKey={`lesson:${lesson.slug}:${node.id}`}
              />
            )}
            <button
              type="button"
              onClick={onPrimary}
              disabled={primary.disabled || locked || completing === "saving"}
              className={cx(
                "fx-press inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-45 sm:px-6 sm:text-lg",
                dock ? "" : "ml-auto flex-1 text-lg sm:flex-none",
                // The audio has finished and Continue has just unlocked: one pulse to draw the eye.
                narration?.state === "ended" && !locked && !primary.disabled && "fx-ready",
              )}
            >
              {completing === "saving" ? "Saving your result…" : completing === "error" && primary.completes ? "Try again" : primary.label}
              {!primary.completes && completing !== "saving" && <Icon name="arrow-right" className="size-5" />}
            </button>
          </div>
        </div>
      }
    >
      {fullVideo ? (
        <div key={node.id} className="animate-card-in h-full">
          {/* The heading stays for screen readers and focus, but isn't shown. */}
          <h2 ref={headingRef} tabIndex={-1} className="sr-only">
            {node.heading}
          </h2>
          <CardVisual visual={node.visual} className="h-full w-full" onComplete={() => markDone(node.id)} />
        </div>
      ) : node.type === "listen" ? (
        <div key={node.id} className="animate-card-in h-full">
          <ListenCard
            ttsKey={`lesson:${lesson.slug}:${node.id}`}
            label={node.label}
            heading={node.heading}
            body={node.body}
            script={node.script}
            headingRef={headingRef}
          />
        </div>
      ) : (
        <div
          key={node.id}
          className={cx(
            "animate-card-in flex flex-col gap-4",
            bgPhoto
              ? cx(
                  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden relative isolate h-full overflow-y-auto bg-black p-5",
                  textPosition === "top" ? "justify-start pt-16" : textPosition === "center" ? "justify-center" : "justify-end pt-24",
                  tone.text,
                )
              : textPosition !== "top" && "min-h-full",
          )}
        >
          {bgPhoto && (
            <>
              {bgPhoto.animated ? (
                <MotionPhoto
                  still={bgPhoto.src}
                  mp4={bgPhoto.animated.mp4}
                  alt={node.visual.kind === "illustration" ? node.visual.alt : ""}
                  className="-z-10"
                  style={{ objectPosition: bgPhoto.position ?? "center" }}
                  buttonClassName="left-3 top-3"
                />
              ) : (
                <Image
                  src={bgPhoto.src}
                  alt={node.visual.kind === "illustration" ? node.visual.alt : ""}
                  fill
                  sizes="30rem"
                  className="-z-10 object-cover"
                  style={{ objectPosition: bgPhoto.position ?? "center" }}
                />
              )}
              <div aria-hidden className={cx("absolute inset-0 -z-10", tone.fade)} />
              {bgPhoto.credit && <PhotoCredit credit={bgPhoto.credit} className="absolute right-3 top-3 [text-shadow:none]" />}
            </>
          )}
          {node.visual.kind !== "none" && !bgPhoto && (
            <CardVisual
              visual={node.visual}
              onComplete={() => markDone(node.id)}
              // Full bleed: past the card's padding to its top and side edges, square where the text starts.
              className={cx(
                "-mx-4 -mt-4 rounded-none!",
                node.visual.kind === "presenter"
                  ? node.visual.video
                    ? node.visual.video.orientation === "portrait"
                      ? undefined
                      : "aspect-video"
                    : "aspect-[4/3]"
                  : node.visual.kind === "orbit"
                    ? "aspect-square min-[400px]:aspect-[4/3]"
                    : "aspect-[16/10]",
              )}
            />
          )}
          {/* Talking-head video bubbles, centred at the top of the card. */}
          {node.bubbles && node.bubbles.length > 0 && <VideoBubbles key={node.id} bubbles={node.bubbles} onComplete={() => markDone(node.id)} />}
          {/* Centre or bottom text: the space above the text grows (and below it too, for centre). */}
          {!bgPhoto && textPosition !== "top" && <div aria-hidden className="-my-2 flex-1" />}
          <div>
            <p
              className={cx(
                "font-mulish text-xs font-extrabold uppercase tracking-[0.14em]",
                onColour ? (gradient?.accent ?? onColour.soft) : node.emphasis === "consequence" ? "text-warm" : "text-accent",
              )}
            >
              {node.emphasis === "consequence" && <Icon name="alert" className="mr-1 inline size-4 align-[-3px]" />}
              {node.label}
            </p>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="mt-2 font-serif text-[1.85rem] font-semibold leading-[1.12] tracking-tight outline-none focus-visible:outline-none sm:text-[2.1rem]"
            >
              {node.heading}
            </h2>
            {node.figure && node.figure.placement === "above" && <CardFigure figure={node.figure} onColour={Boolean(onColour)} className="mt-4" />}
            {node.body && <RichText text={node.body} className={cx("mt-3 text-lg leading-relaxed", onColour ? onColour.text : "text-ink")} />}
            {node.figure && node.figure.placement !== "above" && <CardFigure figure={node.figure} onColour={Boolean(onColour)} className="mt-4" />}
            {node.pdf && (
              <CardDocument
                pdf={node.pdf}
                onColour={Boolean(onColour)}
                className="mt-4"
                status={attempt.answers[`pdf:${node.id}`] === "end" ? "end" : attempt.answers[`pdf:${node.id}`] ? "opened" : undefined}
                onOpened={() => attempt.answers[`pdf:${node.id}`] || setAnswer(`pdf:${node.id}`, "opened")}
                onFinished={() => setAnswer(`pdf:${node.id}`, "end")}
              />
            )}
            {node.keyPoints && <KeyPoints points={node.keyPoints} onColour={Boolean(onColour)} />}
            {node.source && (
              <a
                href={node.source.url}
                rel="noreferrer"
                className={cx(
                  "mt-2 inline-flex min-h-9 items-center gap-1.5 text-sm underline-offset-4 hover:underline",
                  onColour ? cx(onColour.soft, "hover:underline") : "text-ink-muted hover:text-accent",
                )}
              >
                <Icon name="external" className="size-3.5 shrink-0" />
                Source: {node.source.title}
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
            {node.detail && (
              <button
                type="button"
                aria-expanded={detailOpen}
                onClick={() => setDetailOpen((o) => !o)}
                className="mt-2 inline-flex min-h-11 items-center gap-1 font-semibold text-accent"
              >
                Learn more <Icon name="chevron-down" className={cx("size-4 transition-transform", detailOpen && "rotate-180")} />
              </button>
            )}
            {node.detail && detailOpen && (
              <div className="mt-1 rounded-2xl bg-muted p-4 text-[0.95rem]">
                <p className="font-semibold">{node.detail.title}</p>
                {node.detail.paragraphs.map((p) => (
                  <p key={p} className="mt-2 text-ink-muted">
                    {p}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* On a coloured background, choices and controls sit on a frosted panel so they stay easy to read. */}
          <div className={cx(onColour && panelledOnColour(node.type) && onColour.panel)}>
            <CardBody
              node={node}
              attempt={attempt}
              choice={choice}
              setChoice={(c) => {
                setChoice(c);
                setStayFeedback(null);
                setPendingNext(null);
              }}
              stayFeedback={stayFeedback}
              positive={Boolean(pendingNext)}
              setAnswer={setAnswer}
              quizChecked={quizChecked}
              setQuizChecked={setQuizChecked}
              lessonSlug={lesson.slug}
              lessonInfo={{ title: lesson.title, outcome: lesson.outcome }}
              authorPreview={preview}
              countVotes={!preview && !review}
              tinted={Boolean(onColour)}
            />
          </div>
          {/* Reviewers comment through the Comment button instead. */}
          {!reviewToken && (
            <ReportProblem key={`report-${node.id}`} slug={lesson.slug} cardId={node.id} preview={preview || review} onColour={Boolean(onColour)} />
          )}
          {!reviewToken && commentsOn(node) && (
            <CardComments key={node.id} slug={lesson.slug} cardId={node.id} onColour={Boolean(onColour)} readOnly={preview} />
          )}
          {!bgPhoto && textPosition === "center" && <div aria-hidden className="-my-2 flex-1" />}
        </div>
      )}
    </Frame>
  );
}

type PrimaryKind = "choose" | "check" | "retry" | "complete" | "next";

function primaryAction(
  node: Card,
  ctx: {
    choice: string | null;
    quizChecked: boolean;
    answers: LessonAttempt["answers"];
    pendingNext: string | null;
  },
): {
  label: string;
  kind: PrimaryKind;
  disabled?: boolean;
  completes?: boolean;
} {
  switch (node.type) {
    case "decision":
      return ctx.pendingNext ? { label: "Continue", kind: "choose" } : { label: "Choose", kind: "choose", disabled: !ctx.choice };
    case "quiz": {
      const allAnswered = node.questions.every((q) => ctx.answers[`${node.id}.${q.id}`]);
      const allRight = node.questions.every((q) => ctx.answers[`${node.id}.${q.id}`] === q.correct);
      if (!ctx.quizChecked)
        return {
          label: "Check your answer",
          kind: "check",
          disabled: !allAnswered,
        };
      if (allRight) return node.next ? { label: "Continue", kind: "next" } : { label: "Finish lesson", kind: "complete", completes: true };
      return { label: "Try again", kind: "retry" };
    }
    case "poll":
    case "rating":
    case "wall":
    case "hotspot":
      return { label: "Continue", kind: "next", disabled: !ctx.answers[node.id] };
    case "checklist":
      return { label: "Continue", kind: "next", disabled: !checklistDone(node, tickedFrom(ctx.answers[node.id])) };
    case "written": {
      // Checked at least once; with "must meet every criterion", passed (or out of tries, or AI unavailable).
      const state = ctx.answers[node.id];
      const tries = Number(ctx.answers[`${node.id}.tries`] ?? 0);
      const free = state === "passed" || state === "unavailable" || (state === "tried" && (!node.mustPass || tries >= (node.maxAttempts ?? 3)));
      return { label: "Continue", kind: "next", disabled: !free };
    }
    case "summary":
      return { label: node.cta, kind: "complete", completes: true };
    case "image":
      return { label: node.cta ?? "Continue", kind: "next" };
    default:
      return { label: "Continue", kind: "next" };
  }
}

function CardBody({
  node,
  attempt,
  choice,
  setChoice,
  stayFeedback,
  positive,
  setAnswer,
  quizChecked,
  setQuizChecked,
  lessonSlug,
  lessonInfo,
  authorPreview,
  countVotes,
  tinted,
}: {
  node: Card;
  attempt: LessonAttempt;
  choice: string | null;
  setChoice: (c: string) => void;
  stayFeedback: string | null;
  positive: boolean;
  setAnswer: (key: string, value: string | number) => void;
  quizChecked: boolean;
  setQuizChecked: (c: boolean) => void;
  lessonSlug: string;
  lessonInfo: { title: string; outcome: string };
  /** An author previewing a draft: AI checks use the card as written. */
  authorPreview: boolean;
  /** False in previews and reviews: votes are shown but not counted. */
  countVotes: boolean;
  /** The card has a gradient or photo behind it. */
  tinted: boolean;
}) {
  switch (node.type) {
    case "wall":
      return (
        <Wall
          key={node.id}
          card={node}
          slug={lessonSlug}
          count={countVotes}
          tinted={tinted}
          posted={Boolean(attempt.answers[node.id])}
          onPosted={() => setAnswer(node.id, "posted")}
        />
      );
    case "poll":
      return (
        <Poll
          key={node.id}
          card={node}
          slug={lessonSlug}
          count={countVotes}
          chosen={(attempt.answers[node.id] as string) ?? null}
          onChoose={(id) => setAnswer(node.id, id)}
        />
      );
    case "written":
      return (
        <WrittenAnswer
          key={node.id}
          card={node}
          slug={lessonSlug}
          lesson={lessonInfo}
          preview={authorPreview}
          answers={attempt.answers}
          setAnswer={setAnswer}
        />
      );
    case "resources":
      return <Resources key={node.id} card={node} />;
    case "checklist":
      return <Checklist key={node.id} card={node} ticked={tickedFrom(attempt.answers[node.id])} onChange={(t) => setAnswer(node.id, t.join(","))} />;
    case "hotspot": {
      const found = String(attempt.answers[`${node.id}.found`] ?? "")
        .split(",")
        .filter(Boolean);
      return (
        <Hotspots
          key={node.id}
          card={node}
          found={found}
          onFind={(id) => {
            const next = [...found, id];
            setAnswer(`${node.id}.found`, next.join(","));
            if (next.length >= hotspotsNeeded(node)) setAnswer(node.id, "done");
          }}
        />
      );
    }
    case "rating":
      return (
        <Rating
          key={node.id}
          card={node}
          slug={lessonSlug}
          count={countVotes}
          chosen={(attempt.answers[node.id] as number) ?? null}
          onChoose={(n) => setAnswer(node.id, n)}
        />
      );
    case "presenter":
      // Its audio plays from the footer dock.
      return null;
    case "audio":
      // Narrated content: the voice plays from the footer dock.
      return null;
    case "widget":
      return node.widget.html ? <Widget key={node.id} html={node.widget.html} alt={node.widget.alt} onUse={() => setAnswer(node.id, 1)} /> : null;
    case "calculator":
      return <Calculator calc={node.calc} value={(attempt.answers[node.id] as number) ?? node.calc.initial} onChange={(m) => setAnswer(node.id, m)} />;
    case "decision":
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">{node.prompt}</legend>
          {node.options.map((o) => (
            <label
              key={o.id}
              className={cx(
                "fx-press flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors",
                choice === o.id ? "fx-pop border-action bg-tealtint" : "border-line bg-surface hover:border-line-strong",
              )}
            >
              <input
                type="radio"
                name={node.id}
                value={o.id}
                checked={choice === o.id}
                onChange={() => setChoice(o.id)}
                className="size-5 shrink-0 accent-[var(--action)]"
              />
              <span className="leading-snug">{o.label}</span>
            </label>
          ))}
          {stayFeedback && (
            <p
              id="stay-feedback"
              role="status"
              className={cx("fx-rise mt-1 flex gap-2 rounded-2xl px-4 py-3 text-[0.95rem]", positive ? "bg-tealtint" : "border border-warm/60")}
            >
              <Icon name={positive ? "check" : "info"} className={cx("fx-tick mt-0.5 size-5 shrink-0", positive ? "text-accent" : "text-warm")} />
              <span>
                {stayFeedback}
                {!positive && <strong className="mt-1 block font-semibold">Try again.</strong>}
              </span>
            </p>
          )}
        </fieldset>
      );
    case "response":
      return <ResponseCard node={node} slug={lessonSlug} value={(attempt.answers[node.id] as string) ?? ""} onChange={(v) => setAnswer(node.id, v)} />;
    case "quiz":
      return (
        <Quiz
          cardId={node.id}
          questions={node.questions}
          answers={attempt.answers}
          onAnswer={setAnswer}
          checked={quizChecked}
          onCheckedChange={setQuizChecked}
        />
      );
    case "summary":
      return (
        <div className="flex flex-col gap-3">
          {/* Panels carry their own text colour, so they stay readable on a navy recap card. */}
          <div className="rounded-2xl bg-tealtint p-4 text-ink">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Your next action</p>
            <p className="mt-1 text-lg font-semibold leading-snug">
              <RichInline text={node.action} />
            </p>
          </div>
          {node.points && (
            <ul className="flex flex-col gap-2">
              {node.points.map((p) => {
                const [term, rest] = p.split(/:\s*/, 2);
                return (
                  <li key={p} className="flex gap-3 rounded-2xl bg-muted px-4 py-3 text-ink">
                    <Icon name="check" className="mt-1 size-4 shrink-0 text-accent" />
                    <span>
                      {/* "Term: explanation" points show the term in bold; any other formatting comes from the text. */}
                      {rest && !/\*\*|\]\(/.test(p) ? (
                        <>
                          <strong>
                            <RichInline text={term} />:
                          </strong>{" "}
                          <RichInline text={rest} />
                        </>
                      ) : (
                        <RichInline text={p} />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {node.references && <OfficialResources items={node.references} />}
          {node.reference && (
            <a href={node.reference.url} rel="noreferrer" className="flex min-h-14 items-center gap-3 rounded-2xl border border-line px-4 py-3 hover:bg-muted">
              <Icon name="doc" className="size-5 shrink-0 text-accent" />
              <span className="flex-1">
                <span className="block font-semibold">{node.reference.title}</span>
                <span className="block text-sm text-ink-muted">{node.reference.issuer}</span>
              </span>
              <Icon name="external" className="size-4 shrink-0" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </div>
      );
    default:
      return null;
  }
}

type Feedback = {
  verdict: "on_track" | "partly" | "not_yet";
  summary: string;
  strengths: string[];
  improve: string[];
  try_this: string;
  privacy_note: string;
  concern: boolean;
};
const VERDICT: Record<Feedback["verdict"], { label: string; className: string }> = {
  on_track: { label: "On track", className: "bg-action text-on-action" },
  partly: { label: "Nearly there", className: "bg-gold/40 text-ink" },
  not_yet: { label: "Have another go", className: "bg-orange/20 text-ink" },
};

/** A written answer, practice feedback from Claude on request, and the example answer. */
function ResponseCard({
  node,
  slug,
  value,
  onChange,
}: {
  node: Extract<Card, { type: "response" }>;
  slug: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [showModel, setShowModel] = useState(false);
  const [feedback, setFeedback] = useState<{ for: string; fb: Feedback } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enough = value.trim().split(/\s+/).filter(Boolean).length >= 3;
  // Feedback belongs to the words it was given for; editing the answer shows it's out of date.
  const stale = feedback && feedback.for !== value.trim();

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const fb = await api<Feedback>("/api/lessons/feedback", { body: { lesson: slug, card: node.id, response: value } });
      setFeedback({ for: value.trim(), fb });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${node.id}-text`} className="font-semibold">
        {node.prompt}
      </label>
      <textarea
        id={`${node.id}-text`}
        rows={4}
        value={value}
        maxLength={2000}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-2xl border border-line-strong bg-surface p-3 text-[1.05rem]"
        aria-describedby={`${node.id}-vis`}
      />
      <p id={`${node.id}-vis`} className="text-sm text-ink-muted">
        {node.visibility} Avoid client names or details.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={ask}
          disabled={!enough || busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-4 font-semibold text-on-action hover:bg-action-hover disabled:opacity-45"
        >
          {busy ? (
            <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Icon name="spark" className="size-4" />
          )}
          {busy ? "Reading your answer…" : feedback ? "Get feedback again" : "Get feedback"}
        </button>
        <button type="button" aria-expanded={showModel} onClick={() => setShowModel((s) => !s)} className="min-h-11 px-2 font-semibold text-accent">
          {showModel ? "Hide example answer" : "See an example answer"}
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-2xl bg-orange/10 p-3 text-sm">
          {error}
        </p>
      )}
      {feedback && (
        <section
          aria-live="polite"
          aria-label="Feedback on your answer"
          className={cx("flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4", stale && "opacity-60")}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("rounded-full px-3 py-1 font-mulish text-xs font-extrabold", VERDICT[feedback.fb.verdict].className)}>
              {VERDICT[feedback.fb.verdict].label}
            </span>
            <span className="text-xs text-ink-muted">Practice feedback from AI · not an assessment</span>
          </div>
          {feedback.fb.concern && (
            <p className="flex items-start gap-2 rounded-xl border-2 border-warm/60 bg-orange/10 p-3 text-[0.95rem]">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-warm" />
              <span>If someone may be at risk, tell your coordinator or manager today. Call 000 if anyone is in immediate danger.</span>
            </p>
          )}
          <p className="text-[1.02rem]">{feedback.fb.summary}</p>
          {feedback.fb.strengths.length > 0 && (
            <div>
              <p className="text-sm font-semibold">What works</p>
              <ul className="mt-1 flex flex-col gap-1">
                {feedback.fb.strengths.map((t) => (
                  <li key={t} className="flex gap-2 text-[0.95rem]">
                    <Icon name="check" className="mt-1 size-4 shrink-0 text-accent" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {feedback.fb.improve.length > 0 && (
            <div>
              <p className="text-sm font-semibold">To make it stronger</p>
              <ul className="mt-1 flex flex-col gap-1">
                {feedback.fb.improve.map((t) => (
                  <li key={t} className="flex gap-2 text-[0.95rem]">
                    <Icon name="arrow-right" className="mt-1 size-4 shrink-0 text-accent" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {feedback.fb.try_this && (
            <div className="rounded-xl bg-tealtint p-3">
              <p className="text-sm font-semibold">You could try</p>
              <p className="mt-1 italic">{feedback.fb.try_this}</p>
            </div>
          )}
          {feedback.fb.privacy_note && <p className="text-sm text-ink-muted">{feedback.fb.privacy_note}</p>}
          {stale && <p className="text-xs text-ink-muted">You’ve changed your answer since. Ask again for fresh feedback.</p>}
        </section>
      )}
      {showModel && <p className="rounded-2xl bg-muted p-4 italic">{node.modelResponse}</p>}
    </div>
  );
}

function Intro({
  part,
  lesson,
  stored,
  onStart,
  onResume,
  onReview,
}: {
  part: "body" | "actions";
  lesson: Lesson;
  stored?: LessonAttempt;
  onStart: () => void;
  onResume: () => void;
  onReview: () => void;
}) {
  const sameVersion = stored?.version === lesson.version;
  const inProgress = stored?.status === "in_progress" && sameVersion;
  const completed = stored?.status === "completed";
  const resumeAt = inProgress ? lesson.nodes[stored.nodeId] : undefined;

  if (part === "actions") {
    return (
      <div className="flex flex-col gap-2">
        {completed ? (
          <>
            <p className="flex items-center gap-2 rounded-2xl bg-tealtint px-4 py-3 font-medium">
              <Icon name="check" className="size-5 text-accent" />
              Completed {stored.completedAt && formatDate(stored.completedAt)} · version {stored.version}
            </p>
            <button
              type="button"
              onClick={onReview}
              className="min-h-12 rounded-full bg-action px-6 text-lg font-semibold text-on-action hover:bg-action-hover"
            >
              Review again
            </button>
            <p className="text-center text-sm text-ink-muted">Reviewing won’t change your completion record.</p>
          </>
        ) : inProgress ? (
          <>
            <button
              type="button"
              onClick={onResume}
              className="min-h-12 rounded-full bg-action px-6 text-lg font-semibold text-on-action hover:bg-action-hover"
            >
              Keep learning
            </button>
            <p className="text-center text-sm text-ink-muted">You stopped at “{resumeAt?.heading}”.</p>
            <button type="button" onClick={onStart} className="min-h-11 rounded-full font-medium text-ink-muted hover:bg-muted">
              Start again
            </button>
          </>
        ) : (
          <button type="button" onClick={onStart} className="min-h-12 rounded-full bg-action px-6 text-lg font-semibold text-on-action hover:bg-action-hover">
            Start lesson
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <CardVisual
        visual={{
          kind: "illustration",
          ...lesson.visual,
          alt: lesson.visual.alt ?? "",
        }}
        className="aspect-[16/10]"
      />
      <div>
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">
          {lesson.track === "briefing"
            ? "Policy briefing"
            : lesson.track === "coordinator"
              ? "Coordinator lesson"
              : lesson.track === "core"
                ? "Core lesson"
                : lesson.track === "reinforcement"
                  ? "Follow up"
                  : "Partner lesson"}{" "}
          · About {lesson.minutes} minutes
        </p>
        <h1 className="mt-2 font-serif text-[2.1rem] font-semibold leading-[1.1] tracking-tight">{lesson.title}</h1>
        <p className="mt-3 text-lg">{lesson.summary}</p>
      </div>
      <ul className="flex flex-col gap-2 text-[0.95rem]">
        <li className="flex gap-3">
          <Icon name="spark" className="mt-0.5 size-5 shrink-0 text-accent" />
          <span>
            <strong>You’ll be able to:</strong> {lesson.outcome}
          </span>
        </li>
        <li className="flex gap-3">
          <Icon name="check" className="mt-0.5 size-5 shrink-0 text-accent" />
          <span>
            <strong>To complete:</strong> {lesson.completion.label}.
          </span>
        </li>
        <li className="flex gap-3">
          <Icon name="volume" className="mt-0.5 size-5 shrink-0 text-accent" />
          <span>Audio is optional. Everything is available to read.</span>
        </li>
        {lesson.assignment?.required && (
          <li className="flex gap-3">
            <Icon name="clock" className="mt-0.5 size-5 shrink-0 text-warm" />
            <span>
              <strong>Assigned to you</strong>
              {lesson.assignment.due && <> · due {formatDate(lesson.assignment.due)}</>}
            </span>
          </li>
        )}
      </ul>

      {stored && !sameVersion && stored.status === "in_progress" && (
        <p className="rounded-2xl bg-muted p-3 text-sm">This lesson has been updated since you started. You’ll begin the new version.</p>
      )}
    </div>
  );
}

function Complete({
  lesson,
  attempt,
  review,
  preview,
  reviewLink = false,
  headingRef,
  followUps,
  queued = false,
  backTo,
}: {
  lesson: Lesson;
  attempt: LessonAttempt;
  review: boolean;
  preview: boolean;
  /** Reached the end from a review link. */
  reviewLink?: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  followUps: CompletionResult["followUps"];
  /** Finished while offline: recorded on this device, syncing later. */
  queued?: boolean;
  backTo?: { href: string; label: string };
}) {
  const ack = lesson.completion.type === "acknowledge";
  return (
    <div className="animate-card-in flex flex-col gap-5 py-6">
      {queued && (
        <p role="status" className="flex items-start gap-2 rounded-2xl bg-gold/15 p-3 text-sm ring-1 ring-gold/60">
          <Icon name="check" className="mt-0.5 size-4 shrink-0" />
          You’re offline, so this is saved on your device. It will be recorded as complete as soon as you’re back online.
        </p>
      )}
      {!preview && !review && !queued && <PathCelebration lessonSlug={lesson.slug} />}
      <span className="inline-flex size-16 items-center justify-center rounded-full bg-tealtint text-accent">
        <Icon name="check" className="size-8" />
      </span>
      <div>
        <h2 ref={headingRef} tabIndex={-1} className="font-serif text-[2rem] font-semibold leading-tight outline-none">
          {reviewLink
            ? "End of the lesson"
            : preview
              ? "Preview finished"
              : review
                ? "Review finished"
                : lesson.track === "reinforcement"
                  ? "Follow up done"
                  : ack
                    ? "Briefing acknowledged"
                    : "Lesson complete"}
        </h2>
        <p className="mt-3 text-lg">
          {reviewLink
            ? "Thanks for reviewing. Your comments go straight to the author. To add more, go back to any card and press Comment."
            : preview
              ? "Nothing was recorded. Approve the variations when you’re happy with them."
              : review
                ? "Your original completion record is unchanged."
                : "Your result is saved. You can come back to this lesson at any time."}
        </p>
        {lesson.completionMessage && <p className="mt-4 font-serif text-2xl font-semibold leading-snug text-accent">{lesson.completionMessage}</p>}
      </div>
      {/* Surveys this completion triggered: the lesson's own, or the module survey if it finished a learning path. */}
      {!review && !preview && lesson.track !== "reinforcement" && <WaitingSurveys lesson={lesson.slug} />}
      {!review &&
        followUps.map((f) => (
          <div key={f.pathName} className="rounded-2xl bg-tealtint p-4">
            <p className="flex items-center gap-2 font-semibold">
              <Icon name="route" className="size-5 text-accent" /> A quick follow up will help you practise this in a new situation.
            </p>
            <p className="mt-1 text-[0.95rem]">
              {f.firstRelease ? `Expected ${formatWhen(f.firstRelease, f.timezone)}` : "Coming soon"} · {durationLabel(f.durationSec).toLowerCase()}. It’ll
              appear under Learning, and we’ll send a short reminder.
            </p>
          </div>
        ))}
      {!review && attempt.completedAt && (
        <dl className="rounded-2xl border border-line p-4 text-[0.95rem]">
          <div className="flex justify-between gap-3 py-1">
            <dt className="text-ink-muted">Completed</dt>
            <dd className="font-medium">{formatDate(attempt.completedAt)}</dd>
          </div>
          <div className="flex justify-between gap-3 py-1">
            <dt className="text-ink-muted">Requirement</dt>
            <dd className="text-right font-medium">{lesson.completion.label}</dd>
          </div>
          <div className="flex justify-between gap-3 py-1">
            <dt className="text-ink-muted">Content version</dt>
            <dd className="font-medium">{lesson.version}</dd>
          </div>
        </dl>
      )}
      <div className="flex flex-col gap-2">
        <Link
          href={backTo?.href ?? "/learning"}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-action px-6 text-lg font-semibold text-on-action hover:bg-action-hover"
        >
          {backTo?.label ?? "Back to learning"}
        </Link>
        <Link href="/onboarding" className="inline-flex min-h-11 items-center justify-center rounded-full font-medium text-ink-muted hover:bg-muted">
          Go to my onboarding
        </Link>
      </div>
    </div>
  );
}

function OfficialResources({ items }: { items: { title: string; url: string; issuer: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 font-medium hover:bg-muted"
      >
        <Icon name="doc" className="size-4" /> {open ? "Hide official resources" : "View official resources"}
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-2">
          {items.map((r) => (
            <li key={r.url}>
              <a href={r.url} rel="noreferrer" className="flex min-h-12 items-center gap-3 rounded-2xl border border-line px-4 py-2 hover:bg-muted">
                <span className="flex-1">
                  <span className="block font-semibold leading-snug">{r.title}</span>
                  <span className="block text-sm text-ink-muted">{r.issuer}</span>
                </span>
                <Icon name="external" className="size-4 shrink-0" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Key points as chips or tiles. On a coloured card (a theme, colour or photo) they sit on white so they stand out from it. */
function KeyPoints({ points, onColour = false }: { points: NonNullable<Card["keyPoints"]>; onColour?: boolean }) {
  const box = onColour ? "bg-white text-[#102a43] shadow-sm [text-shadow:none]" : "bg-muted";
  return (
    <div className="mt-4 flex flex-col gap-3">
      {points.title && <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{points.title}</p>}
      {points.style === "chips" ? (
        <ul className="flex flex-wrap gap-2">
          {points.items.map((p, i) => (
            <li key={p.text} className={cx("inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-[0.95rem]", box)}>
              <span
                aria-hidden
                className={cx(
                  "inline-flex size-6 items-center justify-center rounded-full font-mulish text-xs font-bold",
                  onColour ? "bg-[#ddf2f3] text-[#2d4875]" : "bg-surface text-accent",
                )}
              >
                {p.icon ? <Icon name={p.icon} className="size-3.5" /> : i + 1}
              </span>
              <span>
                <RichInline text={p.text} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {points.items.map((p) => (
            <li key={p.text} className={cx("flex flex-col gap-2 rounded-2xl p-3", box)}>
              {p.icon && (
                <span
                  aria-hidden
                  className={cx(
                    "inline-flex size-8 items-center justify-center rounded-full",
                    onColour ? "bg-[#ddf2f3] text-[#2d4875]" : "bg-tealtint text-accent",
                  )}
                >
                  <Icon name={p.icon} className="size-4" />
                </span>
              )}
              <span className="text-[0.95rem] font-medium leading-snug">
                <RichInline text={p.text} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {points.tip && (
        <p
          className={cx(
            "flex gap-2 rounded-2xl border-l-4 border-action pl-3 text-[0.95rem]",
            onColour ? "bg-white py-2 pr-3 text-[#102a43] [text-shadow:none]" : "bg-surface",
          )}
        >
          <span>
            <strong>In practice:</strong> {points.tip}
          </span>
        </p>
      )}
    </div>
  );
}

/** Tells the learner up front when a lesson comes back as spaced follow ups. */
function SpacedNote({ slug }: { slug: string }) {
  const data = useApi<{
    lessons: Record<string, { stage: string; gap: number }[]>;
    signoff: string[];
  }>("/api/lessons/spaced").data;
  const stages = data?.lessons[slug];
  if (!stages?.length) return null;
  const days = cumulative(stages.map((s) => s.gap));
  return (
    <div className="mt-4 rounded-2xl bg-muted p-3 text-[0.95rem]">
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="route" className="size-4 text-accent" /> Includes spaced learning
      </p>
      <p className="mt-1 text-ink-muted">
        After you finish, short follow ups bring it back: {stages.map((s, i) => `${s.stage} (${spacedWhen(days[i])})`).join(", ")}.
        {data?.signoff.includes(slug) && " Then your manager confirms you’re putting it into practice at work."}
      </p>
    </div>
  );
}

type PollResult = { counts: Record<string, number>; total: number; mine: string | null };

/** A poll: pick an option, then see how everyone else answered. Changing your mind moves your vote. */
function Poll({
  card,
  slug,
  count,
  chosen,
  onChoose,
}: {
  card: Extract<Card, { type: "poll" }>;
  slug: string;
  count: boolean;
  chosen: string | null;
  onChoose: (id: string) => void;
}) {
  const [result, setResult] = useState<PollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!count) return;
    let live = true;
    api<PollResult>(`/api/polls?lesson=${encodeURIComponent(slug)}&card=${encodeURIComponent(card.id)}`).then(
      (r) => {
        if (!live) return;
        setResult(r);
        if (r.mine && !chosen) onChoose(r.mine);
      },
      () => {},
    );
    return () => {
      live = false;
    };
    // Load once per card; later changes come from voting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, card.id, count]);

  async function choose(id: string) {
    onChoose(id);
    setError(null);
    if (!count) {
      // Preview: show the choice against empty results without recording anything.
      setResult({ counts: Object.fromEntries(card.options.map((o) => [o.id, o.id === id ? 1 : 0])), total: 1, mine: id });
      return;
    }
    try {
      const r = await sendOrQueue<PollResult>("/api/polls", { lesson: slug, card: card.id, option: id }, { label: `Poll answer: “${card.prompt}”` });
      // Offline, the vote is kept on this device and counted once back online; results show then.
      if (r.queued) setError("You’re offline. Your answer is saved and will count when you’re back online.");
      else setResult(r.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const voted = chosen ?? result?.mine ?? null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-lg font-semibold">{card.prompt}</legend>
      {card.options.map((o) => {
        const n = result?.counts[o.id] ?? 0;
        const pct = voted && result?.total ? Math.round((n / result.total) * 100) : null;
        const mine = voted === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => choose(o.id)}
            aria-pressed={mine}
            className={cx(
              "fx-press relative min-h-12 overflow-hidden rounded-2xl border-2 px-4 py-3 text-left text-[1.02rem] transition-colors",
              mine ? "fx-pop border-action bg-surface" : "border-line-strong bg-surface hover:bg-muted",
            )}
          >
            {pct !== null && (
              <span aria-hidden className={cx("fx-grow absolute inset-y-0 left-0", mine ? "bg-action/20" : "bg-muted")} style={{ width: `${pct}%` }} />
            )}
            <span className="relative flex items-center gap-3">
              <span className="min-w-0 flex-1 font-medium">{o.label}</span>
              {mine && <Icon name="check" className="fx-tick size-4 text-accent" />}
              {pct !== null && <span className="fx-rise font-mulish font-extrabold">{pct}%</span>}
            </span>
          </button>
        );
      })}
      <p className="text-sm text-ink-muted" role="status">
        {error ??
          (voted
            ? count
              ? `${result?.total ?? 1} ${result?.total === 1 ? "person has" : "people have"} answered. You can change your answer.`
              : "Preview: your answer isn’t counted."
            : "Pick one. There’s no right answer.")}
      </p>
    </fieldset>
  );
}

type RatingResult = { mine: number | null; results: { average: number; total: number; counts: number[] } | null };

const STAR = "M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.8l-5.25 2.8 1-5.8L3.5 9.7l5.9-.9z";

/**
  A confidence rating: tap one to five stars. Like a poll, the average and spread only appear once
  you've rated (the server doesn't send them before). Tapping again changes your rating.
*/
function Rating({
  card,
  slug,
  count,
  chosen,
  onChoose,
}: {
  card: Extract<Card, { type: "rating" }>;
  slug: string;
  count: boolean;
  chosen: number | null;
  onChoose: (n: number) => void;
}) {
  const [result, setResult] = useState<RatingResult | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!count) return;
    let live = true;
    api<RatingResult>(`/api/ratings?lesson=${encodeURIComponent(slug)}&card=${encodeURIComponent(card.id)}`).then(
      (r) => {
        if (!live) return;
        setResult(r);
        if (r.mine && !chosen) onChoose(r.mine);
      },
      () => {},
    );
    return () => {
      live = false;
    };
    // Load once per card; later changes come from rating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, card.id, count]);

  async function choose(n: number) {
    onChoose(n);
    setError(null);
    if (!count) {
      // Preview: show your rating against empty results without recording anything.
      setResult({ mine: n, results: { average: n, total: 1, counts: [1, 2, 3, 4, 5].map((s) => (s === n ? 1 : 0)) } });
      return;
    }
    try {
      const r = await sendOrQueue<RatingResult>("/api/ratings", { lesson: slug, card: card.id, stars: n }, { label: `Rating: “${card.prompt}”` });
      if (r.queued) setError("You’re offline. Your rating is saved and will count when you’re back online.");
      else setResult(r.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const rated = chosen ?? result?.mine ?? null;
  const shown = hover ?? rated ?? 0;
  const r = rated ? result?.results : null;
  return (
    <div className="flex flex-col gap-3">
      <fieldset>
        <legend className="mb-3 text-lg font-semibold">{card.prompt}</legend>
        <div className="flex justify-center gap-1.5" onMouseLeave={() => setHover(null)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => choose(n)}
              onMouseEnter={() => setHover(n)}
              aria-pressed={rated === n}
              aria-label={`${n} ${n === 1 ? "star" : "stars"}${n === 1 && card.lowLabel ? `: ${card.lowLabel}` : ""}${n === 5 && card.highLabel ? `: ${card.highLabel}` : ""}`}
              className="grid size-12 place-items-center rounded-full transition-transform hover:scale-110 active:scale-95"
            >
              <svg
                // Re-keyed on each rating so the stars spring again, one after another.
                key={`${n}:${rated ?? 0}`}
                viewBox="0 0 24 24"
                className={cx("size-10", Boolean(rated) && n <= (rated ?? 0) && "fx-star")}
                style={rated && n <= rated ? { animationDelay: `${(n - 1) * 60}ms` } : undefined}
                aria-hidden
              >
                <path
                  d={STAR}
                  fill={n <= shown ? "#ffc72c" : "none"}
                  stroke={n <= shown ? "#D99A00" : "currentColor"}
                  strokeOpacity={n <= shown ? 1 : 0.35}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ))}
        </div>
        {(card.lowLabel || card.highLabel) && (
          <div className="mx-auto mt-1 flex max-w-[17rem] justify-between text-xs font-semibold text-ink-muted">
            <span>{card.lowLabel}</span>
            <span>{card.highLabel}</span>
          </div>
        )}
      </fieldset>

      {r && (
        <div className="rounded-2xl bg-muted p-3">
          <p className="flex items-baseline gap-2">
            <span className="font-mulish text-2xl font-extrabold">{r.average.toFixed(1)}</span>
            <span className="text-sm text-ink-muted">
              average from {r.total} {r.total === 1 ? "person" : "people"}
            </span>
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {[5, 4, 3, 2, 1].map((s) => {
              const n = r.counts[s - 1];
              const pct = r.total ? Math.round((n / r.total) * 100) : 0;
              return (
                <li key={s} className="flex items-center gap-2 text-xs">
                  <span className="w-5 font-semibold tabular-nums">{s}★</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                    <span className={cx("fx-grow block h-full rounded-full", s === rated ? "bg-action" : "bg-[#ffc72c]")} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-8 text-right tabular-nums text-ink-muted">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="text-sm text-ink-muted" role="status">
        {error ??
          (rated
            ? count
              ? "Thanks. You can change your rating."
              : "Preview: your rating isn’t counted."
            : "Tap a star. You’ll see how others rated after you do.")}
      </p>
    </div>
  );
}

/**
  Card changes as a deck of cards: forward, the card flies off to the left and the next one rises
  from the stack; back, it returns. Uses View Transitions where the browser has them, and skips
  the animation when the person has asked for reduced motion.
*/
function withDeck(direction: "forward" | "back", update: () => void) {
  if (typeof document === "undefined" || !document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.deck = direction;
  const t = document.startViewTransition(() => flushSync(update));
  // A skipped animation (another card change started, or the tab is hidden) is fine: the card still changes.
  t.ready.catch(() => {});
  t.finished.catch(() => {}).finally(() => delete root.dataset.deck);
}

type WallPost = { id: number; text: string; by: string | null; at: string; edited: boolean; likes: number; liked: boolean; mine: boolean; canHide: boolean };
type WallView = { prompt: string; anonymous: boolean; total: number; mine: WallPost | null; posts: WallPost[]; open: boolean };

const ago = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 14 ? `${d} day${d === 1 ? "" : "s"} ago` : formatDate(iso);
};

/** An insight wall: post your answer, then see what everyone else shared before you. */
function Wall({
  card,
  slug,
  count,
  posted,
  onPosted,
  tinted = false,
}: {
  card: Extract<Card, { type: "wall" }>;
  slug: string;
  count: boolean;
  posted: boolean;
  onPosted: () => void;
  /** On a coloured background: notes take the card's text colour, and posts are white cards with dark text. */
  tinted?: boolean;
}) {
  const note = tinted ? "opacity-85" : "text-ink-muted";
  const [wall, setWall] = useState<WallView | null>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPost, setPreviewPost] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<WallView>(`/api/walls?lesson=${encodeURIComponent(slug)}&card=${encodeURIComponent(card.id)}`).then(
      (w) => {
        if (!live) return;
        setWall(w);
        if (w.mine && !posted) onPosted();
      },
      () => {},
    );
    return () => {
      live = false;
    };
    // Load once per card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, card.id]);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      if (body.action === "post") {
        // A post can wait for a connection; seeing everyone else's needs one.
        const r = await sendOrQueue<WallView>("/api/walls", body, { label: `Insight wall post: “${card.prompt}”` });
        if (r.queued) {
          setError("You’re offline. Your post is saved and will be shared when you’re back online, and you’ll see everyone else’s then.");
          return true;
        }
        setWall(r.data);
        return true;
      }
      setWall(await api<WallView>("/api/walls", { body }));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function post() {
    if (!count) {
      // Previews show the wall without adding to it.
      setPreviewPost(text.trim());
      setEditing(false);
      onPosted();
      return;
    }
    if (await send({ action: "post", lesson: slug, card: card.id, text })) {
      setEditing(false);
      onPosted();
    }
  }

  const mine =
    wall?.mine ??
    (previewPost
      ? { id: 0, text: previewPost, by: "You", at: new Date().toISOString(), edited: false, likes: 0, liked: false, mine: true, canHide: false }
      : null);
  const showForm = !mine || editing;
  const others = wall?.posts ?? [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg font-semibold leading-snug">{card.prompt}</p>
      {showForm ? (
        <>
          <textarea
            rows={3}
            maxLength={600}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={card.placeholder ?? "Share your idea"}
            aria-label={card.prompt}
            className="rounded-2xl border border-line-strong bg-surface p-3 text-[1.05rem] text-ink [text-shadow:none] placeholder:text-ink-muted/70"
          />
          <p className={cx("text-sm", note)}>
            Others on this course will see what you post{card.anonymous ? ", without your name" : " with your first name and role"}. Leave out client names and
            details.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={post}
              disabled={busy || text.trim().length < 3}
              className={cx(
                "inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-semibold disabled:opacity-45",
                tinted ? "bg-white text-[#0a1a2e] shadow-md hover:bg-white/90" : "bg-action text-on-action hover:bg-action-hover",
              )}
            >
              <Icon name="chat" className="size-4" /> {busy ? "Posting…" : editing ? "Save" : "Post to the wall"}
            </button>
            {editing && (
              <button type="button" className={cx("min-h-11 px-3 font-medium", note)} onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
          {!mine && wall && wall.total > 0 && (
            <div className="relative overflow-hidden rounded-2xl" aria-hidden>
              <div className="flex flex-col gap-2 blur-[5px] select-none">
                {[0, 1].map((i) => (
                  <div key={i} className="rounded-2xl bg-surface p-3 text-sm text-ink [text-shadow:none]">
                    Someone shared an idea here that you’ll be able to read after you post yours.
                  </div>
                ))}
              </div>
            </div>
          )}
          {!mine && wall && (
            <p className="text-sm font-semibold text-accent">
              {wall.total ? `${wall.total} ${wall.total === 1 ? "person has" : "people have"} shared. Post yours to see theirs.` : "Be the first to share."}
            </p>
          )}
        </>
      ) : (
        <div className="rounded-2xl border-2 border-action/40 bg-tealtint p-3 text-ink [text-shadow:none]">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Your post</p>
            <button
              type="button"
              className="min-h-9 px-2 text-sm font-semibold text-accent"
              onClick={() => {
                setText(mine!.text);
                setEditing(true);
              }}
            >
              Edit
            </button>
          </div>
          <p className="mt-1 whitespace-pre-line">{mine!.text}</p>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-2xl bg-orange/10 p-3 text-sm">
          {error}
        </p>
      )}

      {(mine || wall?.open) && (
        <section aria-label="What others shared" className="flex flex-col gap-2">
          <p className={cx("mt-1 font-mulish text-xs font-extrabold uppercase tracking-[0.12em]", note)}>
            What others shared {others.length > 0 && `· ${others.length}`}
          </p>
          {!others.length && <p className={cx("text-sm", note)}>You’re the first. Come back later to see what others add.</p>}
          <ul className="flex flex-col gap-2">
            {others.map((p) => (
              <li key={p.id} className={cx("rounded-2xl p-3 text-ink [text-shadow:none]", tinted ? "bg-surface shadow-sm" : "bg-muted")}>
                <p className="whitespace-pre-line">{p.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                  {p.by && <span className="font-semibold text-ink">{p.by}</span>}
                  <span>
                    {ago(p.at)}
                    {p.edited && " · edited"}
                  </span>
                  <button
                    type="button"
                    aria-pressed={p.liked}
                    disabled={busy || !count}
                    onClick={() => send({ action: p.liked ? "unlike" : "like", post: p.id })}
                    className={cx(
                      "ml-auto inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 font-semibold",
                      p.liked ? "bg-action text-on-action" : "bg-surface text-ink ring-1 ring-line hover:bg-tealtint",
                    )}
                  >
                    <Icon name="heart" className="size-3.5" /> Helpful{p.likes ? ` · ${p.likes}` : ""}
                  </button>
                  {p.canHide && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () =>
                        (await confirmAction("It stays on record but nobody sees it on the wall.", {
                          title: "Hide this post?",
                          confirmLabel: "Hide",
                          danger: true,
                        })) && send({ action: "hide", post: p.id })
                      }
                      className="inline-flex min-h-9 items-center rounded-full px-2 font-semibold text-ink-muted hover:text-ink"
                    >
                      Hide
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
