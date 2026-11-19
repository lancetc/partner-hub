"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { cx } from "@/lib/format";
import {
  CALLOUTS,
  EMBED_NAME,
  VERDICTS,
  embedSrc,
  videoOf,
  type AccordionBlock,
  type CarouselBlock,
  type VideoEmbed,
  type Block,
  type CalloutBlock,
  type ChecklistBlock,
  type DecisionBlock,
  type Media,
  type Verdict,
} from "@/lib/magazine";
import { RichText } from "../RichText";
import { InteractiveBlock, type InteractiveContext } from "./InteractiveBlocks";
import { Icon, type IconName } from "../Icon";
import { Burst } from "../player/Burst";
// The same press, pop, glow and shake as answers in Topics.
import "../player/fx.css";

/*
  The Magazine blocks as readers see them, drawn from the checked guide document (lib/magazine): never
  HTML from the guide. Authors' notes, sources and flags aren't shown here. Text blocks sit in the
  reading column; wide pictures use the full width of the page column.
*/

export type QuizState = {
  pathId: string;
  pathName: string;
  passed: boolean;
  available: boolean;
  passMark: number | null;
} | null;

export type BlockContext = InteractiveContext & {
  answer: (blockId: string, choiceId: string) => Promise<void>;
  quizzes: Record<string, QuizState>;
};

/** The reading column: a comfortable line length for article text. */
export const column = "mx-auto w-full max-w-[42rem]";

export function GuideBlock({ block: b, ctx }: { block: Block; ctx: BlockContext }) {
  switch (b.type) {
    case "text":
      return (
        <div className={column}>
          {b.heading &&
            (b.level === 3 ? <h4 className="mb-2 text-lg font-bold">{b.heading}</h4> : <h3 className="mb-3 font-serif text-2xl font-semibold">{b.heading}</h3>)}
          <RichText text={b.body} className="text-[1.08rem] leading-relaxed" />
        </div>
      );
    case "accordion":
      return <Accordion block={b} ctx={ctx} />;
    case "carousel":
      return <Carousel block={b} ctx={ctx} />;
    case "image":
      return (
        <figure className={cx(b.width === "column" ? column : "w-full", b.width === "full" && "lg:-mx-4")}>
          <Picture media={b.media} enlarge={b.enlarge} className="w-full rounded-2xl" />
          {b.media.caption && <figcaption className={cx("mt-2 text-sm text-ink-muted", b.width !== "column" && column)}>{b.media.caption}</figcaption>}
        </figure>
      );
    case "video":
      return <Video block={b} ctx={ctx} />;
    case "textMedia": {
      // Its video, when it has one instead of a picture.
      const vid = videoOf(b);
      // Text flowing around the picture: the picture comes first so the text can wrap round it.
      if (b.wrap !== false)
        return (
          <div className={cx(column, "flow-root")}>
            {b.heading && <h3 className="mb-3 font-serif text-2xl font-semibold">{b.heading}</h3>}
            {vid ? (
              <Video
                block={vid}
                ctx={ctx}
                className={cx("mb-4 md:mb-3 md:w-[45%]", b.layout === "media-left" ? "md:float-left md:mr-6" : "md:float-right md:ml-6")}
              />
            ) : (
              <figure className={cx("mb-4 md:mb-3 md:w-[45%]", b.layout === "media-left" ? "md:float-left md:mr-6" : "md:float-right md:ml-6")}>
                <Picture media={b.media} enlarge={b.enlarge} className="w-full rounded-2xl" />
                {b.media.caption && <figcaption className="mt-2 text-sm text-ink-muted">{b.media.caption}</figcaption>}
              </figure>
            )}
            <RichText text={b.body} className="block! text-[1.08rem] leading-relaxed [&>*+*]:mt-3 [&_ol]:flow-root [&_ul]:flow-root" />
          </div>
        );
      return (
        <div className="grid items-center gap-6 md:grid-cols-2 md:gap-10">
          {/* Text first in reading order; on a wide screen the picture can sit on either side. */}
          <div>
            {b.heading && <h3 className="mb-3 font-serif text-2xl font-semibold">{b.heading}</h3>}
            <RichText text={b.body} className="text-[1.08rem] leading-relaxed" />
          </div>
          {vid ? (
            <Video block={vid} ctx={ctx} className={cx(b.layout === "media-left" && "md:order-first")} />
          ) : (
            <figure className={cx(b.layout === "media-left" && "md:order-first")}>
              <Picture media={b.media} enlarge={b.enlarge} className="w-full rounded-2xl" />
              {b.media.caption && <figcaption className="mt-2 text-sm text-ink-muted">{b.media.caption}</figcaption>}
            </figure>
          )}
        </div>
      );
    }
    case "callout":
      return <Callout block={b} ctx={ctx} />;
    case "decision":
      return <Decision block={b} ctx={ctx} />;
    case "quiz":
      return <Quiz intro={b.intro} quiz={ctx.quizzes[b.id] ?? null} />;
    case "checklist":
      return <Checklist block={b} ctx={ctx} />;
    default:
      return <InteractiveBlock block={b} ctx={ctx} />;
  }
}

/** Text in folds: open one to read it. Built on the browser's own disclosure, so it works by keyboard and with a screen reader. */
function Accordion({ block: b, ctx }: { block: AccordionBlock; ctx: BlockContext }) {
  // Every fold opened at least once counts as done.
  const opened = useRef(new Set<string>());
  return (
    <div className={column}>
      {b.heading && <h3 className="mb-3 font-serif text-2xl font-semibold">{b.heading}</h3>}
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {b.items.map((it) => (
          <details
            key={it.id}
            className="mag-reveal-item group"
            onToggle={(e) => {
              if (!e.currentTarget.open) return;
              opened.current.add(it.id);
              if (b.items.every((x) => opened.current.has(x.id))) ctx.engaged(b.id);
            }}
          >
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-semibold hover:bg-muted [&::-webkit-details-marker]:hidden">
              {it.title}
              <Icon name="chevron-down" className="size-5 shrink-0 text-accent transition-transform group-open:rotate-180" />
            </summary>
            <FoldBody item={it} />
          </details>
        ))}
      </div>
    </div>
  );
}

/** Inside an open fold: its text, with its picture above, below, or on the right with the text flowing round it. */
function FoldBody({ item: it }: { item: AccordionBlock["items"][number] }) {
  const figure = it.media && (
    <figure className={cx(it.placement === "right" ? "mb-3 md:float-right md:mb-2 md:ml-5 md:w-[40%]" : it.placement === "above" ? "mb-4" : "mt-4")}>
      <Picture media={it.media} className="w-full rounded-xl" />
      {it.media.caption && <figcaption className="mt-1.5 text-sm text-ink-muted">{it.media.caption}</figcaption>}
    </figure>
  );
  return (
    <div className="flow-root px-5 pb-5">
      {it.placement !== "below" && figure}
      <RichText text={it.body} className="block! text-[1.05rem] leading-relaxed [&>*+*]:mt-3 [&_ol]:flow-root [&_ul]:flow-root" />
      {it.placement === "below" && figure}
    </div>
  );
}

/**
  Pictures one at a time: Previous and Next, the arrow keys, or a dot for each. It never moves by itself,
  says which picture is showing, and keeps each picture's description and caption.
*/
function Carousel({ block: b, ctx }: { block: CarouselBlock; ctx: BlockContext }) {
  const slides = b.slides.filter((sl) => sl.media.src);
  const [at, setAt] = useState(0);
  // Every picture seen counts as done; the first shows to start with.
  const seen = useRef(new Set<number>([0]));
  if (!slides.length) return null;
  const i = Math.min(at, slides.length - 1);
  const go = (n: number) => {
    const to = (n + slides.length) % slides.length;
    seen.current.add(to);
    if (seen.current.size >= slides.length) ctx.engaged(b.id);
    setAt(to);
  };
  const slide = slides[i].media;
  return (
    <figure
      role="region"
      aria-roledescription="carousel"
      aria-label={`${slides.length} pictures`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(i + 1);
        if (e.key === "ArrowLeft") go(i - 1);
      }}
      className={cx(b.width === "wide" ? "w-full" : column, "rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-focus")}
    >
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={slide.src} alt={slide.decorative ? "" : slide.alt} className="aspect-[16/10] w-full object-contain" />
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(i - 1)}
              aria-label="Previous picture"
              className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-surface/90 shadow hover:bg-surface"
            >
              <Icon name="arrow-left" className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => go(i + 1)}
              aria-label="Next picture"
              className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-surface/90 shadow hover:bg-surface"
            >
              <Icon name="arrow-right" className="size-5" />
            </button>
          </>
        )}
      </div>
      <figcaption className={cx("mt-3 flex flex-col gap-2", b.width === "wide" && column)} aria-live="polite">
        {slide.caption && <span className="text-[1rem] leading-snug">{slide.caption}</span>}
        <span className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold text-ink-muted">
            {i + 1} of {slides.length}
          </span>
          {slides.length > 1 && (
            <span className="flex gap-1.5" role="group" aria-label="Choose a picture">
              {slides.map((_, j) => (
                <button
                  key={j}
                  type="button"
                  onClick={() => go(j)}
                  aria-label={`Show picture ${j + 1}`}
                  aria-current={j === i ? "true" : undefined}
                  className={cx("size-3 rounded-full border-2 border-action", j === i ? "bg-action" : "bg-transparent hover:bg-tealtint")}
                />
              ))}
            </span>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

/** A picture with its description; "enlarge" opens it full size, for detail like an annotated document. */
function Picture({ media, enlarge, className }: { media: Media; enlarge?: boolean; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // A draft may not have its picture yet.
  if (!media.src) return null;
  const alt = media.decorative ? "" : media.alt;
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={media.src} alt={alt} loading="lazy" className={cx("bg-muted", className)} />;
  if (!enlarge) return img;
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="group relative block w-full cursor-zoom-in rounded-2xl text-left">
        {img}
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-surface/95 px-3 py-1.5 text-sm font-semibold shadow group-hover:bg-surface">
          <Icon name="expand" className="size-4" /> Enlarge
          <span className="sr-only"> the picture</span>
        </span>
      </button>
      <dialog
        ref={dialog}
        aria-label={alt || "Picture"}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        className="m-auto max-h-[95vh] w-[min(96vw,90rem)] max-w-none rounded-2xl bg-surface p-0 backdrop:bg-black/70"
      >
        <div className="flex justify-end p-2">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 font-semibold hover:bg-muted"
          >
            <Icon name="close" className="size-4" /> Close
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={media.src} alt={alt} className="h-auto w-full" />
      </dialog>
    </>
  );
}

/** A YouTube, Vimeo or Loom player: the video's own page in a frame, loaded when it scrolls near. */
export function EmbedPlayer({ embed, title }: { embed: VideoEmbed; title: string }) {
  return (
    <iframe
      src={embedSrc(embed)}
      title={`${title || "Video"} (${EMBED_NAME[embed.provider]})`}
      loading="lazy"
      allow="encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      className={cx("block w-full rounded-2xl bg-black", embed.portrait ? "mx-auto aspect-[9/16] max-w-sm" : "aspect-video")}
    />
  );
}

function Video({ block: b, ctx, className = column }: { block: Extract<Block, { type: "video" }>; ctx: BlockContext; className?: string }) {
  // Each is sent once a visit: started, half way, finished. Watching isn't counted as understanding.
  const sent = useRef(new Set<string>());
  const mark = (outcome: "started" | "half" | "finished") => {
    if (sent.current.has(outcome)) return;
    sent.current.add(outcome);
    ctx.activity(b.id, { outcome });
    if (outcome === "finished") ctx.engaged(b.id);
  };
  if (!b.embed && !b.src) return null;
  const start = b.trim?.start ?? 0;
  return (
    <figure className={className}>
      {/* Never plays by itself; captions on where the video has them. */}
      {b.embed ? (
        <EmbedPlayer embed={b.embed} title={b.title} />
      ) : (
        <video
          controls
          preload="metadata"
          poster={b.poster}
          className="w-full rounded-2xl bg-black"
          aria-label={b.title}
          onPlay={() => mark("started")}
          onEnded={() => mark("finished")}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            const end = b.trim?.end ?? v.duration;
            // A trimmed video stops at its end point.
            if (b.trim && v.currentTime >= b.trim.end) {
              v.pause();
              v.currentTime = b.trim.start;
              mark("finished");
            }
            if (Number.isFinite(end) && v.currentTime - start >= (end - start) / 2) mark("half");
          }}
        >
          <source src={b.trim ? `${b.src}#t=${b.trim.start},${b.trim.end}` : b.src} />
          {b.captions && <track kind="captions" src={b.captions} srcLang="en" label="English" default />}
        </video>
      )}
      <figcaption className="mt-2 text-sm text-ink-muted">
        <span className="font-semibold text-ink">{b.title}</span>
        {b.caption && <> · {b.caption}</>}
      </figcaption>
      {b.transcript && (
        <details className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-semibold">Read the transcript</summary>
          <RichText text={b.transcript} className="mt-3 text-ink-muted" />
        </details>
      )}
    </figure>
  );
}

const CALLOUT_LOOK: Record<CalloutBlock["style"], { icon: IconName; box: string; mark: string }> = {
  important: {
    icon: "alert",
    box: "border-[#c7393e] bg-[#fdf1f0] dark:bg-[#3a1f1f]",
    mark: "text-[#a12d31] dark:text-[#ffb4b0]",
  },
  example: {
    icon: "doc",
    box: "border-[#fab53d] bg-[#fff6e4] dark:bg-[#3a2f17]",
    mark: "text-[#8a5a00] dark:text-[#ffd48a]",
  },
  tip: {
    icon: "bulb",
    box: "border-[#008282] bg-tealtint",
    mark: "text-[#0f5b5b] dark:text-[#9fe3e3]",
  },
};

/** Set apart by a label and an icon as well as colour, so it reads the same without colour. */
function Callout({ block: b, ctx }: { block: CalloutBlock; ctx: BlockContext }) {
  const look = CALLOUT_LOOK[b.style];
  // A tick to confirm it: kept once given (an acknowledgement isn't taken back).
  const [ticked, setTicked] = useState(ctx.answers[`done:${b.id}`] === "1");
  // The celebration plays only at the moment of ticking, not on coming back to it.
  const [justTicked, setJustTicked] = useState(false);
  return (
    <aside className={cx(column, "rounded-2xl border-l-4 p-5", look.box)} aria-label={b.label ?? CALLOUTS[b.style]}>
      <p className={cx("mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.1em]", look.mark)}>
        <Icon name={look.icon} className="size-5" /> {b.label ?? CALLOUTS[b.style]}
      </p>
      <RichText text={b.body} className="leading-relaxed" />
      {b.link && (
        <Link href={b.link.href} className="mt-3 inline-flex items-center gap-1 font-semibold text-accent hover:underline">
          {b.link.label} <Icon name="arrow-right" className="size-4" />
        </Link>
      )}
      {b.confirm && (
        <label
          className={cx(
            "relative mt-4 flex items-start gap-3 rounded-xl border-2 bg-surface p-3 font-semibold transition-colors duration-300",
            ticked ? "border-[#2f8f5b] bg-[#f3fbf6] dark:bg-[#17301f]" : "cursor-pointer border-line-strong hover:border-action",
            justTicked && "mag-confirmed",
          )}
        >
          {justTicked && (
            // A little burst from the box: decoration only.
            <span aria-hidden className="mag-burst">
              {Array.from({ length: 12 }, (_, i) => {
                const angle = (i / 12) * Math.PI * 2;
                const reach = 34 + (i % 3) * 10;
                return (
                  <span
                    key={i}
                    style={
                      {
                        "--dx": `${Math.round(Math.cos(angle) * reach)}px`,
                        "--dy": `${Math.round(Math.sin(angle) * reach)}px`,
                        background: ["#008282", "#fab53d", "#2f8f5b", "#5fc9c9"][i % 4],
                      } as React.CSSProperties
                    }
                  />
                );
              })}
            </span>
          )}
          <input
            type="checkbox"
            className="relative mt-0.5 size-5 shrink-0 accent-[var(--color-action)]"
            checked={ticked}
            aria-readonly={ticked}
            onChange={(e) => {
              if (!e.target.checked || ticked) return;
              setTicked(true);
              setJustTicked(true);
              ctx.engaged(b.id);
            }}
          />
          <span>
            {b.confirm}
            {ticked && (
              <span className="mag-confirm-note mt-0.5 flex items-center gap-1 text-sm font-normal text-[#0f5b3a] dark:text-[#8fe0b5]" role="status">
                <Icon name="circle-check" className="size-4" /> Confirmed. Thank you.
              </span>
            )}
          </span>
        </label>
      )}
    </aside>
  );
}

const VERDICT_LOOK: Record<Verdict, { icon: IconName; box: string }> = {
  best: {
    icon: "circle-check",
    box: "border-[#2f8f5b] bg-[#e9f6ef] dark:bg-[#17301f]",
  },
  acceptable: {
    icon: "info",
    box: "border-[#fab53d] bg-[#fff6e4] dark:bg-[#3a2f17]",
  },
  risky: {
    icon: "alert",
    box: "border-[#c7393e] bg-[#fdf1f0] dark:bg-[#3a1f1f]",
  },
};

/**
  "What would you do?" in place: choose, check, read why. They can try another answer as often as they
  like: it's practice, not a test. Each answer is recorded against the edition they're reading.
*/
function Decision({ block: b, ctx }: { block: DecisionBlock; ctx: BlockContext }) {
  const name = useId();
  const saved = ctx.answers[b.id];
  const [picked, setPicked] = useState<string | null>(saved ?? null);
  const [checked, setChecked] = useState<string | null>(saved ?? null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const choice = b.choices.find((c) => c.id === checked);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked) return;
    setBusy(true);
    setProblem(null);
    try {
      await ctx.answer(b.id, picked);
      setChecked(picked);
      requestAnimationFrame(() => feedback.current?.focus());
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Your answer didn’t save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={check}
      className={cx(column, "rounded-3xl border border-[#c9d6ea] bg-[#eef3fa] p-5 shadow-sm sm:p-7 dark:border-[#2c3f5e] dark:bg-[#1b2a44]")}
    >
      {b.media?.src && b.mediaStyle === "wide" && (
        <Picture
          media={b.media}
          className="-mx-5 -mt-5 mb-5 aspect-[16/9] w-[calc(100%+2.5rem)] max-w-none rounded-t-[calc(1.5rem-1px)] object-cover sm:-mx-7 sm:-mt-7 sm:w-[calc(100%+3.5rem)]"
        />
      )}
      <fieldset disabled={busy}>
        <legend className="mb-1 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
          <Icon name="target" className="size-5" /> Your decision
        </legend>
        <div className="flow-root">
          {/* A person in the story, in a circle beside the question. */}
          {b.media?.src && b.mediaStyle !== "wide" && (
            <Picture media={b.media} className="float-right -mt-8 mb-2 ml-4 size-24 rounded-full object-cover shadow-md ring-4 ring-surface sm:size-32" />
          )}
          <p className="font-serif text-2xl font-semibold leading-snug">{b.prompt}</p>
          {b.context && <p className="mt-2 text-ink-muted">{b.context}</p>}
        </div>
        <div className="mt-5 flex flex-col gap-3">
          {b.choices.map((c) => (
            <label
              key={c.id}
              className={cx(
                "fx-press relative flex cursor-pointer items-start gap-3 rounded-2xl border p-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                picked === c.id ? "border-action bg-tealtint" : "border-line bg-surface hover:border-action",
                // Picked: a springy pop. Checked: a glow and burst for the best answer, a small shake otherwise (as in Topics).
                picked === c.id && (checked === c.id ? (c.verdict === "best" ? "fx-correct" : "fx-shake") : "fx-pop"),
              )}
            >
              <input
                type="radio"
                name={name}
                value={c.id}
                checked={picked === c.id}
                onChange={() => {
                  setPicked(c.id);
                  if (checked && checked !== c.id) setChecked(null);
                }}
                className="mt-1 size-5 shrink-0 accent-[var(--color-action)]"
              />
              <span>{c.text}</span>
              {checked === c.id && c.verdict === "best" && <Burst />}
            </label>
          ))}
        </div>
      </fieldset>
      {choice ? (
        <div ref={feedback} tabIndex={-1} role="status" className={cx("mt-5 rounded-2xl border-l-4 p-5 outline-none", VERDICT_LOOK[choice.verdict].box)}>
          <p className="flex items-center gap-2 font-bold">
            <Icon name={VERDICT_LOOK[choice.verdict].icon} className="size-5" /> {VERDICTS[choice.verdict]}
          </p>
          <p className="mt-2 leading-relaxed">{choice.feedback}</p>
          {b.source && (
            <p className="mt-3 text-sm">
              Source:{" "}
              {b.source.href ? (
                <Link href={b.source.href} className="font-semibold text-accent underline underline-offset-2">
                  {b.source.label}
                </Link>
              ) : (
                b.source.label
              )}
            </p>
          )}
          {choice.verdict !== "best" && <p className="mt-3 text-sm text-ink-muted">Choose another answer to see how it compares.</p>}
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!picked || busy}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:opacity-50"
          >
            {busy ? "Checking…" : "Check my answer"}
          </button>
          {problem && <p className="text-sm font-semibold text-danger">{problem}</p>}
        </div>
      )}
    </form>
  );
}

/** The Hub's own path quiz: its pass mark and retakes, its result in the usual reports. Nothing is scored here. */
function Quiz({ intro, quiz }: { intro?: string; quiz: QuizState }) {
  return (
    <div className={cx(column, "rounded-3xl border border-line-strong bg-surface p-5 sm:p-7")}>
      <p className="mb-1 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="clipboard" className="size-5" /> Quiz
      </p>
      {!quiz ? (
        <p className="text-ink-muted">This quiz isn’t available at the moment.</p>
      ) : (
        <>
          <p className="font-serif text-2xl font-semibold">{quiz.pathName}</p>
          {intro && <p className="mt-2 text-ink-muted">{intro}</p>}
          {quiz.passed ? (
            <p className="mt-4 flex items-center gap-2 font-semibold text-[#0f5b3a] dark:text-[#8fe0b5]">
              <Icon name="circle-check" className="size-5" /> You’ve passed this quiz.
            </p>
          ) : (
            <Link
              href={`/paths/${quiz.pathId}`}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
            >
              {quiz.available ? "Take the quiz" : "Open the learning path"} <Icon name="arrow-right" className="size-4" />
            </Link>
          )}
          {quiz.passMark != null && !quiz.passed && <p className="mt-2 text-sm text-ink-muted">Pass mark: {quiz.passMark}%.</p>}
        </>
      )}
    </div>
  );
}

/** A job aid: tick items off as you work (just on this page; it isn't an assessment), copy it or download it. */
const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
  Prints just the job aid, on a plain page in its own window: the title, each item with a box to tick
  (ticked ones as they are on screen), and its resource. Everything is escaped: no guide text runs as HTML.
*/
function printJobAid(b: ChecklistBlock, ticked: Set<number>) {
  const w = window.open("", "_blank", "popup,width=760,height=900");
  if (!w) {
    window.print();
    return;
  }
  const resource = b.resource ? new URL(b.resource.href, window.location.origin).href : null;
  w.document.write(`<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>${escapeHtml(b.title || "Job aid")}</title><style>
    @page { size: A4; margin: 18mm; }
    body { font: 13pt/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #102a43; margin: 0; }
    .eyebrow { font-size: 9pt; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: #006666; }
    h1 { font: 600 22pt/1.2 Georgia, serif; margin: 4px 0 18px; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid #d5e1e1; break-inside: avoid; }
    .box { flex: none; width: 16px; height: 16px; margin-top: 3px; border: 2px solid #102a43; border-radius: 3px; text-align: center; font-size: 12px; line-height: 14px; }
    .done span:last-child { color: #52606d; }
    .foot { margin-top: 18px; font-size: 10pt; color: #52606d; }
  </style></head><body>
    <p class="eyebrow">Trilogy Care · Job aid</p>
    <h1>${escapeHtml(b.title || "Job aid")}</h1>
    <ul>${b.items
      .map((item, i) => `<li class="${ticked.has(i) ? "done" : ""}"><span class="box">${ticked.has(i) ? "✓" : ""}</span><span>${escapeHtml(item)}</span></li>`)
      .join("")}</ul>
    ${resource ? `<p class="foot">${escapeHtml(b.resource!.label)}: ${escapeHtml(resource)}</p>` : ""}
    <p class="foot">Printed from the Partner Hub on ${escapeHtml(new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }))}.</p>
  </body></html>`);
  w.document.close();
  w.focus();
  // Print once it's drawn; the window closes itself afterwards.
  w.onafterprint = () => w.close();
  setTimeout(() => w.print(), 100);
}

function Checklist({ block: b, ctx }: { block: ChecklistBlock; ctx: BlockContext }) {
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const text = `${b.title}\n\n${b.items.map((i) => `[ ] ${i}`).join("\n")}\n`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `${b.title.replace(/[^\w\s-]/g, "").trim() || "checklist"}.txt`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section aria-label={b.title} className={cx(column, "relative rounded-3xl bg-[#008282] p-5 text-white sm:p-7")}>
      <button
        type="button"
        onClick={() => printJobAid(b, ticked)}
        aria-label={`Print ${b.title || "the job aid"}`}
        title="Print the job aid"
        className="absolute right-3 top-3 grid size-11 place-items-center rounded-full text-white hover:bg-white/15 sm:right-4 sm:top-4"
      >
        <Icon name="print" className="size-5" />
      </button>
      <p className="mb-1 flex items-center gap-2 pr-12 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-white">
        <Icon name="checklist" className="size-5" /> Job aid
      </p>
      <p className="font-serif text-2xl font-semibold">{b.title}</p>
      <ul className="mt-4 flex flex-col gap-2">
        {b.items.map((item, i) => (
          <li key={i} className="mag-reveal-item">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-white/10">
              <input
                type="checkbox"
                checked={ticked.has(i)}
                onChange={() => {
                  const next = new Set(ticked);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  // Every item ticked counts as done.
                  if (next.size === b.items.length) ctx.engaged(b.id);
                  setTicked(next);
                }}
                className="mt-1 size-5 shrink-0 accent-[#fab53d]"
              />
              <span className={cx(ticked.has(i) && "text-white/75")}>{item}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 font-semibold text-[#005f5f] hover:bg-[#e3f4f3]"
        >
          <Icon name="copy" className="size-4" /> {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={download}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/50 px-4 font-semibold hover:bg-white/10"
        >
          <Icon name="file" className="size-4" /> Download
        </button>
        {b.resource && (
          <Link
            href={b.resource.href}
            className="inline-flex min-h-11 items-center gap-1 px-2 font-semibold text-white underline underline-offset-4 hover:decoration-2"
          >
            {b.resource.label} <Icon name="arrow-right" className="size-4" />
          </Link>
        )}
      </div>
      <p className="mt-3 text-sm text-white/85" aria-live="polite">
        Ticks are just for you while you work; they aren’t saved.
      </p>
    </section>
  );
}
