"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { useHydrated } from "@/lib/store";
import type { RedPenBlock } from "@/lib/magazine";
import {
  applyReplacements,
  blankAttempt,
  CHECK_NOTE,
  diffWords,
  emptyRedPen,
  MODES,
  readAttempt,
  REASONS,
  REDPEN_NOTICE,
  RESULTS,
  submit,
  submitProblems,
  type Attempt,
  type Feedback,
  type Reason,
  type RedPenState,
  type Result,
} from "@/lib/redpen";
import { posts } from "@/content/community";
import type { redPenState } from "@/server/redpen";
import { Icon } from "../Icon";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  Red Pen (docs/red-pen.md). A pinned briefing card beside a clipboard. Each line of the flawed document can be
  marked with the red pen (a reason, why, and optional replacement text) or left with a note on why; every mark is
  labelled in words, never red alone. Then the whole rewrite, any escalation decision, a self-check, and a private
  submission. Feedback, the reviewed rewrite and the case discussion come after the first submission. The
  comparison has a keyboard slider and a one-after-another view with word differences.

  In the editor's preview everything is worked out on the page and nothing is stored.
*/

type Loaded = ReturnType<typeof redPenState>;
type View = Omit<Loaded, "attemptId">;
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warn = "rounded-2xl bg-[#fff1cc] p-3 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const tone: Record<Result, string> = {
  strong: "rounded-2xl bg-[#e3f4e8] p-3 text-[#0f3d1f] dark:bg-[#123321] dark:text-[#b6ecc8]",
  revision: warn,
  critical: "rounded-2xl bg-[#fde2e0] p-3 text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]",
};
const paper = "rounded-3xl bg-[#fbf8f1] p-5 text-[#1f2933] shadow-md ring-1 ring-[#e7dfcc] dark:bg-[#2a2722] dark:text-[#f3efe6] dark:ring-[#3d382f]";
const ink = "text-[#b3261e] dark:text-[#ff8a80]";
const showDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`))
    : "";

function localView(b: RedPenBlock, state: RedPenState): View {
  const submitted = state.submissions.length > 0;
  const post = posts.find((p) => p.id === b.communityPostId);
  return {
    state,
    feedback: submitted ? readAttempt(b, state.submissions[state.submissions.length - 1]) : null,
    first: submitted ? state.submissions[0] : null,
    reviewed: submitted ? b.reviewed : null,
    thread: submitted && post ? { id: post.id, title: post.title } : null,
    stale: false,
    earlierKey: false,
  };
}

export function RedPen({ block: b, ctx }: { block: RedPenBlock; ctx: InteractiveContext }) {
  const hydrated = useHydrated();
  const url = `/api/magazine/${ctx.guideId}/redpen`;
  const loaded = useApi<Loaded>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [v, setV] = useState<View | null>(null);
  const [draft, setDraft] = useState<Attempt | null>(null);
  const [editing, setEditing] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const top = useRef<HTMLHeadingElement>(null);
  const editTop = useRef<HTMLHeadingElement>(null);
  /** Set when the learner moves between editing and feedback, so focus follows once the new view has rendered. */
  const jump = useRef(false);
  useEffect(() => {
    if (!jump.current) return;
    jump.current = false;
    const el = editing ? editTop.current : top.current;
    el?.focus();
    el?.scrollIntoView({ block: "start" });
  }, [editing, v]);

  if (ctx.preview && hydrated && v === null) setV(localView(b, emptyRedPen()));
  if (!ctx.preview && loaded.data && v === null) setV(loaded.data);
  if (v && draft === null) {
    const last = v.state.submissions[v.state.submissions.length - 1];
    setDraft(v.state.draft ?? (last ? structuredClone(last) : blankAttempt(b)));
    setEditing(!v.feedback || Boolean(v.state.draft));
  }

  useEffect(() => {
    if (ctx.preview || !draft || !dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      api(url, { body: { blockId: b.id, draft } }).catch(() => undefined);
    }, 800);
    return () => clearTimeout(t);
  }, [draft, ctx.preview, url, b.id]);

  if (!ctx.preview && loaded.error)
    return (
      <Shell b={b}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  if (!v || !draft)
    return (
      <Shell b={b}>
        <p className="text-ink-muted">Loading…</p>
      </Shell>
    );

  const change = (d: Attempt) => {
    dirty.current = true;
    setDraft(d);
  };
  const send = () =>
    void (async () => {
      setBusy(true);
      setProblem(null);
      try {
        if (ctx.preview) {
          const out = submit(b, v.state, draft);
          if ("problem" in out) throw new Error(out.problem);
          setV(localView(b, out.state));
        } else {
          dirty.current = false;
          const out = await api<Loaded & { passedNow: boolean }>(url, { body: { action: "submit", blockId: b.id, attempt: draft } });
          setV(out);
          if (out.passedNow) {
            ctx.activity(b.id, { outcome: "passed" });
            ctx.engaged(b.id);
          }
        }
        jump.current = true;
        setEditing(false);
      } catch (e) {
        setProblem(e instanceof Error ? e.message : "That didn’t send. Your work is still here.");
      } finally {
        setBusy(false);
      }
    })();
  const save = (patch: Record<string, unknown>) => {
    if (!ctx.preview) api(url, { body: { blockId: b.id, ...patch } }).catch(() => undefined);
  };

  return (
    <Shell b={b}>
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{REDPEN_NOTICE}</p>
      {b.intro && <p className="mt-3 text-lg">{b.intro}</p>}
      {v.earlierKey && (
        <p className={cx(warn, "mt-3")}>
          This case’s rubric or reviewed rewrite has changed since you started. Your earlier work is kept and read against the current version.
        </p>
      )}
      {v.stale && <p className={cx(warn, "mt-3")}>This case is past its review date and is being reviewed. Its endorsement is retired until then.</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
        <CaseCard b={b} canInsert={editing} onInsert={(t) => change({ ...draft, rewrite: `${draft.rewrite.trim()} ${t}`.trim() })} />
        <div className="min-w-0">
          {editing ? (
            <>
              <h4 ref={editTop} tabIndex={-1} className="sr-only">
                {v.feedback ? "Revise your critique" : "Your critique"}
              </h4>
              <Clipboard b={b} d={draft} change={change} busy={busy} problem={problem} onSubmit={send} resubmit={v.state.submissions.length > 0} />
            </>
          ) : (
            v.feedback && (
              <Results
                b={b}
                v={v}
                headingRef={top}
                onRevise={() => {
                  jump.current = true;
                  setEditing(true);
                }}
                save={save}
              />
            )
          )}
          {editing && v.feedback && (
            <p className="mt-3">
              <button
                type="button"
                className="font-semibold text-accent underline"
                onClick={() => {
                  jump.current = true;
                  setEditing(false);
                }}
              >
                Back to your feedback
              </button>
            </p>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ b, children }: { b: RedPenBlock; children: React.ReactNode }) {
  return (
    <section aria-label={`Red Pen: ${b.title}`} className="w-full rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="pen" className="size-5" /> Red Pen · {MODES[b.mode].toLowerCase()} · practice
      </p>
      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

/** The pinned briefing card: stays beside the clipboard on a wide screen, and opens at the top on a phone. */
function CaseCard({ b, canInsert, onInsert }: { b: RedPenBlock; canInsert: boolean; onInsert: (t: string) => void }) {
  return (
    <details open className={cx(box, "self-start lg:sticky lg:top-24")}>
      <summary className="cursor-pointer font-serif text-lg font-semibold">Case facts</summary>
      {b.role && <p className="mt-2 text-sm text-ink-muted">{b.role}</p>}
      <p className="mt-2">{b.brief}</p>
      <p className="mt-3 font-semibold">What you know</p>
      <ul className="mt-1 flex flex-col gap-2">
        {b.facts.map((f) => (
          <li key={f.id} className="text-sm">
            {f.text}
            {canInsert && (
              <button type="button" className="ml-2 text-xs font-semibold text-accent underline" onClick={() => onInsert(f.text)}>
                Insert into my rewrite
              </button>
            )}
          </li>
        ))}
      </ul>
      {b.unknowns.length > 0 && (
        <>
          <p className="mt-3 font-semibold">What is unknown</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {b.unknowns.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </>
      )}
      {b.policyExcerpt && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold">Policy excerpt</summary>
          <p className="mt-1">{b.policyExcerpt}</p>
        </details>
      )}
    </details>
  );
}

function Clipboard({
  b,
  d,
  change,
  busy,
  problem,
  onSubmit,
  resubmit,
}: {
  b: RedPenBlock;
  d: Attempt;
  change: (d: Attempt) => void;
  busy: boolean;
  problem: string | null;
  onSubmit: () => void;
  resubmit: boolean;
}) {
  const ids = useId();
  const [open, setOpen] = useState<string | null>(null);
  const [checks, setChecks] = useState({ added: false, removed: false });
  const problems = submitProblems(b, d);
  return (
    <div className="flex flex-col gap-4">
      <div className={paper}>
        <p className="text-xs font-extrabold uppercase tracking-[0.12em] opacity-70">{MODES[b.mode]} · draft</p>
        <ol className="mt-3 flex flex-col gap-3">
          {b.document.map((s, i) => {
            const m = d.marks[s.id];
            const editingThis = open === s.id;
            return (
              <li key={s.id} className="grid grid-cols-[1.75rem_1fr] gap-2">
                <span className="pt-0.5 text-sm font-semibold opacity-60" aria-hidden>
                  {i + 1}
                </span>
                <div>
                  <p
                    className={cx(
                      "font-serif text-lg leading-relaxed",
                      m && "underline decoration-[#b3261e] decoration-2 underline-offset-4 dark:decoration-[#ff8a80]",
                    )}
                  >
                    <span className="sr-only">Line {i + 1}: </span>
                    {s.text}
                  </p>
                  {m && !editingThis && (
                    <p className={cx("mt-1 text-sm", ink)}>
                      <span className="font-semibold">
                        <Icon name="pen" className="mr-1 inline size-4" />
                        Red pen: {REASONS[m.reason]}.
                      </span>{" "}
                      {m.note}
                      {m.replacement && <span className="block">Replace with: “{m.replacement}”</span>}
                    </p>
                  )}
                  {!editingThis && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <button type="button" className={cx(secondary, "min-h-9 px-3 text-sm")} onClick={() => setOpen(s.id)} aria-expanded={false}>
                        <Icon name="pen" className="size-4" /> {m ? "Change mark" : "Mark with Red Pen"}
                      </button>
                      {m && (
                        <button
                          type="button"
                          className={cx(secondary, "min-h-9 px-3 text-sm")}
                          onClick={() => {
                            const marks = { ...d.marks };
                            delete marks[s.id];
                            change({ ...d, marks });
                          }}
                        >
                          Remove mark
                        </button>
                      )}
                      {!m && (
                        <label className="flex min-w-48 flex-1 items-center gap-2 text-xs">
                          <span className="shrink-0">Leaving it because…</span>
                          <input
                            className="min-h-9 w-full rounded-lg border border-line-strong bg-white/70 px-2 text-sm dark:bg-black/20"
                            value={d.kept[s.id] ?? ""}
                            maxLength={300}
                            onChange={(e) => {
                              const kept = { ...d.kept };
                              if (e.target.value) kept[s.id] = e.target.value;
                              else delete kept[s.id];
                              change({ ...d, kept });
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )}
                  {editingThis && (
                    <MarkEditor
                      name={`${ids}-${s.id}`}
                      initial={m}
                      onCancel={() => setOpen(null)}
                      onSave={(mark) => {
                        const kept = { ...d.kept };
                        delete kept[s.id];
                        change({ ...d, marks: { ...d.marks, [s.id]: mark }, kept });
                        setOpen(null);
                      }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className={box}>
        <label className="flex flex-col gap-1">
          <span className="font-serif text-lg font-semibold">Your rewrite</span>
          <span className="text-sm text-ink-muted">
            The whole {b.mode === "plan" ? "goal" : "note"}, from the case facts only. Where the case doesn’t say, leave a gap like “[confirm actual time]”.
          </span>
          <textarea
            className="min-h-48 rounded-xl border border-line-strong bg-bg px-3 py-2 leading-relaxed"
            value={d.rewrite}
            maxLength={3000}
            onChange={(e) => change({ ...d, rewrite: e.target.value })}
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={cx(secondary, "min-h-9 px-3 text-sm")} onClick={() => change({ ...d, rewrite: applyReplacements(b, d) })}>
            Start from my replacements
          </button>
          <button
            type="button"
            className={cx(secondary, "min-h-9 px-3 text-sm")}
            onClick={() => change({ ...d, rewrite: b.document.map((s) => s.text).join(" ") })}
          >
            Start from the original
          </button>
        </div>
      </div>

      {b.escalation && (
        <fieldset className={cx(box, "ring-2 ring-[#b3261e]/40")}>
          <legend className="px-1 font-serif text-lg font-semibold">A separate decision</legend>
          <p className="text-sm">{b.escalation.question} Rewriting the note can’t do this for you.</p>
          <ul className="mt-2 flex flex-col gap-1">
            {b.escalation.options.map((o) => (
              <li key={o.id}>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-muted">
                  <input
                    type="radio"
                    name={`${ids}-esc`}
                    className="mt-1 size-5"
                    checked={d.escalation === o.id}
                    onChange={() => change({ ...d, escalation: o.id })}
                  />
                  <span>{o.text}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <fieldset className={box}>
        <legend className="px-1 font-semibold">Check your work (it isn’t marked)</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={checks.added} onChange={(e) => setChecks({ ...checks, added: e.target.checked })} />I haven’t added
          anything the case didn’t tell me.
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={checks.removed} onChange={(e) => setChecks({ ...checks, removed: e.target.checked })} />I haven’t
          removed a safety-relevant fact.
        </label>
      </fieldset>

      {problem && (
        <p role="alert" className={warn}>
          {problem}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primary} disabled={busy || problems.length > 0} onClick={onSubmit}>
          {resubmit ? "Submit your revision" : "Submit critique"}
        </button>
        <span className="text-sm text-ink-muted">{problems[0] ?? "Private: only you see your work. Your draft saves as you go."}</span>
      </div>
    </div>
  );
}

function MarkEditor({
  name,
  initial,
  onSave,
  onCancel,
}: {
  name: string;
  initial?: Attempt["marks"][string];
  onSave: (m: Attempt["marks"][string]) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<Reason | "">(initial?.reason ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [replacement, setReplacement] = useState(initial?.replacement ?? "");
  const first = useRef<HTMLLegendElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <div className="mt-2 rounded-2xl bg-surface p-3 text-ink ring-1 ring-line">
      <fieldset>
        <legend ref={first} tabIndex={-1} className="text-sm font-semibold outline-none">
          What’s wrong with this line?
        </legend>
        <div className="mt-1 grid gap-1 sm:grid-cols-2">
          {(Object.keys(REASONS) as Reason[]).map((r) => (
            <label key={r} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted">
              <input type="radio" name={name} className="size-4" checked={reason === r} onChange={() => setReason(r)} />
              {REASONS[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-2 flex flex-col gap-1 text-sm">
        <span className="font-semibold">Why, in a sentence</span>
        <input className="min-h-10 rounded-lg border border-line-strong bg-bg px-2" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="mt-2 flex flex-col gap-1 text-sm">
        <span className="font-semibold">Replace text (optional; leave empty to remove it)</span>
        <input
          className="min-h-10 rounded-lg border border-line-strong bg-bg px-2"
          value={replacement}
          maxLength={400}
          onChange={(e) => setReplacement(e.target.value)}
        />
      </label>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className={cx(primary, "min-h-9 px-4 text-sm")}
          disabled={!reason}
          onClick={() => reason && onSave({ reason, note, replacement })}
        >
          Save mark
        </button>
        <button type="button" className={cx(secondary, "min-h-9 px-3 text-sm")} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Results({
  b,
  v,
  headingRef,
  onRevise,
  save,
}: {
  b: RedPenBlock;
  v: View;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onRevise: () => void;
  save: (patch: Record<string, unknown>) => void;
}) {
  const f = v.feedback as Feedback;
  const last = v.state.submissions[v.state.submissions.length - 1];
  return (
    <div className="flex flex-col gap-4">
      <div className={tone[f.pass ? "strong" : f.result === "critical" ? "critical" : "revision"]}>
        <h4 ref={headingRef} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
          {f.pass ? "Learning pass" : f.result === "critical" ? "Critical gap: revise and resubmit" : "Not yet: revise and resubmit"}
        </h4>
        <p className="text-sm">
          Submission {v.state.submissions.length}. {v.state.submissions.length > 1 ? "Your first submission is kept as it was." : "Your submission is private."}{" "}
          Marked on judgement and the case facts, not on how closely you match the reviewed rewrite.
        </p>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        {f.dims.map((d) => (
          <div key={d.dim} className={box}>
            <dt className="font-semibold">
              {d.label}: {RESULTS[d.result]}
            </dt>
            {d.notes.length > 0 && (
              <dd className="mt-1 text-sm">
                <ul className="list-disc pl-5">
                  {[...new Set(d.notes)].map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </dd>
            )}
          </div>
        ))}
      </dl>
      <div className={box}>
        <p className="font-semibold">Line by line</p>
        <ol className="mt-2 flex flex-col gap-3">
          {f.lines.map((l, i) => (
            <li key={l.id} className="text-sm">
              <p>
                <span className="font-semibold">Line {i + 1}:</span> “{l.text}”
              </p>
              <p className="text-ink-muted">
                {l.marked ? `You marked it: ${REASONS[l.marked]}` : "You left it unmarked"} · {RESULTS[l.verdict]}
              </p>
              {l.feedback && <p>{l.feedback}</p>}
              {l.suggestion && <p className="text-ink-muted">One way to put it: “{l.suggestion}”</p>}
            </li>
          ))}
        </ol>
      </div>
      {(f.rewrite.length > 0 || f.escalation) && (
        <div className={box}>
          <p className="font-semibold">Your rewrite{f.escalation ? " and escalation" : ""}</p>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {f.escalation && (
              <li className={tone[f.escalation.verdict]}>
                <span className="font-semibold">Escalation ({RESULTS[f.escalation.verdict]}):</span> {f.escalation.text}. {f.escalation.feedback}
              </li>
            )}
            {f.rewrite.map((x) => (
              <li key={x.feedback}>
                <span className="font-semibold">
                  {RESULTS[x.result]}: {x.text}
                </span>{" "}
                {x.feedback}
              </li>
            ))}
          </ul>
          {f.rewrite.length > 0 && <p className="mt-2 text-xs text-ink-muted">{CHECK_NOTE}</p>}
        </div>
      )}
      <div>
        <button type="button" className={f.pass ? secondary : primary} onClick={onRevise}>
          <Icon name="pen" className="size-4" /> Revise and resubmit
        </button>
      </div>
      {v.reviewed && <Compare b={b} v={v} mine={last.rewrite} onOpen={() => save({ compared: true })} />}
      <Reflect initial={v.state.reflection} onSave={(t) => save({ reflection: t })} />
      {v.thread && (
        <div className={box}>
          <p className="font-semibold">Discuss the wording</p>
          <p className="text-sm text-ink-muted">The Community thread for this fictional case. Your attempt isn’t posted there.</p>
          <Link href={`/community#post-${v.thread.id}`} className={cx(secondary, "mt-2")}>
            <Icon name="chat" className="size-4" /> {v.thread.title}
          </Link>
        </div>
      )}
    </div>
  );
}

/** The reviewed rewrite beside yours (a keyboard slider sets the split), or one after another with word differences. */
function Compare({ b, v, mine, onOpen }: { b: RedPenBlock; v: View; mine: string; onOpen: () => void }) {
  const r = v.reviewed!;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"side" | "linear">("side");
  const [split, setSplit] = useState(50);
  const ids = useId();
  if (!open)
    return (
      <div>
        <button
          type="button"
          className={primary}
          onClick={() => {
            setOpen(true);
            onOpen();
          }}
        >
          Compare with the reviewed rewrite
        </button>
      </div>
    );
  const parts = diffWords(mine, r.text);
  return (
    <section aria-labelledby={`${ids}-h`} className={box}>
      <h5 id={`${ids}-h`} className="font-serif text-lg font-semibold">
        Compare with a reviewed rewrite
      </h5>
      <p className="text-sm">
        By {[r.reviewer, r.reviewerRole].filter(Boolean).join(", ")}
        {r.reviewedOn && `, reviewed ${showDate(r.reviewedOn)}`}. <span className="font-semibold">Peer perspective</span>
        {r.endorsed ? (
          <>
            {" "}
            · <span className="font-semibold">Policy endorsed</span>
          </>
        ) : v.stale ? (
          " · endorsement retired while it’s reviewed"
        ) : (
          ""
        )}
        . It’s one defensible version, not the only one.
      </p>
      <div role="group" aria-label="Comparison view" className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={view === "side"}
          className={cx(secondary, "min-h-9 px-3 text-sm", view === "side" && "bg-muted ring-2 ring-action")}
          onClick={() => setView("side")}
        >
          Side by side
        </button>
        <button
          type="button"
          aria-pressed={view === "linear"}
          className={cx(secondary, "min-h-9 px-3 text-sm", view === "linear" && "bg-muted ring-2 ring-action")}
          onClick={() => setView("linear")}
        >
          One after another
        </button>
      </div>
      {view === "side" ? (
        <>
          <label className="mt-3 flex items-center gap-3 text-sm">
            <span className="shrink-0 font-semibold">Divider</span>
            <input
              type="range"
              min={20}
              max={80}
              step={5}
              value={split}
              onChange={(e) => setSplit(Number(e.target.value))}
              className="w-full"
              aria-valuetext={`Your version ${split}%, reviewed ${100 - split}%`}
            />
          </label>
          <div className="mt-2 flex flex-col gap-3 md:flex-row" style={{ ["--split" as string]: `${split}%` }}>
            <div className={cx(paper, "md:w-[var(--split)]")}>
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] opacity-70">Your version</p>
              <p className="mt-2 whitespace-pre-line">{mine}</p>
            </div>
            <div className={cx(paper, "md:flex-1")}>
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] opacity-70">Reviewed rewrite</p>
              <p className="mt-2 whitespace-pre-line">{r.text}</p>
            </div>
          </div>
        </>
      ) : (
        <ol className="mt-3 flex flex-col gap-3">
          <li className={paper}>
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] opacity-70">1. Original</p>
            <p className="mt-2">{b.document.map((s) => s.text).join(" ")}</p>
          </li>
          <li className={paper}>
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] opacity-70">2. Your version</p>
            <p className="mt-2 whitespace-pre-line">{mine}</p>
          </li>
          <li className={paper}>
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] opacity-70">3. Reviewed rewrite, with the differences from yours</p>
            <p className="mt-2 leading-relaxed">
              {parts.map((p, i) =>
                p.kind === "same" ? (
                  <span key={i}>{p.text}</span>
                ) : p.kind === "add" ? (
                  <ins key={i} className="rounded bg-[#e3f4e8] px-0.5 no-underline dark:bg-[#123321]">
                    <span className="sr-only">[added: </span>
                    <span aria-hidden>+</span>
                    {p.text}
                    <span className="sr-only">]</span>
                  </ins>
                ) : (
                  <del key={i} className="rounded bg-[#fde2e0] px-0.5 dark:bg-[#3d1512]">
                    <span className="sr-only">[only in yours: </span>
                    <span aria-hidden>−</span>
                    {p.text}
                    <span className="sr-only">]</span>
                  </del>
                ),
              )}
            </p>
            <p className="mt-1 text-xs opacity-70">+ in the reviewed rewrite only · − in yours only</p>
          </li>
        </ol>
      )}
      {r.notes.length > 0 && (
        <div className="mt-3">
          <p className="font-semibold">Why the reviewer wrote it this way</p>
          <ul className="mt-1 flex flex-col gap-2 text-sm">
            {r.notes.map((n) => (
              <li key={n.note} className="border-l-4 border-[#b3261e]/50 pl-3">
                {n.quote && <span className="font-semibold">“{n.quote}”: </span>}
                {n.note}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.alternatives.length > 0 && (
        <div className="mt-3">
          <p className="font-semibold">Another defensible phrasing</p>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {r.alternatives.map((a) => (
              <li key={a}>“{a}”</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Reflect({ initial, onSave }: { initial: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(Boolean(initial));
  return (
    <form
      className={box}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(text);
        setSaved(true);
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Which change would you carry into your next note?</span>
        <span className="text-sm text-ink-muted">Private to you.</span>
        <textarea
          className="min-h-20 rounded-xl border border-line-strong bg-bg px-3 py-2"
          maxLength={600}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <div className="mt-2 flex items-center gap-3">
        <button type="submit" className={secondary}>
          Save
        </button>
        <span role="status" className="text-sm text-ink-muted">
          {saved && text ? "Saved." : ""}
        </span>
      </div>
    </form>
  );
}
