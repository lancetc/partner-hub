"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { ENDORSED_LABEL, FEED_VIEWS, PEER_LABEL, SEED_LABEL, type FeedView } from "@/lib/caseThread";
import type { CaseThreadView } from "@/server/caseThreads";
import { Icon } from "../Icon";

/*
  The discussion in a "What Would You Do?" case thread (docs/case-threads.md): the approved responses in four views,
  each with who wrote it (a fictional seed, a verified coordinator, or a member with their account role), whether
  it's a peer idea or a Quality-endorsed example, helpful votes, comments, saving a script and reporting. Every
  status is in words; nothing relies on colour, an icon or movement. A text-only view lays it out as plain text.
*/

export type Feed = NonNullable<CaseThreadView["feed"]>;
export type Post = Feed["posts"][number];
export type Send = (action: string, extra?: Record<string, unknown>) => Promise<boolean>;

export const showDate = (d: string | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Brisbane" }).format(new Date(d)) : "";
/** A retry key for one post or comment. randomUUID needs a secure page, so there's a fallback for plain-http reviewers on the office network. */
export const freshKey = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50";
export const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
export const quiet =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-muted hover:bg-muted hover:text-ink disabled:opacity-50";
export const field = "w-full rounded-xl border border-line-strong bg-surface p-3 leading-relaxed";

export function FeedViews({
  view,
  counts,
  onView,
  textOnly,
  label,
}: {
  view: FeedView;
  counts: Feed["counts"] | null;
  onView: (v: FeedView) => void;
  textOnly: boolean;
  label: string;
}) {
  const id = useId();
  if (textOnly)
    return (
      <label className="flex flex-col gap-1 text-sm font-semibold" htmlFor={`${id}-sel`}>
        {label}
        <select
          id={`${id}-sel`}
          className="min-h-11 rounded-xl border border-line-strong bg-surface px-3"
          value={view}
          onChange={(e) => onView(e.target.value as FeedView)}
        >
          {(Object.keys(FEED_VIEWS) as FeedView[]).map((v) => (
            <option key={v} value={v}>
              {FEED_VIEWS[v].label}
              {counts ? ` (${counts[v]})` : ""}
            </option>
          ))}
        </select>
        <span className="font-normal text-ink-muted">{FEED_VIEWS[view].text}</span>
      </label>
    );
  return (
    <div>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {(Object.keys(FEED_VIEWS) as FeedView[]).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => onView(v)}
            className={cx(
              "min-h-10 rounded-full border px-3 text-sm font-semibold",
              view === v ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface text-ink hover:bg-muted",
            )}
          >
            {FEED_VIEWS[v].label}
            {counts ? ` · ${counts[v]}` : ""}
          </button>
        ))}
      </div>
      <p className="mt-1 text-sm text-ink-muted">{FEED_VIEWS[view].text}</p>
    </div>
  );
}

/** Who wrote it, in words: the badge comes from a seed flag or a verified grant, never from what the post says. */
export function Byline({ author }: { author: Post["author"] }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="font-semibold">{author.name}</span>
      {author.kind === "seed" && (
        <span className="rounded-full border border-dashed border-line-strong px-2 py-0.5 text-xs font-bold">
          {SEED_LABEL}
          {author.role ? ` · ${author.role}` : ""}
        </span>
      )}
      {author.kind === "verified" && (
        <span className="inline-flex items-center gap-1 rounded-full border border-[#0f5b3a] px-2 py-0.5 text-xs font-bold text-[#0f5b3a] dark:border-[#8fe0b5] dark:text-[#8fe0b5]">
          <Icon name="circle-check" className="size-3.5" aria-hidden /> {author.badge}
        </span>
      )}
      {author.kind === "member" && <span className="text-xs text-ink-muted">{author.role} (account role, not a verified badge)</span>}
    </p>
  );
}

export function PostCard({
  post: p,
  send,
  busy,
  canPost,
  textOnly,
  reasons,
  onSeen,
}: {
  post: Post;
  send: Send;
  busy: boolean;
  canPost: boolean;
  textOnly: boolean;
  reasons: CaseThreadView["reportReasons"];
  onSeen: (id: string) => void;
}) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const [comment, setComment] = useState<{ text: string; checked: boolean; key: string } | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // A peer approach counts as read once most of it has been on screen. Never your own.
  useEffect(() => {
    const el = ref.current;
    if (!el || p.mine || typeof IntersectionObserver === "undefined") {
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onSeen(p.id);
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [p.id, p.mine, onSeen]);

  const label = p.endorsement ? ENDORSED_LABEL : PEER_LABEL;
  return (
    <article
      ref={ref}
      aria-labelledby={`${id}-by`}
      className={cx(
        textOnly ? "border-t border-line pt-3" : "rounded-2xl border border-line bg-surface p-4 shadow-sm",
        p.endorsement && !textOnly && "border-2 border-[#0f5b3a]",
      )}
      onFocus={() => !p.mine && onSeen(p.id)}
    >
      <div id={`${id}-by`}>
        <Byline author={p.author} />
      </div>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {label}
        {p.endorsement && ` · reviewed by ${p.endorsement.by} on ${showDate(p.endorsement.at)} · case version ${p.endorsement.version}`}
        {!p.current && " · written under an earlier policy version"}
      </p>
      <p className="mt-2 whitespace-pre-line leading-relaxed">{p.body}</p>
      {p.why && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">Why coordinators found it useful: </span>
          {p.why}
        </p>
      )}
      {p.modNote && (
        <p className="mt-2 rounded-xl border border-line-strong p-2 text-sm">
          <span className="font-semibold">Moderator note: </span>
          {p.modNote}
        </p>
      )}
      <p className="mt-2 text-xs text-ink-muted">
        {showDate(p.at)}
        {p.editedAt && (
          <>
            {" · edited "}
            {showDate(p.editedAt)}
            {p.history.length > 0 && (
              <button type="button" className="ml-1 font-semibold underline" aria-expanded={showHistory} onClick={() => setShowHistory((s) => !s)}>
                {showHistory ? "Hide earlier wording" : "Show earlier wording"}
              </button>
            )}
          </>
        )}
        {" · "}
        {p.helpful === 0 ? "No helpful marks yet" : `${p.helpful} ${p.helpful === 1 ? "person" : "people"} found this helpful`}
      </p>
      {showHistory && (
        <ol className="mt-2 flex flex-col gap-2 border-l-2 border-line pl-3 text-sm text-ink-muted">
          {p.history.map((h, i) => (
            <li key={i}>
              <span className="font-semibold">Before {showDate(h.at)}:</span> <span className="whitespace-pre-line">{h.body}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {!p.mine && (
          <button
            type="button"
            aria-pressed={p.voted}
            disabled={busy || !canPost}
            onClick={() => send("vote", { postId: p.id, on: !p.voted })}
            className={cx(
              "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold disabled:opacity-50",
              p.voted ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface hover:bg-muted",
            )}
          >
            <Icon name="heart" className="size-4" aria-hidden /> {p.voted ? "Marked helpful (select to take it back)" : "Mark helpful"}
          </button>
        )}
        <button
          type="button"
          aria-pressed={p.saved}
          disabled={busy}
          onClick={() => send("save", { postId: p.id, on: !p.saved })}
          className={cx(
            "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold disabled:opacity-50",
            p.saved ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface hover:bg-muted",
          )}
        >
          <Icon name={p.saved ? "bookmark-filled" : "bookmark"} className="size-4" aria-hidden /> {p.saved ? "Script saved" : "Save script"}
        </button>
        {canPost && !comment && (
          <button type="button" className={quiet} disabled={busy} onClick={() => setComment({ text: "", checked: false, key: freshKey() })}>
            <Icon name="chat" className="size-4" aria-hidden /> Comment or ask
          </button>
        )}
        {!p.mine && !p.reported && report === null && (
          <button type="button" className={quiet} disabled={busy} onClick={() => setReport("")}>
            <Icon name="flag" className="size-4" aria-hidden /> Report
          </button>
        )}
        {p.reported && <span className="inline-flex min-h-10 items-center px-2 text-sm text-ink-muted">You reported this</span>}
      </div>

      {report !== null && (
        <form
          className="mt-2 flex flex-col gap-2 rounded-xl border border-line-strong p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (report && (await send("report", { target: "post", id: p.id, reason: report }))) setReport(null);
          }}
        >
          <fieldset>
            <legend className="text-sm font-semibold">What’s the concern?</legend>
            {Object.entries(reasons).map(([k, text]) => (
              <label key={k} className="flex min-h-10 items-center gap-2 text-sm">
                <input type="radio" name={`${id}-reason`} value={k} checked={report === k} onChange={() => setReport(k)} className="size-5" /> {text}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-ink-muted">It’s hidden while a moderator reviews it. If someone is in danger now, use the incident first steps instead.</p>
          <div className="flex gap-2">
            <button type="submit" className={secondary} disabled={busy || !report}>
              Send report
            </button>
            <button type="button" className={quiet} onClick={() => setReport(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {p.comments.length > 0 && (
        <ul aria-label="Comments" className="mt-3 flex flex-col gap-2 border-l-2 border-line pl-3">
          {p.comments.map((c) => (
            <li key={c.id} className="text-sm">
              <Byline author={c.author} />
              <p className="whitespace-pre-line">{c.body}</p>
              <p className="text-xs text-ink-muted">
                {showDate(c.at)}
                {c.mine && ` · ${c.statusText}`}
                {c.mine && c.note && `: ${c.note}`}
              </p>
              {!c.mine && c.status === "approved" && !c.reported && (
                <button
                  type="button"
                  className={cx(quiet, "-ml-3")}
                  disabled={busy}
                  onClick={() => send("report", { target: "comment", id: c.id, reason: "other" })}
                >
                  Report comment
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {comment && (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await send("comment", { postId: p.id, text: comment.text, checked: comment.checked, key: comment.key })) setComment(null);
          }}
        >
          <label className="text-sm font-semibold" htmlFor={`${id}-c`}>
            Your comment or question
          </label>
          <textarea
            id={`${id}-c`}
            className={cx(field, "min-h-20")}
            maxLength={1000}
            value={comment.text}
            onChange={(e) => setComment({ ...comment, text: e.target.value })}
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-5"
              checked={comment.checked}
              onChange={(e) => setComment({ ...comment, checked: e.target.checked })}
            />
            <span>
              Only the case’s fictional details, nothing happening now to a real person, and I understand a moderator reads it before anyone else sees it.
            </span>
          </label>
          <div className="flex gap-2">
            <button type="submit" className={secondary} disabled={busy || comment.text.trim().length < 3 || !comment.checked}>
              Send for moderation
            </button>
            <button type="button" className={quiet} onClick={() => setComment(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
