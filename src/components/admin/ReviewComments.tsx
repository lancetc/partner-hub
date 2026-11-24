"use client";

import { useState } from "react";
import type { Lesson } from "@/content/lessons";
import { api } from "@/lib/api";
import { ordered } from "@/lib/lessonGraph";
import { cx } from "@/lib/format";

import { Icon } from "../Icon";
import { Composer, threadsOf, ThreadView, type ReviewAction, type ReviewData } from "../ReviewThreads";
import { ErrorNote } from "./ui";

/*
  The editor's Comments tab: every review comment from people signed in to the hub, card by card, to reply to and
  resolve. There are no review links for people outside the hub.
*/

export type EditorReview = ReviewData;

export function ReviewComments({
  slug,
  lesson,
  data,
  setData,
  focusCard,
  setFocusCard,
  onShowCard,
}: {
  slug: string;
  lesson: Lesson;
  data: EditorReview | null;
  setData: (d: EditorReview) => void;
  /** Only this card's comments (from a card's comment count), until cleared. */
  focusCard: string | null;
  setFocusCard: (id: string | null) => void;
  onShowCard: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [error, setError] = useState<string | null>(null);
  const url = `/api/admin/lessons/${encodeURIComponent(slug)}/review`;

  async function send(body: ReviewAction) {
    setError(null);
    try {
      setData(await api<EditorReview>(url, { body }));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  if (!data) return <p className="text-ink-muted">Loading comments…</p>;

  const threads = threadsOf(data.comments);
  const shown = threads.filter((t) => (filter === "all" || (filter === "open" ? !t.resolved : Boolean(t.resolved))) && (!focusCard || t.card === focusCard));
  const cards = ordered(lesson);
  const groups = [
    ...cards.map((c, i) => ({ id: c.id, title: `Card ${i + 1} · ${c.heading || c.label}`, threads: shown.filter((t) => t.card === c.id) })),
    // Cards deleted since they were commented on.
    ...[...new Set(shown.filter((t) => t.cardGone).map((t) => t.card))].map((id) => ({
      id,
      title: `Removed card · ${shown.find((t) => t.card === id)?.heading || id}`,
      threads: shown.filter((t) => t.card === id),
    })),
  ].filter((g) => g.threads.length);
  const openCount = threads.filter((t) => !t.resolved).length;

  return (
    <div className="flex flex-col gap-6">
      {error && <ErrorNote text={error} />}

      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-serif text-xl font-semibold">
            Comments{openCount ? <span className="ml-2 text-base font-normal text-ink-muted">{openCount} open</span> : null}
          </h2>
          <div role="group" aria-label="Show" className="ml-auto flex gap-1 rounded-full bg-muted p-1">
            {(["open", "resolved", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cx(
                  "min-h-9 rounded-full px-3 text-sm font-semibold capitalize",
                  filter === f ? "bg-surface shadow-sm" : "text-ink-muted hover:text-ink",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        {focusCard && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            Showing one card: <strong>{lesson.nodes[focusCard]?.heading || lesson.nodes[focusCard]?.label || "a removed card"}</strong>
            <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setFocusCard(null)}>
              Show every card
            </button>
          </p>
        )}
        {!groups.length ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line-strong p-5 text-center text-ink-muted">
            {threads.length
              ? filter === "open"
                ? "Nothing open. Every comment is resolved."
                : "No comments here."
              : "No comments yet. They’ll appear here as people add them."}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            {groups.map((g) => (
              <section key={g.id} aria-label={g.title}>
                <h3 className="mb-2 font-semibold">{g.title}</h3>
                <ul className="flex flex-col gap-3">
                  {g.threads.map((t) => (
                    <ThreadView key={t.id} thread={t} canResolve act={send} showCard={() => onShowCard(t.card)} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
  Beside the cards: the comments on whichever card is selected, so they can be read in context and
  the card changed straight away. It follows the selection, and steps between cards with comments.
*/
export function CardComments({
  slug,
  lesson,
  data,
  setData,
  card,
  onCard,
  onClose,
  onAll,
}: {
  slug: string;
  lesson: Lesson;
  data: EditorReview | null;
  setData: (d: EditorReview) => void;
  /** The selected card. */
  card: string;
  /** Select (and show) another card. */
  onCard: (id: string) => void;
  onClose: () => void;
  /** The Comments tab: every card's comments. */
  onAll: () => void;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: ReviewAction) {
    setError(null);
    try {
      setData(await api<EditorReview>(`/api/admin/lessons/${encodeURIComponent(slug)}/review`, { body }));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  const cards = ordered(lesson);
  const index = cards.findIndex((c) => c.id === card);
  const threads = threadsOf(data?.comments ?? []);
  const here = threads.filter((t) => t.card === card);
  const shown = here.filter((t) => showResolved || !t.resolved);
  const resolvedHere = here.filter((t) => t.resolved).length;
  // Cards with open comments, in lesson order, to step through.
  const withOpen = cards.filter((c) => threads.some((t) => t.card === c.id && !t.resolved)).map((c) => c.id);
  const before = [...withOpen].reverse().find((id) => cards.findIndex((c) => c.id === id) < index);
  const after = withOpen.find((id) => cards.findIndex((c) => c.id === id) > index);
  const openTotal = threads.filter((t) => !t.resolved).length;
  const c = lesson.nodes[card];

  return (
    <section aria-label="Comments on this card" className="flex max-h-[calc(100vh-7rem)] flex-col rounded-3xl bg-surface shadow-sm ring-1 ring-line">
      <header className="flex items-start gap-2 border-b border-line p-3">
        <Icon name="chat" className="mt-0.5 size-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Comments</h2>
          <p className="truncate text-xs text-ink-muted">
            Card {index + 1} · {c?.heading || c?.label || "Untitled card"}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Hide comments" className="grid size-8 place-items-center rounded-full hover:bg-muted">
          <Icon name="close" className="size-4" />
        </button>
      </header>

      <div className="flex items-center gap-1 border-b border-line px-3 py-2 text-xs">
        <button
          type="button"
          disabled={!before}
          onClick={() => before && onCard(before)}
          className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 font-semibold text-accent hover:bg-muted disabled:text-ink-muted disabled:opacity-50"
        >
          <Icon name="arrow-left" className="size-3.5" /> Previous
        </button>
        <span className="flex-1 text-center text-ink-muted">{openTotal ? `${openTotal} open in this topic` : "Nothing open in this topic"}</span>
        <button
          type="button"
          disabled={!after}
          onClick={() => after && onCard(after)}
          className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 font-semibold text-accent hover:bg-muted disabled:text-ink-muted disabled:opacity-50"
        >
          Next <Icon name="arrow-right" className="size-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {!data ? (
          <p className="text-sm text-ink-muted">Loading comments…</p>
        ) : (
          <>
            {error && <ErrorNote text={error} />}
            {shown.length ? (
              <ul className="flex flex-col gap-3 text-sm">
                {shown.map((t) => (
                  <ThreadView key={t.id} thread={t} canResolve act={send} />
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-line-strong p-3 text-center text-sm text-ink-muted">
                {here.length ? "Every comment on this card is resolved." : "No comments on this card."}
              </p>
            )}
            {resolvedHere > 0 && (
              <button type="button" onClick={() => setShowResolved((v) => !v)} className="self-start text-xs font-semibold text-accent hover:underline">
                {showResolved ? "Hide resolved" : `Show ${resolvedHere} resolved`}
              </button>
            )}
            <Composer
              key={card}
              label="Add a comment on this card"
              placeholder="A note for reviewers or other authors"
              submit="Comment"
              onSend={(text) => send({ action: "post", card, text })}
            />
          </>
        )}
      </div>

      <footer className="border-t border-line px-3 py-2 text-xs">
        <button type="button" onClick={onAll} className="font-semibold text-accent hover:underline">
          All comments
        </button>
      </footer>
    </section>
  );
}
