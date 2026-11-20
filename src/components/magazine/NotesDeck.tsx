"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { RANKS, type DeckState } from "@/lib/notes";
import type { NotesDeckBlock } from "@/lib/magazine";
import type { deckState } from "@/server/notes";
import { GoneNote, MentorCard, type CardView, type GoneCard } from "../notes/MentorCard";
import { Icon } from "../Icon";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  A "Notes to a Younger Me" deck in a Magazine course (docs/notes-to-a-younger-me.md). One active card, large
  enough to read, with a decorative fan behind it that's never focusable. Previous, Next and a numbered position
  row move between cards; a horizontal swipe does too, but only past a threshold and never on a control. "Deal
  another note" adds the next reviewed card, without repeats. The deck is dealt once per learner and kept stable.

  In the editor's preview it deals from the library as it stands (cards not yet reviewed included, and marked),
  and records nothing.
*/

type Loaded = ReturnType<typeof deckState>;
type Card = CardView | GoneCard;
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";

export function NotesDeck({ block: b, ctx }: { block: NotesDeckBlock; ctx: InteractiveContext }) {
  const url = `/api/magazine/${ctx.guideId}/mentor`;
  const loaded = useApi<Loaded>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [state, setState] = useState<DeckState | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [at, setAt] = useState(0);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [problem, setProblem] = useState("");
  const [reflection, setReflection] = useState("");
  const [savedReflection, setSavedReflection] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  if (!ctx.preview && loaded.data && cards === null) {
    setCards(loaded.data.cards as Card[]);
    setState(loaded.data.state);
    setExhausted(loaded.data.exhausted);
    setReflection(loaded.data.state.reflection);
    setSavedReflection(Boolean(loaded.data.state.reflection));
  }
  // The editor's preview asks the library what this deck would deal (again only when the block's settings change).
  const blockKey = JSON.stringify(b);
  useEffect(() => {
    if (!ctx.preview) return;
    let live = true;
    api<{ cards: CardView[] }>("/api/admin/mentor-notes", { body: { action: "preview", block: JSON.parse(blockKey) } })
      .then((r) => {
        if (!live) return;
        setCards(r.cards);
        setState({ dealt: r.cards.map((c) => c.id), flipped: [], instincts: {}, reflection: "", completed: false, versions: {} });
      })
      .catch((e: Error) => live && setProblem(e.message));
    return () => {
      live = false;
    };
  }, [ctx.preview, blockKey]);

  if (!ctx.preview && loaded.error)
    return (
      <Shell b={b}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  if (!cards || !state)
    return (
      <Shell b={b}>
        <p className="text-ink-muted">{problem || "Dealing…"}</p>
      </Shell>
    );
  if (!cards.length)
    return (
      <Shell b={b}>
        <p className="rounded-2xl bg-bg p-4 ring-1 ring-line">No reviewed notes are available for your role on this topic yet.</p>
      </Shell>
    );

  const idx = Math.min(at, cards.length - 1);
  const card = cards[idx];
  const position = `Card ${idx + 1} of ${cards.length}`;
  const send = async (body: Record<string, unknown>) => {
    if (ctx.preview) return null;
    setProblem("");
    try {
      const r = await api<Loaded & { completedNow: boolean }>(url, { body: { blockId: b.id, ...body } });
      setCards(r.cards as Card[]);
      setState(r.state);
      setExhausted(r.exhausted);
      if (r.completedNow) {
        ctx.activity(b.id, { outcome: "completed" });
        ctx.engaged(b.id);
      }
      return r;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work. Try again.");
      return null;
    }
  };
  const go = (to: number) => setAt(Math.max(0, Math.min(cards.length - 1, to)));
  const deal = async () => {
    const r = await send({ action: "deal" });
    if (r && r.cards.length > cards.length) setAt(r.cards.length - 1);
  };
  const first = state.dealt.slice(0, b.count);
  const allTurned = first.every((id) => state.flipped.includes(id) || (ctx.preview && flipped[id]));

  return (
    <Shell b={b}>
      {b.intro && <p className="mt-2 text-lg">{b.intro}</p>}
      <p className="mt-2 text-sm text-ink-muted">
        Turn each card to read the note. {b.mode === "think" ? "Jot your first instinct before you flip, if you like. It’s private." : ""}
      </p>

      <div
        className="relative mt-6 touch-pan-y"
        onPointerDown={(e) => {
          // A swipe never starts on a control, so it can't flip, vote or copy by accident.
          if ((e.target as HTMLElement).closest("button, a, input, textarea, select, label")) return;
          start.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const s = start.current;
          start.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 2) go(idx + (dx < 0 ? 1 : -1));
        }}
      >
        {/* The fan behind the active card: decorative, and never reachable. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-4 mx-auto hidden h-[24rem] max-w-[34rem] sm:block">
          {cards.slice(idx + 1, idx + 3).map((_, i) => (
            <div
              key={i}
              className="absolute inset-0 rounded-[1.75rem] bg-[#0f3f45] opacity-40 shadow-lg"
              style={{ transform: `translateX(${(i + 1) * 18}px) rotate(${(i + 1) * 3}deg)`, zIndex: -1 - i }}
            />
          ))}
        </div>
        {"gone" in card ? (
          <GoneNote c={card} />
        ) : (
          <MentorCard
            key={card.id}
            c={card}
            position={position}
            flipped={Boolean(flipped[card.id])}
            preview={ctx.preview}
            think={b.mode === "think"}
            instinct={state.instincts[card.id]}
            onInstinct={(text) => void send({ action: "instinct", noteId: card.id, text })}
            onFlip={(to) => {
              setFlipped({ ...flipped, [card.id]: to });
              if (to && !state.flipped.includes(card.id)) void send({ action: "flip", noteId: card.id });
            }}
            onChange={(next) => setCards(cards.map((x) => (x.id === next.id ? next : x)))}
          />
        )}
      </div>

      <nav aria-label="Cards" className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button type="button" className={secondary} disabled={idx === 0} onClick={() => go(idx - 1)}>
          <Icon name="arrow-left" className="size-4" /> Previous
        </button>
        <ol className="flex gap-1">
          {cards.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                aria-current={i === idx ? "true" : undefined}
                aria-label={`Card ${i + 1}${state.flipped.includes(c.id) ? ", read" : ""}`}
                className={cx(
                  "size-11 rounded-full text-sm font-semibold ring-1",
                  i === idx ? "bg-action text-on-action ring-action" : state.flipped.includes(c.id) ? "bg-muted ring-line" : "bg-surface ring-line-strong",
                )}
                onClick={() => go(i)}
              >
                {i + 1}
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className={secondary} disabled={idx === cards.length - 1} onClick={() => go(idx + 1)}>
          Next <Icon name="arrow-right" className="size-4" />
        </button>
      </nav>

      {b.deal && b.selection !== "curated" && (
        <div className="mt-3 text-center">
          <button type="button" className={secondary} disabled={exhausted || Boolean(ctx.preview)} onClick={() => void deal()}>
            <Icon name="plus" className="size-4" /> Deal another note
          </button>
          {exhausted && <p className="mt-1 text-sm text-ink-muted">You’ve seen every reviewed note on this topic.</p>}
        </div>
      )}

      {problem && (
        <p role="alert" className="mt-3 rounded-2xl bg-[#fff1cc] p-3 text-[#4a3400]">
          {problem}
        </p>
      )}

      {b.reflection && (
        <form
          className="mt-6 rounded-2xl bg-bg p-4 ring-1 ring-line"
          onSubmit={(e) => {
            e.preventDefault();
            void send({ action: "reflect", text: reflection }).then(() => setSavedReflection(true));
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="font-semibold">{b.reflection}</span>
            <span className="text-sm text-ink-muted">Private to you.{allTurned ? "" : " You can answer once you’ve turned the cards."}</span>
            <textarea
              className="min-h-20 rounded-xl border border-line-strong bg-surface px-3 py-2"
              maxLength={600}
              value={reflection}
              onChange={(e) => {
                setReflection(e.target.value);
                setSavedReflection(false);
              }}
            />
          </label>
          <div className="mt-2 flex items-center gap-3">
            <button type="submit" className={secondary} disabled={!reflection.trim() || Boolean(ctx.preview)}>
              Save
            </button>
            <span role="status" className="text-sm text-ink-muted">
              {savedReflection && reflection ? "Saved." : ""}
            </span>
          </div>
        </form>
      )}

      <p className="mt-4 text-center text-sm">
        <Link href="/pocket-deck" className="font-semibold text-accent underline">
          Your Pocket Deck
        </Link>
        {b.contribute && (
          <>
            {" · "}
            <Link href="/pocket-deck#leave-a-note" className="font-semibold text-accent underline">
              Leave a note for the next person (optional)
            </Link>
          </>
        )}
      </p>
      <p className="mt-2 text-center text-xs text-ink-muted">
        Rank is an editorial motif, not a score:{" "}
        {Object.entries(RANKS)
          .map(([k, v]) => `${k} · ${v}`)
          .join(", ")}
        .
      </p>
    </Shell>
  );
}

function Shell({ b, children }: { b: NotesDeckBlock; children: React.ReactNode }) {
  return (
    <section aria-label={`Notes to a Younger Me: ${b.title}`} className="w-full rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="mail" className="size-5" /> Notes to a younger me
      </p>
      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}
