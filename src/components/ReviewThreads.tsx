"use client";

import { useState } from "react";
import { cx } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { Icon } from "./Icon";

/*
  Review comment threads, shared by the reviewer's view of a lesson and the editor's Comments tab:
  each thread is a first comment with replies, which authors resolve once dealt with.
*/

export type ReviewComment = {
  id: number;
  card: string;
  parent: number | null;
  text: string;
  by: { name: string; role: "Reviewer" | "Author"; email?: string };
  at: string;
  heading: string;
  mine: boolean;
  resolved: { at: string; by: string } | null;
  cardGone: boolean;
  changed: boolean;
};
export type ReviewData = { comments: ReviewComment[]; canResolve: boolean; me: string };
export type ReviewAction =
  { action: "post"; card: string; text: string; parent?: number } | { action: "delete"; comment: number } | { action: "resolve" | "reopen"; comment: number };

export const MAX_REVIEW_COMMENT = 2000;

export type Thread = ReviewComment & { replies: ReviewComment[] };

/** First comments with their replies, oldest first. */
export function threadsOf(comments: ReviewComment[]): Thread[] {
  return comments.filter((c) => !c.parent).map((c) => ({ ...c, replies: comments.filter((r) => r.parent === c.id) }));
}

/** Open threads per card, for counts on cards. */
export function openCounts(comments: ReviewComment[]) {
  const counts: Record<string, number> = {};
  for (const c of comments) if (!c.parent && !c.resolved) counts[c.card] = (counts[c.card] ?? 0) + 1;
  return counts;
}

export function when(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/** A box to write a comment or reply. Resolves true once sent, so it can clear. */
export function Composer({
  label,
  placeholder,
  submit,
  onSend,
  onCancel,
  autoFocus,
}: {
  label: string;
  placeholder: string;
  submit: string;
  onSend: (text: string) => Promise<boolean>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        if (await onSend(text.trim())) setText("");
        setBusy(false);
      }}
    >
      <label className="flex flex-col">
        <span className="sr-only">{label}</span>
        <textarea
          rows={3}
          maxLength={MAX_REVIEW_COMMENT}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl or Cmd + Enter sends.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-line-strong bg-surface p-2.5 text-[0.98rem]"
        />
      </label>
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-10 rounded-full px-3 text-sm font-semibold text-ink-muted hover:text-ink">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={busy || text.trim().length < 2}
          className="inline-flex min-h-10 items-center rounded-full bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover disabled:opacity-45"
        >
          {busy ? "Sending…" : submit}
        </button>
      </div>
    </form>
  );
}

function Bubble({ c, onDelete }: { c: ReviewComment; onDelete?: () => void }) {
  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
        <span className="font-semibold">{c.mine ? "You" : c.by.name}</span>
        <span className={cx("rounded-full px-1.5 text-xs font-semibold", c.by.role === "Author" ? "bg-action text-on-action" : "bg-gold/40 text-[#102a43]")}>
          {c.by.role}
        </span>
        <span className="text-xs text-ink-muted">{when(c.at)}</span>
        {c.by.email && !c.mine && (
          <a href={`mailto:${c.by.email}`} className="text-xs text-accent underline-offset-2 hover:underline">
            {c.by.email}
          </a>
        )}
      </p>
      <p className="mt-1 whitespace-pre-line text-[0.98rem]">{c.text}</p>
      {onDelete && (
        <button type="button" onClick={onDelete} className="mt-1 text-xs font-semibold text-ink-muted hover:text-ink hover:underline">
          Delete
        </button>
      )}
    </div>
  );
}

/** One thread: the first comment, its replies, and reply, resolve and delete. */
export function ThreadView({
  thread: t,
  canResolve,
  act,
  showCard,
}: {
  thread: Thread;
  canResolve: boolean;
  act: (a: ReviewAction) => Promise<boolean>;
  /** In the editor: jump to the card the thread is on. */
  showCard?: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const del = async (c: ReviewComment) =>
    (await confirmAction(c.parent ? "Your reply is removed." : "Your comment and its replies are removed.", {
      title: c.parent ? "Delete your reply?" : "Delete your comment?",
      confirmLabel: "Delete",
      danger: true,
    })) && act({ action: "delete", comment: c.id });
  return (
    <li className={cx("rounded-2xl border p-3", t.resolved ? "border-line bg-muted/60" : "border-line-strong bg-surface")}>
      {(t.changed || t.cardGone || t.resolved) && (
        <p className="mb-2 flex flex-wrap gap-1.5">
          {t.resolved && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#2b6636]/15 px-2 py-0.5 text-xs font-semibold text-[#2b6636] dark:text-[#9fd8a8]">
              <Icon name="check" className="size-3" /> Resolved by {t.resolved.by}
            </span>
          )}
          {t.changed && <span className="rounded-full bg-gold/30 px-2 py-0.5 text-xs font-semibold">Card edited since this comment</span>}
          {t.cardGone && <span className="rounded-full bg-orange/20 px-2 py-0.5 text-xs font-semibold">Card no longer in the lesson</span>}
        </p>
      )}
      <Bubble c={t} onDelete={t.mine ? () => del(t) : undefined} />
      {t.replies.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2 border-l-2 border-line pl-3">
          {t.replies.map((r) => (
            <li key={r.id}>
              <Bubble c={r} onDelete={r.mine ? () => del(r) : undefined} />
            </li>
          ))}
        </ul>
      )}
      {replying ? (
        <div className="mt-2">
          <Composer
            label="Your reply"
            placeholder="Write a reply"
            submit="Reply"
            autoFocus
            onCancel={() => setReplying(false)}
            onSend={async (text) => {
              const ok = await act({ action: "post", card: t.card, text, parent: t.id });
              if (ok) setReplying(false);
              return ok;
            }}
          />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
          <button type="button" onClick={() => setReplying(true)} className="min-h-9 text-accent hover:underline">
            Reply
          </button>
          {canResolve && (
            <button
              type="button"
              onClick={() => act({ action: t.resolved ? "reopen" : "resolve", comment: t.id })}
              className="min-h-9 text-accent hover:underline"
            >
              {t.resolved ? "Reopen" : "Resolve"}
            </button>
          )}
          {showCard && !t.cardGone && (
            <button type="button" onClick={showCard} className="min-h-9 text-accent hover:underline">
              Show the card
            </button>
          )}
        </div>
      )}
    </li>
  );
}
