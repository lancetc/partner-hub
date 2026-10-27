"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FollowUpContent } from "@/content/followups";
import { api, durationLabel, formatWhen, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { CardVisual } from "./CardVisual";
import { Narration } from "./Narration";
import { Frame, type SaveState } from "./Frame";

type View = {
  id: number;
  lessonHref: string | null;
  status: "available" | "in_progress" | "completed" | "upcoming" | "waiting" | "paused" | "withdrawn";
  pathName: string;
  stepNumber: number;
  stepCount: number;
  completionRule: "response_and_feedback" | "pass";
  required: boolean;
  plannedRelease: string | null;
  withdrawnReason: string | null;
  content?: FollowUpContent;
  progress: { card: number };
  attempt: { initial: string; initialCorrect: boolean; feedbackShown: boolean; corrected: string | null; correctedCorrect: boolean | null } | null;
  feedbackViewed: boolean;
  completedAt: string | null;
  next: { title: string; plannedRelease: string | null; waiting: boolean; durationSec: number } | null;
  timezone: string;
};

/**
  A short follow up in the existing card layout: question first, then feedback and an
  optional explanation, then one practical takeaway. Every step is saved on the server.
*/
export function FollowUpPlayer({ id }: { id: string }) {
  const { data: view, error, setData } = useApi<View>(`/api/follow-ups/${id}`);
  const [card, setCard] = useState<number | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [save, setSave] = useState<SaveState>("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [justFinished, setJustFinished] = useState(false);
  const lastAction = useRef<(() => Promise<void>) | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const content = view?.content;
  const beats = content?.explain ? ["Question", "Explain", "Takeaway"] : ["Question", "Takeaway"];
  const revisit = view?.status === "completed" && !justFinished;
  const current = card ?? (revisit ? 0 : Math.min(view?.progress.card ?? 0, beats.length - 1));

  useEffect(() => {
    headingRef.current?.focus();
  }, [current, view?.status]);

  // Opening an available follow up records the start once.
  useEffect(() => {
    if (view?.status === "available") void post({ action: "start" }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.status]);

  async function post(payload: Record<string, unknown>, track = true) {
    const run = async () => {
      if (track) setSave("saving");
      try {
        const next = await api<View>(`/api/follow-ups/${id}`, { body: payload });
        setData(next);
        if (track) setSave("saved");
        setActionError(null);
      } catch (e) {
        if (track) setSave("error");
        setActionError((e as Error).message);
        throw e;
      }
    };
    lastAction.current = run;
    return run();
  }

  if (error) {
    return (
      <Frame title="Follow up" beats={[]} saveState="idle" progress={null}>
        <Message icon="alert" heading="We couldn’t open this follow up" text={error} />
      </Frame>
    );
  }
  if (view?.lessonHref) {
    // Short lessons in a learning sequence play in the lesson player.
    window.location.replace(view.lessonHref);
  }
  if (!view || view.lessonHref) {
    return (
      <Frame title="Follow up" beats={[]} saveState="idle" progress={null}>
        <p role="status" className="py-8 text-ink-muted">
          Loading your follow up…
        </p>
      </Frame>
    );
  }

  if (!content || ["upcoming", "waiting", "paused", "withdrawn"].includes(view.status)) {
    const text =
      view.status === "withdrawn"
        ? `This follow up has been withdrawn. ${view.withdrawnReason ?? ""} Your earlier answers are kept.`
        : view.status === "waiting"
          ? "Waiting for the previous activity. It becomes available after you finish the one before it."
          : view.status === "paused"
            ? "This learning path is paused for now. Anything already released is still available."
            : `Available ${view.plannedRelease ? formatWhen(view.plannedRelease, view.timezone) : "soon"}.`;
    return (
      <Frame title="Follow up" beats={[]} saveState="idle" progress={null}>
        <Message
          icon={view.status === "withdrawn" ? "info" : "clock"}
          heading={view.status === "withdrawn" ? "No longer needed" : "Not available yet"}
          text={text}
        />
      </Frame>
    );
  }

  const options = content.question.options;
  const a = view.attempt;
  const answered = Boolean(a);
  const latestPick = a ? (a.corrected ?? a.initial) : null;
  const latestCorrect = a ? (a.corrected ? a.correctedCorrect : a.initialCorrect) : null;
  const showFeedback = answered && !retrying;
  const goTo = (n: number) => {
    setCard(n);
    if (!revisit) void post({ action: "progress", card: n }).catch(() => {});
  };

  async function onPrimary() {
    if (!view || !content) return;
    if (current === 0) {
      if (!answered || retrying) {
        if (!choice) return;
        await post({ action: "answer", optionId: choice, phase: answered ? "corrected" : "initial" }).then(
          () => requestAnimationFrame(() => document.getElementById("fu-feedback")?.scrollIntoView({ block: "nearest", behavior: "smooth" })),
          () => {},
        );
        setRetrying(false);
        return;
      }
      if (!view.feedbackViewed && !revisit) await post({ action: "feedback_viewed" }).catch(() => {});
      goTo(1);
      return;
    }
    if (current < beats.length - 1) return goTo(current + 1);
    if (revisit) return;
    await post({ action: "complete" }).then(
      () => setJustFinished(true),
      () => {},
    );
  }

  // Shown only after the server confirms completion.
  const finished = justFinished && view.status === "completed";
  const isLast = current === beats.length - 1;
  // Explanation audio plays from the footer dock so it doesn't push the card down.
  const explainAudio = content.explain && current === 1 ? content.explain.script : undefined;
  const primaryLabel = current === 0 ? (!answered || retrying ? "Check your answer" : "Continue") : isLast ? (revisit ? null : "Finish") : "Continue";

  return (
    <Frame
      title={`Follow up: ${content.title}`}
      beats={beats}
      saveState={revisit ? "idle" : save}
      onRetry={() => lastAction.current?.().catch(() => {})}
      progress={finished ? { beat: beats.length, done: true } : { beat: current, done: false }}
      review={revisit}
      footer={
        finished ? undefined : (
          <div className="flex flex-col gap-2">
            {actionError && save === "error" && (
              <p role="alert" className="flex items-start gap-2 rounded-2xl border border-danger/60 px-3 py-2 text-sm">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-danger" />
                {actionError.startsWith("Request failed") || actionError === "Failed to fetch"
                  ? "We couldn’t save that, so nothing has been marked done. Check your connection and try again."
                  : actionError}
              </p>
            )}
            <div id="fu-caption" />
            <div className="flex items-center gap-3">
              {current > 0 && (
                <button
                  type="button"
                  onClick={() => setCard(current - 1)}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line-strong px-4 font-medium hover:bg-muted"
                >
                  <Icon name="arrow-left" className="size-4" /> Back
                </button>
              )}
              {current === 0 && answered && !retrying && !revisit && latestCorrect === false && (
                <button
                  type="button"
                  onClick={() => {
                    setRetrying(true);
                    setChoice(null);
                  }}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line-strong px-4 font-medium hover:bg-muted"
                >
                  Try again
                </button>
              )}
              {explainAudio && (
                <span className="flex flex-1 justify-center">
                  <Narration
                    key="explain"
                    text={explainAudio}
                    label="Explanation"
                    audioSrc={content.explain?.audioSrc}
                    captionTarget="fu-caption"
                    ttsKey={`followup:${content.id}:${content.version}`}
                  />
                </span>
              )}
              {primaryLabel ? (
                <button
                  type="button"
                  onClick={onPrimary}
                  disabled={save === "saving" || (current === 0 && (!answered || retrying) && !choice)}
                  className={cx(
                    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:opacity-45 sm:px-6 sm:text-lg",
                    explainAudio ? "" : "ml-auto flex-1 text-lg sm:flex-none",
                  )}
                >
                  {save === "saving" && isLast ? "Saving…" : primaryLabel}
                  {!isLast && <Icon name="arrow-right" className="size-5" />}
                </button>
              ) : (
                <Link href="/learning" className="ml-auto inline-flex min-h-12 items-center rounded-full bg-action px-6 text-lg font-semibold text-on-action">
                  Back to learning
                </Link>
              )}
            </div>
          </div>
        )
      }
    >
      {finished ? (
        <div className="animate-card-in flex flex-col gap-5 py-6">
          <span className="inline-flex size-16 items-center justify-center rounded-full bg-tealtint text-accent">
            <Icon name="check" className="size-8" />
          </span>
          <h2 ref={headingRef} tabIndex={-1} className="font-serif text-[2rem] font-semibold leading-tight outline-none">
            Follow up done
          </h2>
          <p className="text-lg">
            Saved. {a && !a.initialCorrect ? "You worked through the feedback, which is exactly what practice is for." : "Nicely applied."}
          </p>
          <NextUp view={view} />
          <Link href="/learning" className="inline-flex min-h-12 items-center justify-center rounded-full bg-action px-6 text-lg font-semibold text-on-action">
            Back to learning
          </Link>
        </div>
      ) : (
        <div key={current} className="animate-card-in flex flex-col gap-4">
          {current === 0 && (
            <>
              <CardVisual visual={content.question.visual} className="aspect-[16/10]" />
              <CardHeading refEl={headingRef} label={`${content.question.label} · ${durationLabel(content.durationSec)}`} heading={content.question.heading} />
              <p className="text-lg leading-relaxed">{content.question.body}</p>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 font-semibold">{content.question.prompt}</legend>
                {options.map((o) => {
                  const picked = showFeedback ? latestPick === o.id : choice === o.id;
                  const lockedOut = showFeedback;
                  return (
                    <label
                      key={o.id}
                      className={cx(
                        "flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 py-3",
                        picked ? "border-action bg-tealtint" : "border-line",
                        !lockedOut && "cursor-pointer hover:border-line-strong",
                      )}
                    >
                      <input
                        type="radio"
                        name="fu-option"
                        value={o.id}
                        checked={picked}
                        disabled={lockedOut || revisit}
                        onChange={() => setChoice(o.id)}
                        className="size-5 shrink-0 accent-[var(--action)]"
                      />
                      <span className="leading-snug">{o.label}</span>
                    </label>
                  );
                })}
              </fieldset>
              {showFeedback && latestPick && <Feedback option={options.find((o) => o.id === latestPick)!} best={options.find((o) => o.correct)!} />}
              {showFeedback && a && a.corrected && (
                <p className="text-sm text-ink-muted">Your first answer is kept as you gave it. Answers after feedback are recorded separately.</p>
              )}
            </>
          )}

          {content.explain && current === 1 && (
            <>
              <CardHeading refEl={headingRef} label="Explain" heading={content.explain.heading} />
              <p className="text-lg leading-relaxed">{content.explain.body}</p>
            </>
          )}

          {isLast && (
            <>
              <CardHeading refEl={headingRef} label="Takeaway" heading="One thing to remember" />
              <div className="rounded-2xl bg-tealtint p-4">
                <p className="text-lg font-semibold leading-snug">{content.takeaway.action}</p>
              </div>
              {content.takeaway.reference && (
                <Link
                  href={content.takeaway.reference.url}
                  className="flex min-h-14 items-center gap-3 rounded-2xl border border-line px-4 py-3 hover:bg-muted"
                >
                  <Icon name="doc" className="size-5 shrink-0 text-accent" />
                  <span className="flex-1">
                    <span className="block font-semibold">{content.takeaway.reference.title}</span>
                    <span className="block text-sm text-ink-muted">{content.takeaway.reference.issuer}</span>
                  </span>
                </Link>
              )}
              <NextUp view={view} />
              {content.draftWording && (
                <p className="text-sm text-ink-muted">Draft operational wording for the prototype. The real process needs approval from its Trilogy owner.</p>
              )}
            </>
          )}
        </div>
      )}
    </Frame>
  );
}

function CardHeading({ label, heading, refEl }: { label: string; heading: string; refEl: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <div>
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{label}</p>
      <h2 ref={refEl} tabIndex={-1} className="mt-2 font-serif text-[1.85rem] font-semibold leading-[1.12] tracking-tight outline-none sm:text-[2.1rem]">
        {heading}
      </h2>
    </div>
  );
}

function Feedback({ option, best }: { option: FollowUpContent["question"]["options"][number]; best: FollowUpContent["question"]["options"][number] }) {
  return (
    <div id="fu-feedback" role="status" className={cx("flex gap-3 rounded-2xl px-4 py-3", option.correct ? "bg-tealtint" : "border-2 border-warm/60")}>
      <Icon name={option.correct ? "check" : "info"} className={cx("mt-0.5 size-5 shrink-0", option.correct ? "text-accent" : "text-warm")} />
      <div className="text-[0.98rem]">
        <p className="font-semibold">{option.correct ? "That’s the better choice." : "Here’s what would happen."}</p>
        <p className="mt-1">{option.feedback}</p>
        {!option.correct && <p className="mt-2 text-ink-muted">Have another go, or continue to see the explanation. A better choice: “{best.label}”.</p>}
      </div>
    </div>
  );
}

function NextUp({ view }: { view: { next: View["next"]; timezone: string } }) {
  if (!view.next)
    return <p className="rounded-2xl border border-line p-4">This was the last follow up in this path. The original lesson stays available any time.</p>;
  return (
    <p className="flex gap-3 rounded-2xl border border-line p-4">
      <Icon name="clock" className="mt-0.5 size-5 shrink-0 text-accent" />
      <span>
        <strong>Next: {view.next.title}.</strong>{" "}
        {view.next.waiting
          ? "It unlocks after you finish this one."
          : view.next.plannedRelease
            ? `Expected ${formatWhen(view.next.plannedRelease, view.timezone)}, ${durationLabel(view.next.durationSec).toLowerCase()}.`
            : ""}
      </span>
    </p>
  );
}

function Message({ icon, heading, text }: { icon: "alert" | "clock" | "info"; heading: string; text: string }) {
  return (
    <div className="flex flex-col gap-4 py-6">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-muted">
        <Icon name={icon} className="size-7 text-accent" />
      </span>
      <h1 className="font-serif text-3xl font-semibold">{heading}</h1>
      <p className="text-lg">{text}</p>
      <Link href="/learning" className="inline-flex min-h-12 items-center justify-center rounded-full bg-action px-6 text-lg font-semibold text-on-action">
        Back to learning
      </Link>
    </div>
  );
}
