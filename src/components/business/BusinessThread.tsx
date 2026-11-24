"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { PRE_SUBMIT, URGENT_ROUTE, type ReplyLabel } from "@/lib/businessNotes";
import type { BusinessCardView } from "@/server/businessNotes";
import { Icon } from "../Icon";

/*
  A Business Field Note's one canonical discussion (docs/business-field-notes.md). Questions to the contributor and
  replies, each labelled: Contributor experience, Peer perspective, Approved Trilogy guidance, Needs owner review or
  Outdated. Approved guidance is always first. Before anything is posted, three questions; a live incident gets the
  incident route and is never posted; a held post says why and can be edited.
*/

type Thread = BusinessCardView["thread"];
type Question = Thread["questions"][number];
type Reply = Question["replies"][number];

export const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
export const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
/** A retry key for one post. randomUUID needs a secure page, so there's a fallback for plain-http reviewers on the office network. */
const freshKey = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const field = "min-h-11 rounded-xl border border-line-strong bg-bg px-3 py-2";
export const showDate = (d: string) =>
  d ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Brisbane" }).format(new Date(d)) : "";

const LABEL_STYLE: Record<ReplyLabel, string> = {
  approved: "bg-[#dff3e4] text-[#0d4a22] ring-[#9fd3ad] dark:bg-[#123d22] dark:text-[#cdeed6]",
  contributor: "bg-[#e6efff] text-[#14306b] ring-[#b9cdf5] dark:bg-[#1b2a4a] dark:text-[#d6e2ff]",
  peer: "bg-muted text-ink ring-line",
  owner_review: "bg-[#fff1cc] text-[#4a3400] ring-[#f0d68a]",
  outdated: "bg-bg text-ink-muted ring-line line-through",
};
export function LabelChip({ label, text }: { label: ReplyLabel; text: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1", LABEL_STYLE[label])}>
      {label === "approved" && <Icon name="circle-check" className="size-3.5" />}
      {text}
    </span>
  );
}

/** The live-incident route: shown instead of posting, and says nothing was lodged. */
export function UrgentRoute() {
  return (
    <div role="alert" className="rounded-2xl bg-[#fde7e4] p-4 text-[#5c1410] ring-1 ring-[#f3b3ab]">
      <p className="font-semibold">{URGENT_ROUTE.title}</p>
      <p className="mt-1">{URGENT_ROUTE.text}</p>
      <Link href={URGENT_ROUTE.href} className="mt-2 inline-flex min-h-11 items-center gap-1 font-semibold underline">
        {URGENT_ROUTE.linkText} <Icon name="arrow-right" className="size-4" />
      </Link>
      <p className="mt-1 text-sm">{URGENT_ROUTE.after}</p>
    </div>
  );
}

/**
  Writing a post: the three pre-submit questions come first, with an edit path. The key makes a retry (a double
  click, a dropped connection) land once.
*/
function Composer({
  label,
  placeholder,
  send,
  initial = "",
  onCancel,
  minLength = 3,
}: {
  label: string;
  placeholder?: string;
  send: (text: string, key: string) => Promise<{ route?: string } | null>;
  initial?: string;
  onCancel?: () => void;
  minLength?: number;
}) {
  const [text, setText] = useState(initial);
  const [stage, setStage] = useState<"write" | "check">("write");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const go = async () => {
    setBusy(true);
    const r = await send(text, key);
    setBusy(false);
    if (r?.route === "urgent") {
      setUrgent(true);
      setStage("write");
      return;
    }
    if (r) {
      setText("");
      setStage("write");
      setKey("");
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {stage === "write" ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">{label}</span>
            <textarea className={cx(field, "min-h-24")} maxLength={800} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primary}
              disabled={text.trim().length < minLength}
              onClick={() => {
                setUrgent(false);
                // Made here, in the click, never during render.
                setKey(key || freshKey());
                setStage("check");
              }}
            >
              Check, then post
            </button>
            {onCancel && (
              <button type="button" className={secondary} onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-2xl bg-bg p-4 ring-1 ring-line" role="group" aria-labelledby="pre-submit-h">
          <p id="pre-submit-h" className="font-semibold">
            Before you post, check:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {PRE_SUBMIT.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-muted">
            If any answer is yes, edit it first. A live care or incident decision goes to the incident process, not here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={primary} disabled={busy} onClick={() => void go()}>
              {busy ? "Posting…" : "I’ve checked: post it"}
            </button>
            <button type="button" className={secondary} onClick={() => setStage("write")}>
              Edit it
            </button>
          </div>
        </div>
      )}
      {urgent && <UrgentRoute />}
    </div>
  );
}

export function BusinessThread({
  noteId,
  thread,
  chapters,
  onChange,
}: {
  noteId: string;
  thread: Thread;
  chapters: { number: number; title: string }[];
  onChange: () => void;
}) {
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");
  const [chapter, setChapter] = useState(0);
  const [replying, setReplying] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const open = thread.state === "open";

  const send = async (body: Record<string, unknown>, done: string) => {
    setProblem("");
    try {
      const r = await api<{ route?: string }>("/api/business-notes", { body: { noteId, ...body } });
      if (r.route === "urgent") {
        setStatus("Not posted: this sounds like something happening now.");
        return r;
      }
      setStatus(r.route === "held" ? "Held for a moderator to check. You’ll see why below, and you can edit it." : done);
      onChange();
      return r;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work. Try again.");
      return null;
    }
  };

  const reply = (r: Reply) => (
    <li key={r.id} className={cx("rounded-2xl p-3 ring-1", r.label === "approved" ? "bg-[#f3fbf5] ring-[#9fd3ad] dark:bg-[#0f2a18]" : "bg-surface ring-line")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <LabelChip label={r.label} text={r.labelText} />
        <span className="font-semibold">{r.by}</span>
        <span className="text-ink-muted">
          {showDate(r.at)}
          {r.edited && " · edited"}
          {r.olderVersion && ` · about version ${r.noteVersion} of the card`}
        </span>
        {r.pinned && r.label !== "approved" && <span className="text-xs font-semibold">Pinned by a moderator</span>}
      </div>
      {r.body && <p className="mt-1 whitespace-pre-line">{r.body}</p>}
      {r.source && (
        <p className="mt-1 text-sm">
          Source:{" "}
          <Link href={r.source.href} className="font-semibold text-accent underline">
            {r.source.title}
          </Link>
        </p>
      )}
      {r.notice && <p className="mt-1 rounded-xl bg-[#fff1cc] p-2 text-sm text-[#4a3400]">{r.notice}</p>}
      {r.status === "held" && r.mine && heldTools(r.id, r.body)}
      {r.status === "posted" && (
        <div className="mt-2 flex flex-wrap gap-2">
          {!r.mine && (
            <button
              type="button"
              aria-pressed={r.mineHelpful}
              className={cx(secondary, "min-h-9 px-3 text-sm", r.mineHelpful && "bg-muted ring-2 ring-action")}
              onClick={() =>
                void send({ action: "reply-helpful", postId: r.id, on: !r.mineHelpful }, r.mineHelpful ? "Helpful vote removed." : "Marked helpful.")
              }
            >
              <Icon name="heart" className="size-4" /> Helpful · {r.helpful}
            </button>
          )}
          {!r.mine && r.label !== "approved" && (
            <button type="button" className={cx(secondary, "min-h-9 px-3 text-sm")} onClick={() => setReporting(reporting === r.id ? null : r.id)}>
              <Icon name="flag" className="size-4" /> Report
            </button>
          )}
        </div>
      )}
      {reporting === r.id && reportBox(r.id)}
    </li>
  );

  function heldTools(id: string, body: string) {
    return editing === id ? (
      <div className="mt-2">
        <Composer
          label="Edit your post"
          initial={body}
          onCancel={() => setEditing(null)}
          send={async (text) => {
            const r = await send({ action: "revise", postId: id, text, checked: true }, "Your edited post is up.");
            if (r) setEditing(null);
            return r;
          }}
        />
      </div>
    ) : (
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={cx(secondary, "min-h-9 px-3 text-sm")} onClick={() => setEditing(id)}>
          <Icon name="pen" className="size-4" /> Edit it
        </button>
        <button
          type="button"
          className={cx(secondary, "min-h-9 px-3 text-sm")}
          onClick={() => void send({ action: "withdraw-post", postId: id }, "Withdrawn.")}
        >
          Withdraw it
        </button>
      </div>
    );
  }

  function reportBox(id: string) {
    return (
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
          <span className="font-semibold">Why are you reporting it? (optional)</span>
          <input className={field} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button
          type="button"
          className={cx(secondary, "min-h-11 text-sm")}
          onClick={() =>
            void send({ action: "report", postId: id, reason }, "Reported. A moderator will look at it; it stays up until they do.").then(() => {
              setReporting(null);
              setReason("");
            })
          }
        >
          Send report
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      {status && (
        <p className="rounded-xl bg-muted p-2 text-sm" aria-hidden>
          {status}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-[#b3261e]">
          {problem}
        </p>
      )}
      <p className="text-sm text-ink-muted">
        Replies are labelled: peer experience isn’t Trilogy Care policy, and approved guidance always has a current source. This discussion isn’t watched in
        real time.
      </p>
      {thread.state !== "open" && (
        <p className="rounded-xl bg-[#fff1cc] p-3 text-[#4a3400]">
          {thread.state === "paused"
            ? "This discussion is paused."
            : thread.state === "withdrawn"
              ? "This card has been withdrawn."
              : "This discussion is closed."}{" "}
          {thread.reason}
          {thread.replacement && (
            <>
              {" "}
              <Link href={thread.replacement} className="font-semibold underline">
                Read the current guidance
              </Link>
            </>
          )}
        </p>
      )}

      {open && (
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <p className="text-sm text-ink-muted">
            {thread.takesQuestions
              ? `The contributor may answer${thread.answerWindow ? ` (${thread.answerWindow})` : ""}, but can’t promise to. Other principals and Trilogy Care may reply too.`
              : "The contributor isn’t taking questions at the moment. Other principals and Trilogy Care may still reply."}
          </p>
          {chapters.length > 0 && (
            <label className="mt-2 flex flex-col gap-1 text-sm">
              <span className="font-semibold">Your question is about</span>
              <select className={field} value={chapter} onChange={(e) => setChapter(Number(e.target.value))}>
                <option value={0}>The original card</option>
                {chapters.map((c) => (
                  <option key={c.number} value={c.number}>
                    Check-in: {c.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="mt-2">
            <Composer
              label="Ask the contributor"
              placeholder="Ask about the decision, the evidence, what failed or the trade-off."
              minLength={10}
              send={(text, key) => send({ action: "ask", text, key, chapter, checked: true }, "Your question is posted.")}
            />
          </div>
        </div>
      )}

      {thread.questions.length === 0 ? (
        <p className="text-ink-muted">No questions yet.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {thread.questions.map((q) => (
            <li key={q.id} className="rounded-3xl bg-bg p-4 ring-1 ring-line">
              <article aria-labelledby={`q-${q.id}`}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{q.by}</span>
                  <span className="text-ink-muted">
                    asked {showDate(q.at)}
                    {q.edited && " · edited"}
                    {q.chapter > 0 && ` · about check-in ${q.chapter}`}
                    {q.olderVersion && ` · about version ${q.noteVersion} of the card`}
                  </span>
                  {q.answered && (
                    <span className="rounded-full bg-[#dff3e4] px-2 py-0.5 text-xs font-bold text-[#0d4a22] dark:bg-[#123d22] dark:text-[#cdeed6]">
                      Answered
                    </span>
                  )}
                  {q.owner && <span className="rounded-full bg-[#fff1cc] px-2 py-0.5 text-xs font-bold text-[#4a3400]">With {q.owner}</span>}
                </div>
                <h3 id={`q-${q.id}`} className="mt-1 font-serif text-lg font-semibold">
                  {q.body || "This question was hidden by a moderator."}
                </h3>
                {q.notice && <p className="mt-1 rounded-xl bg-[#fff1cc] p-2 text-sm text-[#4a3400]">{q.notice}</p>}
                {q.status === "held" && q.mine && heldTools(q.id, q.body)}
                {q.replies.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2" aria-label="Replies">
                    {q.replies.map((r) => reply(r))}
                  </ul>
                )}
                {open && q.status === "posted" && (
                  <div className="mt-3">
                    {replying === q.id ? (
                      <Composer
                        label="Your reply"
                        placeholder="Share what you did, or would do, and why. Your experience, not a rule."
                        onCancel={() => setReplying(null)}
                        send={async (text, key) => {
                          const r = await send({ action: "reply", parentId: q.id, text, key, checked: true }, "Your reply is posted.");
                          if (r && r.route !== "urgent") setReplying(null);
                          return r;
                        }}
                      />
                    ) : (
                      <button type="button" className={cx(secondary, "min-h-9 px-3 text-sm")} onClick={() => setReplying(q.id)}>
                        <Icon name="chat" className="size-4" /> Reply
                      </button>
                    )}
                  </div>
                )}
              </article>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
