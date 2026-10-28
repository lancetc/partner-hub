"use client";

import { useState } from "react";
import type { Lesson } from "@/content/lessons";
import { api } from "@/lib/api";
import { ordered } from "@/lib/lessonGraph";
import { cx } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { Icon } from "../Icon";
import { threadsOf, ThreadView, when, type ReviewAction, type ReviewData } from "../ReviewThreads";
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
