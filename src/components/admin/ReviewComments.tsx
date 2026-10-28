"use client";

import { useState } from "react";
import type { Lesson } from "@/content/lessons";
import { api } from "@/lib/api";
import { ordered } from "@/lib/lessonGraph";
import { cx } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { Icon } from "../Icon";
import { Composer, threadsOf, ThreadView, when, type ReviewAction, type ReviewData } from "../ReviewThreads";
import { btn, ErrorNote, input } from "./ui";

/*
  The editor's Comments tab: the lesson's review link for people outside the hub, and every review
  comment, card by card, to reply to and resolve.
*/

export type EditorReview = ReviewData & {
  link: { token: string; path: string; since: string } | null;
  reviewers: { name: string; email: string; comments: number; lastComment: string }[];
};

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
  const [copied, setCopied] = useState(false);
  const url = `/api/admin/lessons/${encodeURIComponent(slug)}/review`;

  async function send(body: ReviewAction | { action: "link"; on: boolean }) {
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

  const full = data.link && typeof window !== "undefined" ? `${window.location.origin}${data.link.path}` : "";
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
      <section className="rounded-3xl border border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
          <Icon name="people" className="size-5 text-accent" /> Share for review
        </h2>
        <p className="mt-1 text-ink-muted">
          Send a private link to anyone, inside or outside Trilogy. They give their name and email, then see your latest <strong>saved</strong> draft and can
          comment on each card. They can’t change anything, and nothing they answer is recorded.
        </p>
        {data.link ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Review link</span>
                <input readOnly value={full} onFocus={(e) => e.currentTarget.select()} className={cx(input, "font-mono text-sm")} />
              </label>
              <button
                type="button"
                className={btn.primary}
                onClick={async () => {
                  await navigator.clipboard.writeText(full).catch(() => {});
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2500);
                }}
              >
                <Icon name={copied ? "check" : "copy"} className="size-4" /> {copied ? "Copied" : "Copy link"}
              </button>
              <a href={data.link.path} target="_blank" rel="noopener" className={btn.secondary}>
                Open
              </a>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              <span>On since {when(data.link.since)}. Anyone with the link can comment.</span>
              <button
                type="button"
                className="font-semibold text-accent underline-offset-4 hover:underline"
                onClick={async () =>
                  (await confirmAction(
                    "The link stops working for everyone straight away. Comments already made are kept. Switching it on again makes a new link.",
                    {
                      title: "Switch off the review link?",
                      confirmLabel: "Switch off",
                      danger: true,
                    },
                  )) && send({ action: "link", on: false })
                }
              >
                Switch off the link
              </button>
            </p>
          </>
        ) : (
          <button type="button" className={cx(btn.primary, "mt-4")} onClick={() => send({ action: "link", on: true })}>
            <Icon name="plus" className="size-4" /> Create a review link
          </button>
        )}
        {data.reviewers.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">Reviewers so far</h3>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {data.reviewers.map((r) => (
                <li key={r.email + r.name} className="flex flex-wrap gap-x-2">
                  <span className="font-semibold">{r.name}</span>
                  <a href={`mailto:${r.email}`} className="text-accent hover:underline">
                    {r.email}
                  </a>
                  <span className="text-ink-muted">
                    · {r.comments} {r.comments === 1 ? "comment" : "comments"}, last {when(r.lastComment)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

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
              : data.link
                ? "No comments yet. They’ll appear here as reviewers add them."
                : "No comments yet. Create a review link and send it to your reviewers."}
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
  /** The Comments tab: the review link and every card's comments. */
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
        <span className="flex-1 text-center text-ink-muted">{openTotal ? `${openTotal} open in this lesson` : "Nothing open in this lesson"}</span>
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
          Review link and all comments
        </button>
      </footer>
    </section>
  );
}
