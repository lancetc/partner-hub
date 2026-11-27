"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx, formatDate } from "@/lib/format";
import { ACTION_STATUSES, type ActionBlock, type ActionStatus, type Block, type JournalBlock, type PerspectivesBlock, type PulseBlock } from "@/lib/magazine";
import type { MyNote } from "@/server/magazineNotes";
import type { ReaderGuide, ReaderNote } from "@/server/magazine";
import { RichText } from "../RichText";
import { Icon } from "../Icon";
import type { InteractiveContext } from "./InteractiveBlocks";
import "../player/fx.css";

/*
  Reflect and apply (docs/magazine-reflect-apply.md), as learners use them: a private journal, curated
  perspectives to compare, a pulse check, and an action note. Think, compare, try, revisit.

  None of these is scored. What a learner writes is private to them: it's saved to My Notes, never posted,
  never sent to AI, and never shown to authors or managers. Each block says so where it matters.
*/

const column = "mx-auto w-full max-w-[42rem]";
const kicker = "mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent";
const card = "rounded-3xl border border-line-strong bg-surface p-5 sm:p-7";
const primary = "inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:opacity-45";
const quiet = "inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold text-accent hover:bg-muted disabled:opacity-45";

export const PRIVATE_NOTICE =
  "Only you see this in the Hub. It isn’t shown to authors, managers or other learners, and it’s never posted or sent to AI. Trilogy Care’s system administrators can access stored data if they need to for support or safety.";

function Private({ children }: { children?: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm text-ink-muted">
      <Icon name="lock" className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="font-semibold text-ink">Private note.</span> {children ?? "Only you see it; it’s kept in My Notes."} Please don’t include a real
        client’s name or personal details.
      </span>
    </p>
  );
}

export function ReflectBlock({ block: b, ctx }: { block: Block; ctx: InteractiveContext }) {
  switch (b.type) {
    case "journal":
      return <Journal block={b} ctx={ctx} />;
    case "perspectives":
      return <Perspectives block={b} ctx={ctx} />;
    case "pulse":
      return <Pulse block={b} ctx={ctx} />;
    case "action":
      return <ActionNote block={b} ctx={ctx} />;
    default:
      return null;
  }
}

/** Words kept on this device as they're typed, so a lost connection or a refresh never loses them. */
function useLocalDraft(key: string, saved: string) {
  const [text, setText] = useState(saved);
  useEffect(() => {
    try {
      const kept = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (kept != null && kept !== saved) setText(kept);
    } catch {}
    // Only when the block first shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const change = (v: string) => {
    setText(v);
    try {
      localStorage.setItem(key, v);
    } catch {}
  };
  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {}
  };
  return { text, change, clear };
}

type SaveState = "idle" | "saving" | "draft" | "saved" | "error";

function Journal({ block: b, ctx }: { block: JournalBlock; ctx: InteractiveContext }) {
  const note = ctx.notes[b.id];
  const earlierBlock = b.revisits ? ctx.find(b.revisits) : undefined;
  const earlier = b.revisits ? ctx.notes[b.revisits] : undefined;
  const { text, change, clear } = useLocalDraft(`note:${ctx.guideId}:${b.id}`, note?.body ?? "");
  const [save, setSave] = useState<SaveState>(note?.state === "saved" ? "saved" : note?.state === "draft" ? "draft" : "idle");
  const [editing, setEditing] = useState(note?.state !== "saved");
  const [skipped, setSkipped] = useState(note?.state === "skipped");
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();
  const lastSent = useRef(note?.body ?? "");

  // Autosave as a draft after a pause in typing. A failure says so, and the words stay on this device.
  useEffect(() => {
    if (!editing || text === lastSent.current || !text.trim()) return;
    const t = setTimeout(() => {
      setSave("saving");
      ctx
        .saveNote(b.id, { body: text, state: "draft" })
        .then(() => {
          lastSent.current = text;
          setSave("draft");
          setProblem(null);
        })
        .catch((e: unknown) => {
          setSave("error");
          setProblem(e instanceof Error ? e.message : "Not saved yet.");
        });
    }, 1500);
    return () => clearTimeout(t);
  }, [text, editing, b.id, ctx]);

  const commit = async (state: "saved" | "skipped") => {
    setSave("saving");
    setProblem(null);
    try {
      await ctx.saveNote(b.id, state === "saved" ? { body: text, state } : { state });
      lastSent.current = text;
      if (state === "saved") {
        clear();
        setSave("saved");
        setEditing(false);
        setSkipped(false);
      } else {
        setSave("idle");
        setSkipped(true);
      }
      if (b.required) ctx.engaged(b.id);
    } catch (e) {
      setSave("error");
      setProblem(e instanceof Error ? e.message : "That didn’t save. Your words are still here: try again.");
    }
  };

  const field = (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="font-serif text-xl font-semibold leading-snug">
        {b.prompt}
      </label>
      {b.scaffold && <p className="text-ink-muted">{b.scaffold}</p>}
      {editing ? (
        <>
          <textarea
            id={id}
            aria-describedby={`${id}-private ${id}-status`}
            className="min-h-36 w-full rounded-2xl border border-line-strong bg-bg p-3 leading-relaxed"
            value={text}
            maxLength={5000}
            onChange={(e) => change(e.target.value)}
            placeholder="A few sentences is plenty. Bullet points are fine."
          />
          <div id={`${id}-private`}>
            <Private />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={primary} disabled={!text.trim() || save === "saving"} onClick={() => void commit("saved")}>
              Save my note
            </button>
            {note?.state !== "saved" && (
              <button type="button" className={quiet} disabled={save === "saving"} onClick={() => (b.required ? void commit("skipped") : setSkipped(true))}>
                {b.required ? "Prefer not to write: mark as reviewed" : "Skip for now"}
              </button>
            )}
            <p
              id={`${id}-status`}
              role="status"
              aria-live="polite"
              className={cx("text-sm", save === "error" ? "font-semibold text-danger" : "text-ink-muted")}
            >
              {save === "saving"
                ? "Saving…"
                : save === "draft"
                  ? "Draft saved"
                  : save === "error"
                    ? (problem ?? "Not saved. Your words are kept on this device: try again.")
                    : skipped
                      ? b.required
                        ? "Marked as reviewed. You can still write a note any time."
                        : "Skipped for now. You can come back to it any time."
                      : ""}
            </p>
          </div>
        </>
      ) : (
        <>
          <p id={id} className="whitespace-pre-line rounded-2xl bg-bg p-4 leading-relaxed">
            {note?.body}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-[#0f5b3a] dark:text-[#8fe0b5]">
              <Icon name="circle-check" className="size-4" /> Saved to My Notes{note ? ` · ${formatDate(note.updatedAt)}` : ""}
            </p>
            <button type="button" className={quiet} onClick={() => setEditing(true)}>
              <Icon name="pen" className="size-4" /> Edit
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className={cx(b.revisits ? "mx-auto w-full max-w-5xl" : column, card)}>
      <p className={kicker}>
        <Icon name="pen" className="size-5" /> {b.revisits ? "Revisit your note" : "Private journal"}
        {b.minutes ? <span className="font-sans text-xs font-semibold normal-case tracking-normal text-ink-muted">· about {b.minutes} min</span> : null}
        {!b.required && <span className="font-sans text-xs font-semibold normal-case tracking-normal text-ink-muted">· optional</span>}
      </p>
      {b.revisits ? (
        // What they wrote then, beside what they think now: both are kept.
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl bg-muted/60 p-4">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-wide text-ink-muted">What you wrote then</p>
            {earlierBlock?.type === "journal" && <p className="mt-1 text-sm text-ink-muted">{earlierBlock.prompt}</p>}
            {earlier?.state === "saved" && earlier.body ? (
              <>
                <p className="mt-2 whitespace-pre-line leading-relaxed">{earlier.body}</p>
                <p className="mt-2 text-xs text-ink-muted">{formatDate(earlier.updatedAt)}</p>
              </>
            ) : (
              <p className="mt-2 text-sm">You didn’t save a note then. That’s fine: start from where you are now.</p>
            )}
          </div>
          {field}
        </div>
      ) : (
        field
      )}
    </div>
  );
}

function Perspectives({ block: b, ctx }: { block: PerspectivesBlock; ctx: InteractiveContext }) {
  const [open, setOpen] = useState(false);
  const after = b.after ? ctx.find(b.after) : undefined;
  const responded = !after || (after.type === "decision" ? Boolean(ctx.answers[after.id]) : ctx.notes[after.id]?.state === "saved");
  const g = b.guidance;
  return (
    <div className={cx("mx-auto w-full max-w-5xl", card)}>
      <p className={kicker}>
        <Icon name="people" className="size-5" /> Compare perspectives
      </p>
      {b.prompt && <p className="font-serif text-xl font-semibold leading-snug">{b.prompt}</p>}
      {!open ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-ink-muted">
            {responded
              ? `See ${b.views.length} ways of looking at this. They’re viewpoints, not answers.`
              : "It’s worth forming your own view first (above). You can also compare straight away."}
          </p>
          <button
            type="button"
            aria-expanded={false}
            className={cx(primary, "self-start")}
            onClick={() => {
              setOpen(true);
              ctx.opened(b.id);
            }}
          >
            {responded ? "Compare perspectives" : "Compare without answering"} <Icon name="arrow-right" className="size-4" />
          </button>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-muted">
            Each of these is a defensible way to see it, with what it might miss. None is ranked, and none is “the answer”.
          </p>
          <ol className={cx("mt-4 grid gap-4", b.views.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
            {b.views.map((v, i) => (
              <li key={v.id} className="flex flex-col gap-2 rounded-2xl bg-bg p-4 ring-1 ring-line">
                <p className="font-mulish text-xs font-extrabold uppercase tracking-wide text-ink-muted">Perspective {i + 1}</p>
                <p className="font-serif text-lg font-semibold leading-snug">{v.title}</p>
                <div>
                  <p className="text-sm font-bold">The reasoning</p>
                  <RichText text={v.reasoning} className="text-base" />
                </div>
                {v.misses && (
                  <div>
                    <p className="text-sm font-bold">What it might miss</p>
                    <RichText text={v.misses} className="text-base" />
                  </div>
                )}
              </li>
            ))}
          </ol>
          {g && (
            // Policy is shown apart from opinion, with where it comes from.
            <aside aria-label="What the guidance says" className="mt-4 rounded-2xl border-l-4 border-action bg-tealtint p-4">
              <p className="flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-wide">
                <Icon name="doc" className="size-4" /> What the guidance says
              </p>
              <RichText text={g.body} className="mt-1" />
              {(g.source || g.reviewedBy) && (
                <p className="mt-2 text-sm text-ink-muted">
                  {g.source &&
                    (g.source.href ? (
                      <a href={g.source.href} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
                        {g.source.label}
                      </a>
                    ) : (
                      <span className="font-semibold">{g.source.label}</span>
                    ))}
                  {g.source && g.reviewedBy ? " · " : ""}
                  {g.reviewedBy && `Reviewed by ${g.reviewedBy}${g.reviewedOn ? `, ${formatDate(g.reviewedOn)}` : ""}`}
                </p>
              )}
            </aside>
          )}
        </>
      )}
    </div>
  );
}

function Pulse({ block: b, ctx }: { block: PulseBlock; ctx: InteractiveContext }) {
  const note = ctx.notes[b.id];
  const before = b.compareWith ? ctx.notes[b.compareWith] : undefined;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const name = useId();
  const choose = async (choice: string) => {
    setBusy(true);
    setProblem(null);
    try {
      await ctx.saveNote(b.id, { choice });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset disabled={busy} className={cx(column, card)}>
      <legend className="sr-only">{b.question}</legend>
      <p className={kicker}>
        <Icon name="gauge" className="size-5" /> Pulse check
      </p>
      <p className="font-serif text-xl font-semibold leading-snug" aria-hidden>
        {b.question}
      </p>
      <div className={cx("mt-4 grid gap-2", b.options.length > 3 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
        {b.options.map((o) => (
          <label
            key={o.id}
            className={cx(
              "fx-press flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 px-3 py-2 text-center font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
              note?.choice === o.id ? "fx-pop border-action bg-tealtint" : "border-line-strong hover:border-action",
            )}
          >
            <input type="radio" name={name} value={o.id} checked={note?.choice === o.id} onChange={() => void choose(o.id)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {note?.choiceLabel && before?.choiceLabel ? (
          <p className="rounded-2xl bg-tealtint px-3 py-2">
            {before.choice === note.choice ? (
              <>
                Your view is the same as before: <strong>“{note.choiceLabel}”</strong>. That’s fine.
              </>
            ) : (
              <>
                Your view changed from <strong>“{before.choiceLabel}”</strong> to <strong>“{note.choiceLabel}”</strong>.
              </>
            )}
          </p>
        ) : note?.choiceLabel ? (
          <p>
            You chose <strong>“{note.choiceLabel}”</strong>. You can change it.
          </p>
        ) : null}
        {problem && <p className="font-semibold text-danger">{problem}</p>}
      </div>
      <p className="mt-2 text-sm text-ink-muted">This isn’t scored, and there’s no right answer. Only you see your response; no group results are shown.</p>
    </fieldset>
  );
}

function ActionNote({ block: b, ctx }: { block: ActionBlock; ctx: InteractiveContext }) {
  const note = ctx.notes[b.id];
  const earlier = b.revisits ? ctx.notes[b.revisits] : undefined;
  const own = note && !note.choice ? note.body : "";
  const { text, change, clear } = useLocalDraft(`note:${ctx.guideId}:${b.id}`, b.revisits ? (note?.body ?? "") : own);
  const [choice, setChoice] = useState<string>(note?.choice ?? (own ? "own" : ""));
  const [status, setStatus] = useState<ActionStatus | "">((note?.status as ActionStatus | null) ?? "");
  const [saved, setSaved] = useState(note?.state === "saved");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const name = useId();
  const allowOwn = b.allowOwn !== false;

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await ctx.saveNote(b.id, b.revisits ? { status, body: text } : choice === "own" ? { body: text } : { choice });
      clear();
      setSaved(true);
      if (b.required) ctx.engaged(b.id);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const done = (
    <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-[#0f5b3a] dark:text-[#8fe0b5]">
      <Icon name="circle-check" className="size-4" /> Saved to My Notes
    </p>
  );

  if (b.revisits) {
    const what = earlier ? earlier.choiceLabel || earlier.body : "";
    return (
      <div className={cx(column, card)}>
        <p className={kicker}>
          <Icon name="target" className="size-5" /> Back to your action
        </p>
        <p className="font-serif text-xl font-semibold leading-snug">{b.prompt}</p>
        {what ? (
          <p className="mt-3 rounded-2xl bg-muted/60 p-4">
            <span className="block font-mulish text-xs font-extrabold uppercase tracking-wide text-ink-muted">You planned to</span>
            {what}
          </p>
        ) : (
          <p className="mt-3 text-ink-muted">You didn’t save an action earlier. You can still note what you’ve tried.</p>
        )}
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-semibold">How did it go?</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(ACTION_STATUSES) as [ActionStatus, string][]).map(([k, label]) => (
              <label
                key={k}
                className={cx(
                  "fx-press flex min-h-11 cursor-pointer items-center rounded-full border-2 px-4 font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                  status === k ? "border-action bg-tealtint" : "border-line-strong hover:border-action",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={k}
                  checked={status === k}
                  onChange={() => {
                    setStatus(k);
                    setSaved(false);
                  }}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-4 flex flex-col gap-1 text-sm font-semibold">
          What happened? (optional)
          <textarea
            className="min-h-24 w-full rounded-2xl border border-line-strong bg-bg p-3 font-normal leading-relaxed"
            value={text}
            maxLength={5000}
            onChange={(e) => {
              change(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <div className="mt-2">
          <Private>“Not yet” is a fine answer: nothing follows from it, and no reminder is sent.</Private>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className={primary} disabled={!status || busy || saved} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </button>
          {saved && done}
          {problem && <p className="text-sm font-semibold text-danger">{problem}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={cx(column, card)}>
      <p className={kicker}>
        <Icon name="target" className="size-5" /> Action note
        {!b.required && <span className="font-sans text-xs font-semibold normal-case tracking-normal text-ink-muted">· optional</span>}
      </p>
      <fieldset disabled={busy} className="flex flex-col gap-2">
        <legend className="mb-2 font-serif text-xl font-semibold leading-snug">{b.prompt}</legend>
        {b.timing && <p className="-mt-1 mb-1 text-ink-muted">{b.timing}</p>}
        {b.suggestions.map((s) => (
          <label
            key={s.id}
            className={cx(
              "fx-press flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
              choice === s.id ? "border-action bg-tealtint" : "border-line-strong hover:border-action",
            )}
          >
            <input
              type="radio"
              name={name}
              value={s.id}
              checked={choice === s.id}
              onChange={() => {
                setChoice(s.id);
                setSaved(false);
              }}
              className="mt-1 size-4 shrink-0 accent-[var(--color-action)]"
            />
            {s.text}
          </label>
        ))}
        {allowOwn && (
          <label
            className={cx(
              "flex cursor-pointer flex-col gap-2 rounded-2xl border-2 p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
              choice === "own" ? "border-action bg-tealtint" : "border-line-strong",
            )}
          >
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name={name}
                value="own"
                checked={choice === "own"}
                onChange={() => {
                  setChoice("own");
                  setSaved(false);
                }}
                className="size-4 shrink-0 accent-[var(--color-action)]"
              />
              <span className="font-semibold">Write my own</span>
            </span>
            {choice === "own" && (
              <textarea
                aria-label="Your own action"
                className="min-h-20 w-full rounded-xl border border-line-strong bg-bg p-3 leading-relaxed"
                value={text}
                maxLength={600}
                placeholder="On my next…, I will…"
                onChange={(e) => {
                  change(e.target.value);
                  setSaved(false);
                }}
              />
            )}
          </label>
        )}
      </fieldset>
      <div className="mt-3">
        <Private>One concrete thing is plenty. No reminder is sent, and nothing follows if you don’t get to it.</Private>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className={primary} disabled={busy || saved || !choice || (choice === "own" && !text.trim())} onClick={() => void save()}>
          {busy ? "Saving…" : "Save my action"}
        </button>
        {saved && done}
        {problem && <p className="text-sm font-semibold text-danger">{problem}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// My Notes: the learner's own entries in this course
// ---------------------------------------------------------------------------------------------

/** My Notes for a course: a button and a dialog. Shown when the course has a journal or action block, or they have notes. */
export function useMyNotes({
  guide,
  preview,
  notes,
  onChanged,
}: {
  guide: ReaderGuide;
  preview: boolean;
  notes: Record<string, ReaderNote>;
  /** A note was deleted or its status changed here: the blocks on the page should show it. */
  onChanged: (blockId: string, note: ReaderNote | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [list, setList] = useState<MyNote[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const doc = guide.doc;
  const has = doc.pages.some((p) => p.sections.some((s) => s.blocks.some((b) => b.type === "journal" || b.type === "action")));
  const count = Object.values(notes).filter((n) => n.kind !== "pulse" && n.state === "saved").length;
  const available = has || count > 0;

  const load = async () => {
    setProblem(null);
    if (preview) {
      // An author's preview: the notes made in this preview only, kept nowhere.
      const where = new Map(doc.pages.flatMap((p) => p.sections.flatMap((s) => s.blocks.map((b) => [b.id, { page: p, block: b }] as const))));
      setList(
        Object.values(notes)
          .filter((n) => n.kind !== "pulse" && n.state === "saved")
          .map((n) => {
            const w = where.get(n.blockId);
            const b = w?.block;
            return {
              ...n,
              status: n.status as ActionStatus | null,
              pageId: w?.page.id ?? null,
              prompt: b && (b.type === "journal" || b.type === "action") ? b.prompt : "",
              revisitOf: b && (b.type === "journal" || b.type === "action") ? (b.revisits ?? null) : null,
              pageTitle: w?.page.title ?? "",
              inCourse: true,
              timing: null,
            };
          }),
      );
      return;
    }
    try {
      setList((await api<{ notes: MyNote[] }>(`/api/magazine/${guide.id}/notes`)).notes);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Your notes didn’t load. Try again.");
    }
  };
  const open = () => {
    dialog.current?.showModal();
    setIsOpen(true);
    void load();
  };
  const remove = async (n: MyNote) => {
    if (
      !(await confirmAction("This note is deleted for good. It can’t be brought back.", { title: "Delete this note?", confirmLabel: "Delete", danger: true }))
    )
      return;
    try {
      if (!preview) await api(`/api/magazine/${guide.id}/notes`, { body: { action: "delete", blockId: n.blockId } });
      setList((l) => (l ?? []).filter((x) => x.blockId !== n.blockId));
      onChanged(n.blockId, null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t delete. Try again.");
    }
  };
  const setStatus = async (n: MyNote, status: ActionStatus) => {
    try {
      const next = n.status === status ? null : status;
      if (!preview) await api(`/api/magazine/${guide.id}/notes`, { body: { action: "status", blockId: n.blockId, status: next } });
      setList((l) => (l ?? []).map((x) => (x.blockId === n.blockId ? { ...x, status: next } : x)));
      const mine = notes[n.blockId];
      if (mine) onChanged(n.blockId, { ...mine, status: next });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save. Try again.");
    }
  };
  /** Their notes as a text file, made in the browser: nothing is sent anywhere. */
  const download = () => {
    const lines = [`My notes: ${guide.title}`, `Saved ${new Date().toLocaleDateString("en-AU")}`, ""];
    for (const n of list ?? []) {
      lines.push(
        `${n.kind === "action" ? "Action" : "Journal"}${n.pageTitle ? ` (${n.pageTitle})` : ""}, ${new Date(n.updatedAt).toLocaleDateString("en-AU")}`,
      );
      if (n.prompt) lines.push(n.prompt);
      if (n.choiceLabel) lines.push(`> ${n.choiceLabel}`);
      if (n.body) lines.push(...n.body.split("\n").map((x) => `> ${x}`));
      if (n.status) lines.push(`How it went: ${ACTION_STATUSES[n.status]}`);
      lines.push("");
    }
    const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `My notes - ${guide.title.replace(/[^\w -]+/g, "").slice(0, 60)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const button = !available ? null : (
    <button
      type="button"
      onClick={open}
      aria-haspopup="dialog"
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-sm font-semibold hover:bg-muted"
    >
      <Icon name="pen" className="size-3.5" /> My notes{count ? ` (${count})` : ""}
    </button>
  );

  const dialogEl = !available ? null : (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={() => setIsOpen(false)}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      className="m-auto max-h-[90vh] w-[min(44rem,calc(100vw-2rem))] max-w-none overflow-y-auto rounded-3xl bg-bg p-0 text-ink shadow-2xl backdrop:bg-[#0b1626]/70 max-sm:m-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-screen max-sm:rounded-none"
    >
      {isOpen && (
        <div className="flex flex-col gap-4 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="font-serif text-2xl font-semibold">
              My notes
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 font-semibold hover:bg-muted"
            >
              <Icon name="close" className="size-4" /> Close
            </button>
          </div>
          <p className="flex items-start gap-2 text-sm text-ink-muted">
            <Icon name="lock" className="mt-0.5 size-4 shrink-0" /> {PRIVATE_NOTICE}
          </p>
          {problem && (
            <p role="alert" className="rounded-2xl bg-[#fdf1f0] px-4 py-2 text-sm text-[#a12d31] dark:bg-[#3a1f1f] dark:text-[#f3a7a9]">
              {problem}
            </p>
          )}
          {!list ? (
            <p className="text-ink-muted">Loading…</p>
          ) : list.length === 0 ? (
            <p className="rounded-2xl bg-surface p-5 ring-1 ring-line">No notes yet. What you save in a journal or action note in this course shows here.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {list.map((n) => (
                  <li key={n.blockId} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
                    <p className="font-mulish text-xs font-extrabold uppercase tracking-wide text-ink-muted">
                      {n.kind === "action" ? (n.revisitOf ? "Action: how it went" : "Action note") : n.revisitOf ? "Journal: follow-up" : "Journal"}
                      {n.pageTitle ? ` · ${n.pageTitle}` : ""} · {formatDate(n.updatedAt)}
                    </p>
                    {n.prompt && <p className="mt-1 text-sm text-ink-muted">{n.prompt}</p>}
                    {n.choiceLabel && <p className="mt-2 font-semibold">{n.choiceLabel}</p>}
                    {n.body && <p className="mt-2 whitespace-pre-line leading-relaxed">{n.body}</p>}
                    {n.kind === "action" && !n.revisitOf && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">Did you try it?</span>
                        {(Object.entries(ACTION_STATUSES) as [ActionStatus, string][]).map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            aria-pressed={n.status === k}
                            onClick={() => void setStatus(n, k)}
                            className={cx(
                              "min-h-9 rounded-full border px-3 text-sm font-semibold",
                              n.status === k ? "border-action bg-action text-on-action" : "border-line-strong hover:bg-muted",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                    {n.status && n.revisitOf && <p className="mt-2 text-sm font-semibold">{ACTION_STATUSES[n.status]}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                      {!n.inCourse && <span className="text-ink-muted">This part of the course has since changed; your note is kept.</span>}
                      <button
                        type="button"
                        className="ml-auto inline-flex items-center gap-1 font-semibold text-ink-muted hover:text-danger"
                        onClick={() => void remove(n)}
                      >
                        <Icon name="trash" className="size-4" /> Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" className={cx(quiet, "self-start")} onClick={download}>
                <Icon name="doc" className="size-4" /> Download my notes (a text file, for you)
              </button>
            </>
          )}
        </div>
      )}
    </dialog>
  );
  return { button, dialog: dialogEl, available };
}
