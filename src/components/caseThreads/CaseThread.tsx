"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import {
  CASE_AUDIENCE_PHRASES,
  COMPLETION_NOTE,
  EVIDENCE_NOTE,
  FICTIONAL_NOTICE,
  isComplete,
  LIVE_NOTICE,
  LIVE_ROUTE,
  NOTE_LABEL,
  PEER_LABEL,
  POST_STATUS,
  RUBRIC,
  SEED_LABEL,
  SHARE_CHECKS,
  takeAsPost,
  takeWords,
  THREAD_STATUS,
  type CaseThreadData,
  type Completion,
  type FeedView,
  type Take,
} from "@/lib/caseThread";
import type { CaseThreadView } from "@/server/caseThreads";
import { Icon } from "../Icon";
import { FeedViews, field, freshKey, PostCard, primary, quiet, secondary, showDate, type Feed, type Send } from "./CaseFeed";

/*
  "What Would You Do?" Community Case Thread (docs/case-threads.md), as the Magazine block and the Community page
  both show it. One component, one API: the thread's posts, votes, comments and moderation state come from the
  server's canonical thread, checked against the thread's own audience, so both places always agree.

  The journey: read the case → write a private first take (drafts are kept) → submit to compare → self-review →
  the pinned Quality-reviewed case note → the discussion → reflect and, if you like, revise (the first take stays as
  it was) → optionally share for moderation. Finishing takes the first take, the case note, at least one peer
  approach and a reflection. Votes, comments and sharing never count.

  `preview`: an author's preview of an unpublished block, drawn from the block itself with a choice of states.
*/

type View = CaseThreadView;
type Interrupt = { route: typeof LIVE_ROUTE; action: string; extra: Record<string, unknown> };
const PREVIEW_STATES = {
  locked: "Before a first take",
  unlocked: "After a first take",
  empty: "No responses yet",
  unavailable: "Discussion unavailable",
  archived: "Archived case",
} as const;
type PreviewState = keyof typeof PREVIEW_STATES;

/** What an author's preview shows: the block's own case, note and seeds, in the chosen state. Nothing is sent. */
function previewView(d: CaseThreadData, state: PreviewState): View {
  const unlocked = state !== "locked";
  const take: Take = { say: "(Your first take appears here.)", do: "", who: "" };
  const posts = state === "empty" ? [] : d.seeds.filter((s) => s.body);
  const feed: Feed = {
    view: "helpful",
    total: posts.length,
    next: null,
    counts: { helpful: posts.length, others: 0, recent: posts.length, all: posts.length },
    posts: posts.map((s) => ({
      id: `preview-${s.id}`,
      kind: "seed" as const,
      author: { name: `${s.name} (fictional)`, role: s.role, badge: SEED_LABEL, kind: "seed" as const },
      body: s.body,
      why: s.why,
      at: "",
      editedAt: null,
      history: [],
      helpful: 0,
      voted: false,
      saved: false,
      reported: false,
      mine: false,
      endorsed: false,
      endorsement: null,
      label: PEER_LABEL,
      modNote: "",
      caseVersion: 1,
      current: true,
      comments: [],
    })),
  };
  const completion: Completion = { firstTake: unlocked, note: false, peer: false, reflection: false };
  return {
    thread: {
      id: d.threadId,
      version: 1,
      status: state === "archived" ? "archived" : "open",
      statusText: state === "archived" ? THREAD_STATUS.archived : THREAD_STATUS.open,
      statusReason: state === "archived" ? "Preview: an archived case is read-only." : "",
      policy: { title: d.policy.title, version: d.policy.version },
      reviewDue: d.reviewDue,
      reviewOverdue: false,
      audience: d.audience.map((a) => CASE_AUDIENCE_PHRASES[a]),
      href: `/community/cases/${d.threadId}`,
      responses: posts.length,
    },
    case: {
      title: d.title,
      role: d.role,
      aim: d.aim,
      scene: d.scene,
      people: d.people,
      known: d.known,
      unknowns: d.unknowns,
      safetyCue: d.safetyCue,
      related: d.related,
      prompts: d.prompts,
      words: d.words,
      reflection: d.reflection,
    },
    live: LIVE_ROUTE,
    attempt: {
      started: unlocked,
      draft: { say: "", do: "", who: "" },
      firstTake: unlocked ? take : null,
      submittedAt: unlocked ? "preview" : null,
      caseVersion: 1,
      checklist: [],
      reflection: "",
      revised: null,
      reflectedAt: null,
      completion,
      complete: false,
      completedAt: null,
    },
    unlocked,
    note: unlocked ? { ...d.caseNote, policy: d.policy, reviewDue: d.reviewDue, version: 1, approvedOn: d.approval.approvedOn } : null,
    checklist: unlocked ? d.checklist : [],
    feed: unlocked && state !== "unavailable" ? feed : null,
    feedProblem: state === "unavailable" ? "Discussion temporarily unavailable. Your first take is saved; come back to compare later." : "",
    mine: [],
    saved: [],
    canPost: false,
    shareChecks: SHARE_CHECKS,
    reportReasons: {
      identifying: "Could identify a real person",
      live: "About something happening now to a real person",
      unsafe: "Unsafe or outdated advice",
      disrespectful: "Disrespectful or abusive",
      other: "Something else",
    },
  } as View;
}

export function CaseThread({
  threadId,
  preview,
  onComplete,
  place,
}: {
  threadId: string;
  /** An author's preview: the block's own data, with nothing sent to the server. */
  preview?: CaseThreadData;
  onComplete?: () => void;
  place: "magazine" | "community";
}) {
  const id = useId();
  const [data, setData] = useState<View | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const [interrupt, setInterrupt] = useState<Interrupt | null>(null);
  const [feedView, setFeedView] = useState<FeedView>("helpful");
  const [more, setMore] = useState<Feed["posts"]>([]);
  const [textOnly, setTextOnly] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>("locked");
  const seen = useRef(new Set<string>());
  const noteSent = useRef(false);
  const completeSent = useRef(false);
  const view = preview ? previewView(preview, previewState) : data;

  useEffect(() => {
    if (preview) {
      return;
    }
    let live = true;
    api<View>(`/api/case-threads?id=${encodeURIComponent(threadId)}`).then(
      (v) => {
        if (live) setData(v);
      },
      (e: Error) => {
        if (live) setLoadError((e as { status?: number }).status === 404 ? "notfound" : e.message);
      },
    );
    return () => {
      live = false;
    };
  }, [threadId, preview]);

  // Finished on the server's record: the page is told once.
  useEffect(() => {
    if (data?.attempt.complete && !completeSent.current) {
      completeSent.current = true;
      onComplete?.();
    }
  }, [data?.attempt.complete, onComplete]);

  const send: Send = useCallback(
    async (action, extra = {}) => {
      if (preview) return false;
      setBusy(true);
      setProblem(null);
      try {
        const r = await api<View | { interrupt: typeof LIVE_ROUTE }>("/api/case-threads", { body: { threadId, action, view: feedView, ...extra } });
        if ("interrupt" in r) {
          setInterrupt({ route: r.interrupt, action, extra });
          return false;
        }
        setInterrupt(null);
        setData(r);
        setMore([]);
        setSaid(
          {
            draft: "Draft saved. Only you can see it.",
            submit: "First take saved privately. The case note and discussion are open below.",
            vote: "Helpful mark updated.",
            comment: "Comment sent. A moderator reads it before anyone else sees it.",
            save: "Saved scripts updated.",
            reflect: "Reflection saved. Your first take is unchanged.",
            share: "Sent for moderation. Nobody else sees it until a moderator publishes it.",
            edit: "Edit sent for moderation.",
            withdraw: "Withdrawn.",
            report: "Report sent. It’s hidden while a moderator reviews it.",
            checklist: "Self-review saved.",
          }[action] ?? "Saved.",
        );
        return true;
      } catch (e) {
        setProblem((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [preview, threadId, feedView],
  );

  /** Recorded once each; these never change what's shown, only the progress line. */
  const mark = useCallback(
    async (action: "viewed-note" | "viewed-peer", postId?: string) => {
      if (preview) return;
      try {
        const r = await api<{ completion: Completion }>("/api/case-threads", { body: { threadId, action, postId } });
        setData((v) => (v ? { ...v, attempt: { ...v.attempt, completion: r.completion, complete: isComplete(r.completion) } } : v));
      } catch {
        // Not shown as viewed if it couldn't be recorded (a paused discussion, say).
      }
    },
    [preview, threadId],
  );
  const onSeen = useCallback(
    (postId: string) => {
      if (seen.current.has(postId)) return;
      seen.current.add(postId);
      void mark("viewed-peer", postId);
    },
    [mark],
  );
  const noteRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = noteRef.current;
    if (!el || !data?.note || data.attempt.completion.note || noteSent.current || typeof IntersectionObserver === "undefined") {
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !noteSent.current) {
          noteSent.current = true;
          void mark("viewed-note");
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [data?.note, data?.attempt.completion.note, mark]);

  async function changeView(v: FeedView) {
    setFeedView(v);
    setMore([]);
    if (preview) return;
    try {
      setData(await api<View>(`/api/case-threads?id=${encodeURIComponent(threadId)}&view=${v}`));
    } catch (e) {
      setProblem((e as Error).message);
    }
  }
  async function loadMore(cursor: string) {
    try {
      const v = await api<View>(`/api/case-threads?id=${encodeURIComponent(threadId)}&view=${feedView}&cursor=${cursor}`);
      setMore((m) => [...m, ...(v.feed?.posts ?? [])]);
      setData((d) => (d && v.feed && d.feed ? { ...d, feed: { ...d.feed, next: v.feed.next } } : d));
    } catch (e) {
      setProblem((e as Error).message);
    }
  }

  if (loadError === "notfound")
    return (
      <section className="mx-auto w-full max-w-[42rem] rounded-3xl border border-line-strong bg-surface p-5">
        <p className="font-semibold">This case discussion isn’t available to you.</p>
        <p className="text-sm text-ink-muted">It may be for another role, or not published yet.</p>
      </section>
    );
  if (loadError)
    return (
      <section className="mx-auto w-full max-w-[42rem] rounded-3xl border border-line-strong bg-surface p-5" role="alert">
        <p className="font-semibold">Discussion temporarily unavailable.</p>
        <p className="text-sm text-ink-muted">{loadError} Try again in a moment; nothing you’d saved is lost.</p>
      </section>
    );
  if (!view)
    return (
      <section className="mx-auto w-full max-w-[42rem] rounded-3xl border border-line-strong bg-surface p-5" aria-busy="true">
        <p className="text-ink-muted">Loading the case…</p>
      </section>
    );

  const c = view.case;
  const a = view.attempt;
  const feedPosts = [...(view.feed?.posts ?? []), ...more];
  const done = a.completion;
  return (
    <section aria-labelledby={`${id}-title`} className={"mx-auto flex w-full max-w-[46rem] flex-col gap-4"}>
      {preview && (
        <div className="rounded-2xl border border-dashed border-line-strong p-3 text-sm">
          <label className="flex flex-wrap items-center gap-2 font-semibold">
            Preview state
            <select
              className="min-h-10 rounded-xl border border-line-strong bg-surface px-2"
              value={previewState}
              onChange={(e) => setPreviewState(e.target.value as PreviewState)}
            >
              {(Object.keys(PREVIEW_STATES) as PreviewState[]).map((s) => (
                <option key={s} value={s}>
                  {PREVIEW_STATES[s]}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1 text-ink-muted">The discussion opens when the course is published. Nothing you do in a preview is saved.</p>
        </div>
      )}

      <header className={cx(!textOnly && "rounded-3xl border border-line-strong bg-surface p-5 sm:p-7")}>
        <p className="flex flex-wrap items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
          <Icon name="chat" className="size-5" aria-hidden /> What would you do?
        </p>
        <h2 id={`${id}-title`} className="mt-1 font-serif text-2xl font-semibold">
          {c.title}
        </h2>
        <p className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-xs font-bold">
          {FICTIONAL_NOTICE}
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          {view.thread.statusText}
          {view.thread.statusReason && `: ${view.thread.statusReason}`}
          {view.thread.audience.length > 0 && ` · For ${view.thread.audience.join(" and ")}`}
          {" · "}
          {view.thread.responses} approved {view.thread.responses === 1 ? "response" : "responses"}
          {place === "magazine" && !preview && (
            <>
              {" · "}
              <Link href={view.thread.href} className="font-semibold underline">
                The same discussion in Community
              </Link>
            </>
          )}
        </p>
        <label className="mt-2 flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={textOnly} onChange={(e) => setTextOnly(e.target.checked)} /> Text-only view
        </label>

        <div className="mt-3 flex flex-col gap-3 leading-relaxed">
          <p className="text-sm">
            <span className="font-semibold">Your role: </span>
            {c.role}
          </p>
          <p className="whitespace-pre-line">{c.scene}</p>
          <div className={cx("grid gap-3", !textOnly && "sm:grid-cols-2")}>
            <div>
              <h3 className="font-semibold">What you know</h3>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {c.known.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">What you don’t know yet</h3>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {c.unknowns.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">The aim: </span>
            {c.aim}
          </p>
        </div>
      </header>

      <aside aria-label="Live concerns" className="rounded-2xl border-2 border-danger/70 bg-surface p-4 text-sm">
        <p className="flex items-start gap-2 font-semibold">
          <Icon name="alert" className="mt-0.5 size-5 shrink-0" aria-hidden /> {LIVE_NOTICE}
        </p>
        <p className="mt-1">{c.safetyCue}</p>
        <Link href={view.live.href} className="mt-1 inline-flex min-h-10 items-center font-semibold underline">
          {view.live.linkText}
        </Link>
      </aside>

      {interrupt && (
        <div role="alert" className="rounded-2xl border-2 border-danger bg-surface p-4">
          <p className="font-semibold">{interrupt.route.title}</p>
          <p className="mt-1 text-sm">{interrupt.route.text}</p>
          <p className="mt-1 text-sm text-ink-muted">{interrupt.route.after}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href={interrupt.route.href} className={primary}>
              {interrupt.route.linkText}
            </Link>
            <button
              type="button"
              className={secondary}
              onClick={() => {
                const { action, extra } = interrupt;
                setInterrupt(null);
                void send(action, { ...extra, fictional: true });
              }}
            >
              It’s about the fictional case: continue
            </button>
          </div>
        </div>
      )}

      {!view.unlocked ? (
        <FirstTake key={`take-${a.started}`} view={view} send={send} busy={busy || Boolean(preview)} textOnly={textOnly} />
      ) : (
        <>
          <details className={cx(!textOnly && "rounded-2xl border border-line bg-surface p-4")}>
            <summary className="min-h-10 cursor-pointer font-semibold">
              Your first take (private, kept as you wrote it{a.submittedAt && a.submittedAt !== "preview" ? ` on ${showDate(a.submittedAt)}` : ""})
            </summary>
            <TakeText take={a.firstTake} prompts={c.prompts} />
          </details>

          {view.checklist.length > 0 && (
            <Checklist key={`check-${a.checklist.join()}`} items={view.checklist} ticks={a.checklist} send={send} busy={busy || Boolean(preview)} />
          )}

          {view.note && (
            <section
              ref={noteRef}
              aria-labelledby={`${id}-note`}
              className={cx(
                "rounded-3xl border-[3px] border-[#1f4e79] bg-surface p-5 dark:border-[#9cc3ec]",
                textOnly && "rounded-none border-x-0 border-b-0 px-0",
              )}
            >
              <p className="flex items-center gap-2 font-mulish text-xs font-extrabold uppercase tracking-[0.14em]">
                <Icon name="pin" className="size-4" aria-hidden /> Pinned · {NOTE_LABEL}
              </p>
              <h3 id={`${id}-note`} className="mt-1 font-serif text-xl font-semibold">
                {view.note.title}
              </h3>
              <p className="mt-1 text-xs text-ink-muted">
                Editorial guidance, not a community post. Case version {view.note.version}
                {view.note.policy.title && ` · ${view.note.policy.title}`}
                {view.note.policy.version && `, version ${view.note.policy.version}`}
                {view.note.approvedOn && ` · approved ${showDate(view.note.approvedOn)}`}
                {view.note.reviewDue && ` · next review ${showDate(view.note.reviewDue)}`}
              </p>
              {view.thread.reviewOverdue && (
                <p className="mt-2 flex items-start gap-1.5 rounded-xl border-2 border-danger/70 p-2 text-sm font-semibold">
                  <Icon name="alert" className="mt-0.5 size-4 shrink-0" aria-hidden /> This case note is past its review date. Check it against current policy
                  before relying on it.
                </p>
              )}
              <p className="mt-2 whitespace-pre-line leading-relaxed">{view.note.summary}</p>
              {view.note.boundaries.length > 0 && (
                <>
                  <h4 className="mt-3 font-semibold">Decision boundaries</h4>
                  <ul className="mt-1 list-disc pl-5">
                    {view.note.boundaries.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </>
              )}
              {view.note.teach && (
                <>
                  <h4 className="mt-3 font-semibold">A way to say it</h4>
                  <blockquote className="mt-1 border-l-4 border-line-strong pl-3 italic">{view.note.teach}</blockquote>
                </>
              )}
              {view.note.sources.length > 0 && (
                <>
                  <h4 className="mt-3 font-semibold">Sources</h4>
                  <ul className="mt-1 flex flex-col gap-1 text-sm">
                    {view.note.sources.map((s) => (
                      <li key={s.title}>
                        {s.href ? (
                          <a href={s.href} target="_blank" rel="noreferrer" className="underline">
                            {s.title}
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        ) : (
                          s.title
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!done.note && !preview && (
                <button type="button" className={cx(quiet, "mt-2")} onClick={() => void mark("viewed-note")}>
                  I’ve read the case note
                </button>
              )}
            </section>
          )}

          <section aria-labelledby={`${id}-disc`} className="flex flex-col gap-3">
            <h3 id={`${id}-disc`} className="font-serif text-xl font-semibold">
              The discussion
            </h3>
            <p className="text-sm text-ink-muted">
              Peer responses are ideas from colleagues, not policy. Helpful marks show useful phrasing or reasoning; they never make a response official.
            </p>
            {view.feedProblem ? (
              <p role="status" className="rounded-2xl border border-line-strong p-4">
                {view.feedProblem}
              </p>
            ) : (
              view.feed && (
                <>
                  <FeedViews
                    view={feedView}
                    counts={view.feed.counts}
                    onView={(v) => void changeView(v)}
                    textOnly={textOnly}
                    label="Sort and filter responses"
                  />
                  <p className="sr-only" role="status">
                    {view.feed.total} responses in this view.
                  </p>
                  {feedPosts.length === 0 && (
                    <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-ink-muted">
                      {feedView === "others" ? "No responses from other roles yet." : "No approved responses here yet. Come back later to compare."}
                    </p>
                  )}
                  <div className={cx("flex flex-col", textOnly ? "gap-3" : "gap-3")}>
                    {feedPosts.map((p) => (
                      <PostCard
                        key={p.id}
                        post={p}
                        send={send}
                        busy={busy || Boolean(preview)}
                        canPost={view.canPost}
                        textOnly={textOnly}
                        reasons={view.reportReasons}
                        onSeen={onSeen}
                      />
                    ))}
                  </div>
                  {view.feed.next && (
                    <button type="button" className={cx(secondary, "self-start")} onClick={() => void loadMore(view.feed!.next!)}>
                      Show more responses
                    </button>
                  )}
                </>
              )
            )}
          </section>

          <Reflection key={`refl-${a.reflectedAt ?? "none"}`} view={view} send={send} busy={busy || Boolean(preview)} />
          <Share view={view} send={send} busy={busy || Boolean(preview)} />
          {view.saved.length > 0 && <SavedScripts view={view} send={send} busy={busy} />}
        </>
      )}

      {problem && (
        <p role="alert" className="rounded-2xl border border-danger/60 p-3 text-sm">
          {problem}
        </p>
      )}
      <p role="status" className="sr-only">
        {said}
      </p>
      {said && !problem && <p className="text-sm font-semibold text-accent">{said}</p>}

      <section aria-label="Your progress" className="rounded-2xl bg-muted p-4 text-sm">
        <p className="font-semibold">{a.complete ? "Finished." : "To finish this case:"}</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {(
            [
              ["firstTake", "A private first take"],
              ["note", "The case note read"],
              ["peer", "At least one peer approach read"],
              ["reflection", "A reflection"],
            ] as const
          ).map(([k, label]) => (
            <li key={k}>
              {done[k] ? "Done: " : "Still to do: "}
              {label}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-ink-muted">
          {COMPLETION_NOTE} {EVIDENCE_NOTE}
        </p>
      </section>
    </section>
  );
}

function TakeText({ take, prompts }: { take: Take | null; prompts: View["case"]["prompts"] }) {
  if (!take) return null;
  return (
    <dl className="mt-2 flex flex-col gap-2 text-sm">
      {(["say", "do", "who"] as const).map((k) =>
        take[k] ? (
          <div key={k}>
            <dt className="font-semibold">{prompts[k]}</dt>
            <dd className="whitespace-pre-line">{take[k]}</dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}

function TakeFields({
  take,
  onChange,
  prompts,
  idBase,
  disabled,
}: {
  take: Take;
  onChange: (t: Take) => void;
  prompts: View["case"]["prompts"];
  idBase: string;
  disabled: boolean;
}) {
  return (
    <>
      {(["say", "do", "who"] as const).map((k) => (
        <div key={k} className="flex flex-col gap-1">
          <label htmlFor={`${idBase}-${k}`} className="font-semibold">
            {prompts[k]}
          </label>
          <textarea
            id={`${idBase}-${k}`}
            className={cx(field, k === "who" ? "min-h-16" : "min-h-24")}
            value={take[k]}
            maxLength={3000}
            disabled={disabled}
            onChange={(e) => onChange({ ...take, [k]: e.target.value })}
          />
        </div>
      ))}
    </>
  );
}

function FirstTake({ view, send, busy, textOnly }: { view: View; send: Send; busy: boolean; textOnly: boolean }) {
  const id = useId();
  const c = view.case;
  const [take, setTake] = useState<Take>(view.attempt.draft);
  const words = takeWords(take);
  return (
    <section aria-labelledby={`${id}-h`} className={cx("flex flex-col gap-3", !textOnly && "rounded-3xl border border-line-strong bg-surface p-5 sm:p-7")}>
      <h3 id={`${id}-h`} className="font-serif text-xl font-semibold">
        Your first take
      </h3>
      <p className="text-sm text-ink-muted">
        Private: only you see it. Write it before you see anyone else’s, then compare. About {c.words.min} to {c.words.max} words is plenty; it’s a guide, not a
        limit.
      </p>
      <TakeFields take={take} onChange={setTake} prompts={c.prompts} idBase={id} disabled={busy} />
      <p className="text-sm text-ink-muted" aria-live="polite">
        {words} {words === 1 ? "word" : "words"}
      </p>
      <p className="text-sm">
        Submitting keeps your first take exactly as written and opens the case note and the discussion. You can add a revised answer afterwards. Sharing
        publicly is a separate choice, later.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={busy || !take.say.trim() || words < 15} onClick={() => void send("submit", { take })}>
          Submit privately and compare
        </button>
        <button type="button" className={secondary} disabled={busy || words === 0} onClick={() => void send("draft", { take })}>
          Save draft
        </button>
      </div>
      {view.thread.responses > 0 && (
        <p className="text-sm font-semibold text-accent">
          {view.thread.responses} approved {view.thread.responses === 1 ? "response is" : "responses are"} waiting, with a Quality-reviewed case note. Submit
          yours to see them.
        </p>
      )}
    </section>
  );
}

function Checklist({ items, ticks, send, busy }: { items: string[]; ticks: boolean[]; send: Send; busy: boolean }) {
  const [t, setT] = useState<boolean[]>(items.map((_, i) => Boolean(ticks[i])));
  return (
    <fieldset className="rounded-2xl border border-line bg-surface p-4">
      <legend className="px-1 font-semibold">Before you read the replies: a quick self-review</legend>
      <p className="text-sm text-ink-muted">Private, and for you only. Tick what your first take covered.</p>
      <div className="mt-2 flex flex-col gap-1">
        {items.map((x, i) => (
          <label key={x} className="flex min-h-10 items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-5" checked={t[i]} onChange={(e) => setT(t.map((v, j) => (j === i ? e.target.checked : v)))} /> {x}
          </label>
        ))}
      </div>
      <button type="button" className={cx(quiet, "mt-1")} disabled={busy} onClick={() => void send("checklist", { ticks: t })}>
        Save my self-review
      </button>
    </fieldset>
  );
}

function Reflection({ view, send, busy }: { view: View; send: Send; busy: boolean }) {
  const id = useId();
  const a = view.attempt;
  const [text, setText] = useState(a.reflection);
  const [revising, setRevising] = useState(Boolean(a.revised));
  const [revised, setRevised] = useState<Take>(a.revised ?? a.firstTake ?? { say: "", do: "", who: "" });
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3 rounded-3xl border border-line-strong bg-surface p-5">
      <h3 id={`${id}-h`} className="font-serif text-xl font-semibold">
        Reflect, and revise if you like
      </h3>
      <label htmlFor={`${id}-r`} className="font-semibold">
        {view.case.reflection}
      </label>
      <textarea id={`${id}-r`} className={cx(field, "min-h-24")} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
      <details className="text-sm">
        <summary className="min-h-10 cursor-pointer font-semibold">What a good response shows</summary>
        <dl className="mt-1 flex flex-col gap-1">
          {RUBRIC.map((r) => (
            <div key={r.id}>
              <dt className="inline font-semibold">{r.label}: </dt>
              <dd className="inline">{r.text}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-1 text-ink-muted">For your own review. Nothing here is scored.</p>
      </details>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" className="size-5" checked={revising} onChange={(e) => setRevising(e.target.checked)} /> Save a revised answer too (private; your
        first take stays as it was)
      </label>
      {revising && <TakeFields take={revised} onChange={setRevised} prompts={view.case.prompts} idBase={`${id}-v`} disabled={busy} />}
      <button
        type="button"
        className={cx(primary, "self-start")}
        disabled={busy || !text.trim()}
        onClick={() => void send("reflect", { reflection: text, ...(revising && { revised }) })}
      >
        Save reflection
      </button>
      {a.reflectedAt && a.reflectedAt !== "preview" && <p className="text-sm text-ink-muted">Last saved {showDate(a.reflectedAt)}.</p>}
    </section>
  );
}

function Share({ view, send, busy }: { view: View; send: Send; busy: boolean }) {
  const id = useId();
  const a = view.attempt;
  const [open, setOpen] = useState(false);
  const [which, setWhich] = useState<"first" | "revised">(a.revised ? "revised" : "first");
  const [checks, setChecks] = useState<boolean[]>(SHARE_CHECKS.map(() => false));
  const [key, setKey] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string; checked: boolean } | null>(null);
  const take = which === "revised" ? a.revised : a.firstTake;
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
      <h3 id={`${id}-h`} className="font-serif text-xl font-semibold">
        Share your response (optional)
      </h3>
      <p className="text-sm text-ink-muted">You can finish this case without sharing anything. If you share, a moderator reads it first.</p>
      {view.mine.length > 0 && (
        <ul aria-label="What you’ve shared" className="flex flex-col gap-2">
          {view.mine.map((m) => (
            <li key={m.id} className="rounded-2xl border border-line p-3 text-sm">
              <p className="font-semibold">
                {POST_STATUS[m.status as keyof typeof POST_STATUS] ?? m.statusText}
                {m.note && `: ${m.note}`}
              </p>
              {editing?.id === m.id ? (
                <form
                  className="mt-2 flex flex-col gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await send("edit", { postId: m.id, text: editing.text, checked: editing.checked })) setEditing(null);
                  }}
                >
                  <label htmlFor={`${id}-e`} className="font-semibold">
                    Your wording
                  </label>
                  <textarea
                    id={`${id}-e`}
                    className={cx(field, "min-h-32")}
                    value={editing.text}
                    onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                  />
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5"
                      checked={editing.checked}
                      onChange={(e) => setEditing({ ...editing, checked: e.target.checked })}
                    />
                    <span>I’ve checked it against the three checks below. Earlier wording stays visible as edit history.</span>
                  </label>
                  <div className="flex gap-2">
                    <button type="submit" className={secondary} disabled={busy || !editing.checked}>
                      Send the edit for moderation
                    </button>
                    <button type="button" className={quiet} onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <p className="mt-1 whitespace-pre-line">{m.body}</p>
              )}
              {!editing && (
                <div className="mt-1 flex gap-1">
                  {m.editable && view.canPost && (
                    <button type="button" className={quiet} onClick={() => setEditing({ id: m.id, text: m.body, checked: false })}>
                      Edit
                    </button>
                  )}
                  <button type="button" className={quiet} disabled={busy} onClick={() => void send("withdraw", { postId: m.id })}>
                    Withdraw
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!view.canPost ? (
        <p className="text-sm text-ink-muted">Sharing is closed while the discussion is {view.thread.statusText.toLowerCase()}.</p>
      ) : !open ? (
        <button
          type="button"
          className={cx(secondary, "self-start")}
          onClick={() => {
            setOpen(true);
            setKey(freshKey());
          }}
        >
          Share my response…
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {a.revised && (
            <fieldset>
              <legend className="text-sm font-semibold">Which version?</legend>
              {(["first", "revised"] as const).map((w) => (
                <label key={w} className="flex min-h-10 items-center gap-2 text-sm">
                  <input type="radio" name={`${id}-which`} className="size-5" checked={which === w} onChange={() => setWhich(w)} />
                  {w === "first" ? "My first take" : "My revised answer"}
                </label>
              ))}
            </fieldset>
          )}
          <div>
            <p className="text-sm font-semibold">Preview: how it will read</p>
            <p className="mt-1 whitespace-pre-line rounded-2xl bg-muted p-3 text-sm">{take ? takeAsPost(take) : "Nothing to share yet."}</p>
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-semibold">Check before sharing</legend>
            {SHARE_CHECKS.map((x, i) => (
              <label key={x} className="flex min-h-10 items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5"
                  checked={checks[i]}
                  onChange={(e) => setChecks(checks.map((v, j) => (j === i ? e.target.checked : v)))}
                />{" "}
                {x}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primary}
              disabled={busy || !take || !checks.every(Boolean)}
              onClick={async () => {
                if (await send("share", { which, checked: true, key })) {
                  setOpen(false);
                  setChecks(SHARE_CHECKS.map(() => false));
                }
              }}
            >
              Send for moderation
            </button>
            <button type="button" className={quiet} onClick={() => setOpen(false)}>
              Not now
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function SavedScripts({ view, send, busy }: { view: View; send: Send; busy: boolean }) {
  return (
    <section aria-label="Your saved scripts" className="flex flex-col gap-2 rounded-3xl border border-line bg-surface p-5">
      <h3 className="font-serif text-xl font-semibold">Your saved scripts</h3>
      <p className="text-sm text-ink-muted">Private to you. A peer idea stays a peer idea unless a moderator endorses it.</p>
      <ul className="flex flex-col gap-2">
        {view.saved.map((s) => (
          <li key={s.postId} className="rounded-2xl border border-line p-3 text-sm">
            <p className="font-semibold">
              {s.label}
              {s.endorsement && ` · reviewed by ${s.endorsement.by} on ${showDate(s.endorsement.at)}`}
            </p>
            <p className="text-xs text-ink-muted">
              By {s.author} · case version {s.caseVersion} · policy {s.policyVersion || "unversioned"} · saved {showDate(s.savedAt)}
            </p>
            {s.stale.map((w) => (
              <p key={w} className="mt-1 flex items-start gap-1.5 font-semibold">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0" aria-hidden /> Check before using: {w}
              </p>
            ))}
            <p className="mt-1 whitespace-pre-line">{s.body}</p>
            <button type="button" className={cx(quiet, "-ml-3 mt-1")} disabled={busy} onClick={() => void send("save", { postId: s.postId, on: false })}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
