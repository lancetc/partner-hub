"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { send as sendOrQueue } from "@/lib/outbox";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { confirmAction } from "@/lib/confirm";

/*
  Comments on a lesson card: a toggle showing how many there are, opening a panel to read them and
  add your own. Pinned tips come first. Authors and organisation admins can pin or hide comments.
*/

type Comment = {
  id: number;
  text: string;
  by: { name: string; what: string; staff: boolean };
  at: string;
  pinned: boolean;
  mine: boolean;
  canHide: boolean;
  canPin: boolean;
};
type Thread = { comments: Comment[] };

const MAX = 600;

function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function CardComments({ slug, cardId, onColour, readOnly }: { slug: string; cardId: string; onColour: boolean; readOnly: boolean }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<Thread>(`/api/comments?lesson=${encodeURIComponent(slug)}&card=${encodeURIComponent(cardId)}`).then(
      (t) => live && setThread(t),
      // A draft being previewed has no comments yet.
      () => live && setUnavailable(true),
    );
    return () => {
      live = false;
    };
  }, [slug, cardId]);

  async function act(payload: Record<string, unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      if (payload.action === "post") {
        // A new comment can wait for a connection; pinning, hiding and deleting need one.
        const r = await sendOrQueue<Thread>("/api/comments", payload, { label: "Comment on a lesson card" });
        if (r.queued) setError("You’re offline. Your comment is saved and will be posted when you’re back online.");
        else setThread(r.data);
        after?.();
        return;
      }
      setThread(await api<Thread>("/api/comments", { body: payload }));
      after?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const count = thread?.comments.length ?? 0;
  const panel = `${cardId}-comments`;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "inline-flex min-h-10 items-center gap-2 self-start rounded-full px-3.5 text-sm font-semibold shadow-sm ring-1 [text-shadow:none]",
          onColour ? "bg-white/90 text-[#0a1a2e] ring-white/40 hover:bg-white" : "bg-surface text-ink ring-line hover:bg-muted",
        )}
      >
        <Icon name="chat" className="size-4" />
        {count ? `${count} ${count === 1 ? "comment" : "comments"}` : "Comments"}
        {thread?.comments.some((c) => c.pinned) && !open && (
          <span className="rounded-full bg-gold px-1.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-[#0a1a2e]">Tip</span>
        )}
        <Icon name="chevron-down" className={cx("size-4 transition-transform", open && "rotate-180")} />
      </button>

      <section
        id={panel}
        hidden={!open}
        aria-label="Comments on this card"
        className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 text-ink shadow-sm [text-shadow:none]"
      >
        {unavailable ? (
          <p className="text-sm text-ink-muted">Comments appear here once the lesson is published.</p>
        ) : (
          <>
            {!readOnly && (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act({ action: "post", lesson: slug, card: cardId, text }, () => setText(""));
                }}
              >
                <label htmlFor={`${panel}-text`} className="text-sm font-semibold">
                  Add a tip or question
                </label>
                <textarea
                  id={`${panel}-text`}
                  rows={2}
                  maxLength={MAX}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Something others should know, from your experience"
                  className="rounded-xl border border-line-strong bg-surface p-2.5 text-[0.98rem]"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-ink-muted">Everyone taking this lesson can see it. Leave out client names and details.</span>
                  <button
                    type="submit"
                    disabled={busy || text.trim().length < 3}
                    className="inline-flex min-h-10 items-center rounded-full bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover disabled:opacity-45"
                  >
                    {busy ? "Posting…" : "Post"}
                  </button>
                </div>
              </form>
            )}
            {error && (
              <p role="alert" className="rounded-xl bg-orange/10 p-2.5 text-sm">
                {error}
              </p>
            )}
            {!thread ? (
              <p className="text-sm text-ink-muted">Loading comments…</p>
            ) : !count ? (
              <p className="text-sm text-ink-muted">No comments yet. Be the first to share something useful.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {thread.comments.map((c) => (
                  <li key={c.id} className={cx("rounded-xl p-3", c.pinned ? "bg-gold/15 ring-1 ring-gold/60" : "bg-muted")}>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                      {c.pinned && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2 text-[0.65rem] font-extrabold uppercase tracking-wide text-[#0a1a2e]">
                          <Icon name="star" className="size-3" /> Pinned tip
                        </span>
                      )}
                      <span className="font-semibold">{c.mine ? "You" : c.by.name}</span>
                      <span className={cx("text-xs", c.by.staff ? "rounded-full bg-action px-1.5 font-semibold text-on-action" : "text-ink-muted")}>
                        {c.by.what}
                      </span>
                      <span className="text-xs text-ink-muted">· {ago(c.at)}</span>
                    </p>
                    <p className="mt-1 whitespace-pre-line text-[0.98rem]">{c.text}</p>
                    {(c.mine || c.canHide || c.canPin) && !readOnly && (
                      <div className="mt-1.5 flex flex-wrap gap-3 text-xs font-semibold">
                        {c.canPin && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => act({ action: c.pinned ? "unpin" : "pin", comment: c.id })}
                            className="text-accent hover:underline"
                          >
                            {c.pinned ? "Unpin" : "Pin as a tip"}
                          </button>
                        )}
                        {c.mine && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={async () =>
                              (await confirmAction("It’s removed for good.", { title: "Delete your comment?", confirmLabel: "Delete", danger: true })) &&
                              act({ action: "delete", comment: c.id })
                            }
                            className="text-ink-muted hover:text-ink hover:underline"
                          >
                            Delete
                          </button>
                        )}
                        {c.canHide && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={async () =>
                              (await confirmAction("It stays on record, with who hid it, but nobody sees it.", {
                                title: "Hide this comment?",
                                confirmLabel: "Hide",
                                danger: true,
                              })) && act({ action: "hide", comment: c.id })
                            }
                            className="text-ink-muted hover:text-ink hover:underline"
                          >
                            Hide
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
