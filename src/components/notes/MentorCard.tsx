"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { BADGES, NOTE_NOTICE, PHRASE_NOTE, RANKS, TOPICS } from "@/lib/notes";
import { EDITION_LABEL, FICTIONAL_NOTICE, PEER_NOTICE, STAGES, THEMES } from "@/lib/businessNotes";
import type { NoteCard } from "@/server/notes";
import { Icon } from "../Icon";

/*
  One oversized "Notes to a Younger Me" card (docs/notes-to-a-younger-me.md). The front is the moment; the back is
  the note. Both faces share one grid cell, so the card is as tall as its longer face and nothing is clipped. It
  turns in 3D; with reduced motion it simply switches. Only the visible face is in the accessibility tree and the
  tab order. The flip control sits outside the card's actions, so Helpful, Copy and Save are never inside it.
*/

export type CardView = NoteCard & { preview?: boolean };
export type GoneCard = { id: string; gone: true; why: string };

const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

function Corner({ c, flip, onDark }: { c: CardView; flip?: boolean; onDark?: boolean }) {
  return (
    <span aria-hidden className={cx("flex flex-col items-center leading-none", onDark ? "text-[#9fe3e0]" : "text-accent", flip && "rotate-180")}>
      <span className="font-serif text-2xl font-semibold">{c.data.rank}</span>
      <span className="mt-0.5 text-[0.65rem] font-extrabold tracking-[0.12em]">{c.data.badge}</span>
    </span>
  );
}

/** A card that's no longer available: withdrawn, or not shared with this reader. */
export function GoneNote({ c }: { c: GoneCard }) {
  return (
    <div className="mx-auto w-full max-w-[34rem] rounded-[1.75rem] border-2 border-dashed border-line-strong bg-bg p-6">
      <p className="font-semibold">This note isn’t available any more.</p>
      <p className="mt-1 text-sm text-ink-muted">{c.why}</p>
    </div>
  );
}

export function MentorCard({
  c,
  position,
  flipped,
  onFlip,
  think,
  instinct,
  onInstinct,
  preview,
  onChange,
  discussionHref,
}: {
  c: CardView;
  /** "Card 2 of 4", for the announcement and the front. */
  position: string;
  flipped: boolean;
  onFlip: (to: boolean) => void;
  /** "Think, then flip": ask for a first instinct before the note. */
  think?: boolean;
  instinct?: string;
  onInstinct?: (text: string) => void;
  /** The editor's preview: nothing is recorded. */
  preview?: boolean;
  onChange?: (c: CardView) => void;
  /** Where "Read discussion" goes for a business card: its canonical thread. */
  discussionHref?: string;
}) {
  const biz = c.data.business ?? null;
  const showDay = (d: string) =>
    d ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d)) : "";
  const [draft, setDraft] = useState(instinct ?? "");
  const [copied, setCopied] = useState<"" | "ok" | "failed">("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const frontHeading = useRef<HTMLHeadingElement>(null);
  const backHeading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    (flipped ? backHeading.current : frontHeading.current)?.focus();
  }, [flipped]);
  const turn = (to: boolean) => {
    moved.current = true;
    onFlip(to);
  };
  const act = async (body: Record<string, unknown>, then: (r: CardView) => void = () => undefined) => {
    if (preview || c.preview) return;
    setBusy(true);
    setProblem("");
    try {
      // A business card's votes and saves go through its own route, which records them for the business reports.
      then(await api<CardView>(biz ? "/api/business-notes" : "/api/mentor-notes", { body }));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.data.phrase);
      setCopied("ok");
      if (!preview && !c.preview) api("/api/mentor-notes", { body: { action: "use", event: "copied", noteId: c.id } }).catch(() => undefined);
    } catch {
      setCopied("failed");
    }
  };
  const recorded = !preview && !c.preview;

  return (
    <div className="mx-auto w-full max-w-[34rem]">
      <p className="sr-only" aria-live="polite">
        {position}, {flipped ? "note side" : "moment side"}
      </p>
      <div className="[perspective:1400px]">
        <div
          className={cx(
            "grid transition-transform duration-700 [transform-style:preserve-3d] motion-reduce:transition-none",
            flipped && "[transform:rotateY(180deg)]",
          )}
        >
          {/* The moment */}
          <section
            aria-labelledby={`f-${c.id}`}
            inert={flipped}
            aria-hidden={flipped}
            className={cx(
              "relative flex min-h-[26rem] flex-col rounded-[1.75rem] bg-[#0f3f45] p-6 text-white shadow-xl ring-1 ring-black/10 [backface-visibility:hidden] [grid-area:1/1] sm:p-8",
              biz && "border-t-[10px] border-[#e0a63a]",
            )}
          >
            <div className="flex items-start justify-between">
              <Corner c={c} onDark />
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{position}</span>
            </div>
            <p className="sr-only">
              {BADGES[c.data.badge]} · {c.data.rank} · {RANKS[c.data.rank]}
            </p>
            {biz && (
              <p className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className="rounded-full bg-[#e0a63a] px-2.5 py-1 text-[#2b1d00]">
                  {EDITION_LABEL}
                  {biz.number ? ` · No. ${String(biz.number).padStart(2, "0")}` : ""}
                </span>
                <span className="rounded-full bg-white/15 px-2.5 py-1">Principals only</span>
              </p>
            )}
            {biz && c.data.illustrative && (
              <p className="mt-3 rounded-xl bg-[#fff1cc] px-3 py-2 text-sm font-semibold text-[#4a3400]">
                <Icon name="info" className="mr-1 inline size-4" />
                {FICTIONAL_NOTICE}
              </p>
            )}
            <p className={cx(biz ? "mt-4" : "mt-6", "text-xs font-extrabold uppercase tracking-[0.14em] text-[#9fe3e0]")}>The moment</p>
            <h4 id={`f-${c.id}`} ref={frontHeading} tabIndex={-1} className="mt-2 font-serif text-2xl font-semibold leading-snug outline-none sm:text-3xl">
              {c.data.hook}
            </h4>
            <p className="mt-4 text-lg leading-relaxed text-white/90">{c.data.scenario}</p>
            {biz && (
              <>
                <p className="mt-3 text-sm text-white/80">{[STAGES[biz.stage], biz.era, biz.context].filter(Boolean).join(" · ")}</p>
                {biz.choice && (
                  <p className="mt-4 rounded-2xl bg-white/10 p-3">
                    <span className="font-semibold text-[#9fe3e0]">Before you flip: </span>
                    {biz.choice}
                  </p>
                )}
              </>
            )}
            <p className="mt-4 text-xs text-white/70">
              {biz ? THEMES[biz.theme] : c.data.topics.map((t) => TOPICS[t]).join(" · ")}
              {c.data.illustrative && !biz && " · Illustrative card"}
            </p>
            <div className="mt-auto flex justify-end pt-6">
              <Corner c={c} flip onDark />
            </div>
          </section>

          {/* The note */}
          <section
            aria-labelledby={`b-${c.id}`}
            inert={!flipped}
            aria-hidden={!flipped}
            className="relative flex min-h-[26rem] flex-col rounded-[1.75rem] bg-[#fbf8f1] p-6 text-[#1f2933] shadow-xl ring-1 ring-[#e7dfcc] [backface-visibility:hidden] [grid-area:1/1] [transform:rotateY(180deg)] sm:p-8 dark:bg-[#2a2722] dark:text-[#f3efe6] dark:ring-[#3d382f]"
          >
            <div className="flex items-start justify-between">
              <Corner c={c} />
              <span className="rounded-full bg-[#0f3f45]/10 px-3 py-1 text-xs font-semibold dark:bg-white/10">{c.label}</span>
            </div>
            {biz && c.data.illustrative && <p className="mt-3 rounded-xl bg-[#fff1cc] px-3 py-2 text-sm font-semibold text-[#4a3400]">{FICTIONAL_NOTICE}</p>}
            <h4 id={`b-${c.id}`} ref={backHeading} tabIndex={-1} className="mt-4 text-xs font-extrabold uppercase tracking-[0.14em] text-accent outline-none">
              {biz ? "Note to my younger self" : "To a younger me"}
            </h4>
            <p className="mt-2 font-serif text-xl leading-relaxed">“{c.data.note}”</p>
            {biz && (
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {(
                  [
                    ["What I believed then", biz.believed],
                    ["What I tried", biz.tried],
                    ["What didn’t work", biz.failed],
                    ["The trade-off", biz.tradeoff],
                  ] as const
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="font-semibold">{k}</dt>
                      <dd className="mt-0.5 opacity-90">{v}</dd>
                    </div>
                  ))}
              </dl>
            )}
            {c.data.phrase && (
              <div className="mt-4 rounded-2xl bg-[#0f3f45]/[0.07] p-4 dark:bg-white/10">
                <p className="text-sm font-semibold">{biz ? "Try this" : "Phrase to adapt"}</p>
                <p className="mt-1">“{c.data.phrase}”</p>
                <p className="mt-1 text-xs opacity-80">{biz ? "Adapt it to your business. It isn’t a rule or a benchmark." : PHRASE_NOTE}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" className={cx(secondary, "min-h-9 px-3 text-sm")} disabled={!c.canCopy} onClick={() => void copy()}>
                    <Icon name="copy" className="size-4" /> {biz ? "Copy" : "Copy phrase"}
                  </button>
                  <span role="status" className="text-xs">
                    {!c.canCopy
                      ? "Copying is paused while this note is re-reviewed."
                      : copied === "ok"
                        ? "Copied. Adapt it to the person."
                        : copied === "failed"
                          ? "Copying didn’t work here: select the phrase above instead."
                          : ""}
                  </span>
                </div>
              </div>
            )}
            {c.state === "needs_review" && (
              <p className="mt-3 rounded-xl bg-[#fff1cc] p-2 text-sm text-[#4a3400]">Being re-reviewed: check the current approved guidance.</p>
            )}
            {c.data.policyNote && <p className="mt-3 text-xs opacity-80">Related guidance: {c.data.policyNote}</p>}
            {biz && (
              <div className="mt-3 rounded-xl border border-[#0f3f45]/15 p-3 text-xs dark:border-white/15">
                <p className="font-semibold">Peer experience</p>
                {biz.claims.length > 0 && (
                  <ul className="mt-1 list-disc pl-4">
                    {biz.claims.map((cl) => (
                      <li key={cl.text}>
                        {cl.text} ({cl.basis === "verified" ? `verified: ${cl.source}` : "contributor-reported, approximate"})
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1">
                  Version {c.version}
                  {c.updatedAt && ` · reviewed on ${showDay(c.updatedAt)}`}
                  {biz.historical && " · Historical story: a programme rule has changed since"}
                </p>
                {biz.ruleNote && <p className="mt-1">Current approved guidance: {biz.ruleNote}</p>}
                <p className="mt-1 opacity-80">{PEER_NOTICE}</p>
              </div>
            )}
            <p className="mt-4 text-sm">
              — <span className="font-semibold">{c.data.authorName}</span>
              {c.data.authorRole && `, ${c.data.authorRole}`}
              {c.data.experience && ` · ${c.data.experience}`}
              {c.data.illustrative && <span className="italic"> · {biz ? "fictional illustration" : "Illustrative card"}</span>}
            </p>
            {!biz && <p className="mt-1 text-xs opacity-70">{NOTE_NOTICE}</p>}
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
              <button
                type="button"
                aria-pressed={c.mineHelpful}
                className={cx(secondary, "min-h-9 px-3 text-sm", c.mineHelpful && "bg-muted ring-2 ring-action")}
                disabled={busy || !recorded}
                onClick={() => void act({ action: "helpful", noteId: c.id, on: !c.mineHelpful }, (r) => onChange?.({ ...c, ...r }))}
              >
                <Icon name="heart" className="size-4" /> Helpful · {c.helpful}
              </button>
              <button
                type="button"
                aria-pressed={c.saved}
                className={cx(secondary, "min-h-9 px-3 text-sm", c.saved && "bg-muted ring-2 ring-action")}
                disabled={busy || !recorded}
                onClick={() => void act({ action: "save", noteId: c.id, on: !c.saved }, () => onChange?.({ ...c, saved: !c.saved }))}
              >
                <Icon name={c.saved ? "bookmark-filled" : "bookmark"} className="size-4" /> {c.saved ? "In Pocket Deck" : "Save to Pocket Deck"}
              </button>
              {biz && (
                <Link href={discussionHref ?? `/business-notes/${c.id}#discussion`} className={cx(secondary, "min-h-9 px-3 text-sm")}>
                  <Icon name="chat" className="size-4" /> Read discussion
                </Link>
              )}
              {c.thread && (
                <Link
                  href={`/community#post-${c.thread}`}
                  className={cx(secondary, "min-h-9 px-3 text-sm")}
                  onClick={() => recorded && api("/api/mentor-notes", { body: { action: "use", event: "discussion", noteId: c.id } }).catch(() => undefined)}
                >
                  <Icon name="chat" className="size-4" /> View discussion
                </Link>
              )}
            </div>
            {problem && (
              <p role="alert" className="mt-2 text-sm text-[#b3261e]">
                {problem}
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Controls sit outside the card, so the flip is never wrapped around the card's own actions. */}
      <div className="mt-4 flex flex-col items-center gap-3">
        {!flipped && think && (
          <label className="flex w-full flex-col gap-1">
            <span className="font-semibold">
              {biz
                ? "Your first thought (private): what would you try in your business, and what would you need to know?"
                : "Before you flip: what would you do? (private)"}
            </span>
            <textarea
              className="min-h-20 rounded-xl border border-line-strong bg-bg px-3 py-2"
              maxLength={400}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => draft !== (instinct ?? "") && onInstinct?.(draft)}
            />
          </label>
        )}
        {flipped && think && instinct && (
          <p className="w-full rounded-2xl bg-muted p-3 text-sm">
            <span className="font-semibold">{biz ? "Your first thought:" : "Your first instinct:"}</span> {instinct}
          </p>
        )}
        <button
          type="button"
          className={flipped ? secondary : primary}
          onClick={() => {
            if (!flipped && think && draft !== (instinct ?? "")) onInstinct?.(draft);
            turn(!flipped);
          }}
        >
          <Icon name="refresh" className="size-4" /> {flipped ? "Back to the moment" : think && !draft.trim() ? "Skip and flip to the note" : "Flip to note"}
        </button>
      </div>
    </div>
  );
}
