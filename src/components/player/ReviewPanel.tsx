"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { Composer, openCounts, threadsOf, ThreadView, type ReviewAction, type ReviewData } from "../ReviewThreads";

/*
  Reviewing a lesson from a review link: a Comments button on every card, opening a panel beside
  the lesson with that card's threads and a box to add one. "All cards" lists every card with its
  comments, so a reviewer can jump to cards on branches they didn't take.
*/

/** The review's comments, kept fresh while the reviewer works (others may be commenting too). */
export function useReview(token: string | undefined) {
  const url = token ? `/api/review/${encodeURIComponent(token)}` : null;
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!url) return;
    api<ReviewData>(url).then(
      (d) => {
        setData(d);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [url]);
  useEffect(() => {
    if (!url) return;
    load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, [url, load]);
  const act = useCallback(
    async (a: ReviewAction) => {
      if (!url) return false;
      try {
        setData(await api<ReviewData>(url, { body: a }));
        setError(null);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [url],
  );
  // "Not you?": forget this reviewer in the browser and go back to the name and email step.
  const leave = useCallback(async () => {
    if (!url) return;
    await api(`${url}/join`, { method: "DELETE" }).catch(() => {});
    window.location.reload();
  }, [url]);
  return { data, error, act, reload: load, leave };
}

export type Review = ReturnType<typeof useReview>;
type CardInfo = { id: string; heading: string; label: string };

/** The card header's Comments button, with how many open threads the card has. */
export function ReviewButton({ review, card, cards, onJump }: { review: Review; card: CardInfo; cards: CardInfo[]; onJump: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const count = review.data ? (openCounts(review.data.comments)[card.id] ?? 0) : 0;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          review.reload();
        }}
        aria-haspopup="dialog"
        aria-label={count ? `Comments on this card, ${count} open` : "Comment on this card"}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-gold px-3 text-sm font-bold text-[#102a43] shadow-sm hover:brightness-95"
      >
        <Icon name="chat" className="size-4" />
        {count ? count : "Comment"}
      </button>
      {open && <Panel review={review} card={card} cards={cards} onJump={onJump} onClose={() => setOpen(false)} />}
    </>
  );
}

function Panel({
  review,
  card,
  cards,
  onJump,
  onClose,
}: {
  review: Review;
  card: CardInfo;
  cards: CardInfo[];
  onJump: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"card" | "all">("card");
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, []);

  const all = review.data ? threadsOf(review.data.comments) : [];
  const here = all.filter((t) => t.card === card.id);
  const counts = review.data ? openCounts(review.data.comments) : {};
  const name = card.heading || card.label || "This card";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/30 sm:bg-black/15" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label="Review comments" className="flex h-dvh w-full max-w-[26rem] flex-col bg-surface text-ink shadow-2xl">
        <header className="flex items-center gap-2 border-b border-line p-3">
          <div className="min-w-0 flex-1">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Review comments</p>
            <p className="truncate font-semibold">{tab === "card" ? name : "All cards"}</p>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close comments"
            className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-muted"
          >
            <Icon name="close" className="size-5" />
          </button>
        </header>
        <div role="tablist" aria-label="Show comments for" className="flex gap-1 border-b border-line px-3">
          {(
            [
              ["card", `This card${here.length ? ` (${here.length})` : ""}`],
              ["all", `All cards (${all.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cx(
                "-mb-px min-h-11 border-b-2 px-3 text-sm font-semibold",
                tab === id ? "border-action" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {review.error && (
            <p role="alert" className="mb-3 rounded-xl bg-orange/10 p-2.5 text-sm">
              {review.error}
            </p>
          )}
          {!review.data ? (
            <p className="text-sm text-ink-muted">Loading comments…</p>
          ) : tab === "card" ? (
            <>
              <Composer
                label={`Comment on ${name}`}
                placeholder="What should change on this card? Be as specific as you can."
                submit="Comment"
                onSend={(text) => review.act({ action: "post", card: card.id, text })}
              />
              <p className="mt-1 text-xs text-ink-muted">
                Commenting as <strong>{review.data.me}</strong>
                {!review.data.canResolve && (
                  <>
                    {" "}
                    (
                    <button type="button" onClick={review.leave} className="font-semibold text-accent hover:underline">
                      not you?
                    </button>
                    )
                  </>
                )}
                . Everyone reviewing this lesson can see comments.
              </p>
              {here.length ? (
                <ul className="mt-4 flex flex-col gap-3">
                  {here.map((t) => (
                    <ThreadView key={t.id} thread={t} canResolve={review.data!.canResolve} act={review.act} />
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-ink-muted">No comments on this card yet.</p>
              )}
            </>
          ) : (
            <ol className="flex flex-col gap-1">
              {cards.map((c, i) => {
                const n = all.filter((t) => t.card === c.id).length;
                const open = counts[c.id] ?? 0;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (c.id !== card.id) onJump(c.id);
                        setTab("card");
                      }}
                      aria-current={c.id === card.id ? "true" : undefined}
                      className={cx("flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 text-left hover:bg-muted", c.id === card.id && "bg-muted")}
                    >
                      <span className="w-6 shrink-0 text-right text-sm tabular-nums text-ink-muted">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{c.heading || c.label}</span>
                      {n > 0 && (
                        <span
                          className={cx(
                            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 text-xs font-bold",
                            open ? "bg-gold text-[#102a43]" : "bg-muted text-ink-muted",
                          )}
                          aria-label={`${n} ${n === 1 ? "comment" : "comments"}${open ? `, ${open} open` : ""}`}
                        >
                          <Icon name="chat" className="size-3" />
                          {n}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
