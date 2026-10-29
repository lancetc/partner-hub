"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/format";
import { lessonMatches, parseOutline, type OutlineChapter } from "@/lib/pathOutline";
import { Badge, btn, ErrorNote, input } from "./ui";
import { Icon } from "../Icon";
import { trackLabel, type PathLesson } from "./PathLessons";

/*
  A learning path in chapters: optional stage headings, numbered chapters with a description, and
  the topics (lessons) in each. Topics are dragged by their handle within and between chapters (or
  moved with the arrow keys). A topic that isn't written yet can be typed in: it becomes an empty
  draft lesson, shown to learners as "coming soon".
*/

export type ChapterDraft = { id: string; title: string; description: string; stage: string; lessons: string[] };

let seq = 0;
export const newChapterId = () => `ch-${Date.now().toString(36)}-${(seq++).toString(36)}`;

type Target = { ci: number; pos: number };

export function ChapterBuilder({
  chapters,
  onChange,
  info,
  catalogue,
  canEdit,
  canCreate,
  createDrafts,
}: {
  chapters: ChapterDraft[];
  onChange: (next: ChapterDraft[]) => void;
  info: (slug: string) => PathLesson | undefined;
  catalogue: PathLesson[];
  canEdit: boolean;
  /** Learning authors can create placeholder draft lessons. */
  canCreate: boolean;
  createDrafts: (titles: string[]) => Promise<PathLesson[]>;
}) {
  const rows = useRef(new Map<string, HTMLElement>());
  const [drag, setDrag] = useState<{ ci: number; li: number; startY: number; dy: number; target: Target } | null>(null);
  const [announce, setAnnounce] = useState("");
  const used = useMemo(() => new Set(chapters.flatMap((c) => c.lessons)), [chapters]);
  const stages = useMemo(() => [...new Set(chapters.map((c) => c.stage).filter(Boolean))], [chapters]);

  const update = (ci: number, fn: (c: ChapterDraft) => ChapterDraft) => onChange(chapters.map((c, i) => (i === ci ? fn(c) : c)));
  const moveTopic = (from: { ci: number; li: number }, to: Target) => {
    const next = chapters.map((c) => ({ ...c, lessons: [...c.lessons] }));
    const [slug] = next[from.ci].lessons.splice(from.li, 1);
    next[to.ci].lessons.splice(to.pos, 0, slug);
    onChange(next);
    setAnnounce(`${info(slug)?.title ?? "Topic"} moved to chapter ${to.ci + 1}, position ${to.pos + 1}.`);
  };

  // Where a dragged topic would land: the chapter and position under the pointer, ignoring the topic itself.
  const targetAt = (y: number, from: { ci: number; li: number }): Target => {
    let best: Target = { ci: 0, pos: 0 };
    chapters.forEach((c, ci) => {
      const head = rows.current.get(`h:${c.id}`)?.getBoundingClientRect();
      if (head && y > head.top) best = { ci, pos: 0 };
      let pos = 0;
      c.lessons.forEach((slug, li) => {
        if (ci === from.ci && li === from.li) return;
        const r = rows.current.get(`t:${slug}`)?.getBoundingClientRect();
        if (r && y > r.top + r.height / 2) best = { ci, pos: pos + 1 };
        pos++;
      });
    });
    return best;
  };

  // The drop line: where the topic will land, unless that's where it already is.
  const lineAt = (ci: number, pos: number) =>
    Boolean(drag && drag.target.ci === ci && drag.target.pos === pos && !(drag.ci === ci && drag.target.pos === drag.li));

  return (
    <div className="flex flex-col gap-4">
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {chapters.map((c, ci) => {
        const showStage = c.stage && (ci === 0 || chapters[ci - 1].stage !== c.stage);
        // Positions shown to the drop line skip the dragged topic, like the drop itself.
        const visible = c.lessons.filter((_, li) => !(drag && drag.ci === ci && drag.li === li));
        return (
          <div key={c.id} className="flex flex-col gap-2">
            {showStage && <p className="mt-2 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{c.stage}</p>}
            <section
              ref={(el) => void (el ? rows.current.set(`h:${c.id}`, el) : rows.current.delete(`h:${c.id}`))}
              className="rounded-2xl border border-line-strong bg-surface p-3"
              aria-label={`Chapter ${ci + 1}: ${c.title || "untitled"}`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-1.5 font-serif text-xl font-semibold text-accent tabular-nums">{String(ci + 1).padStart(2, "0")}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {canEdit ? (
                    <>
                      <input
                        className={cx(input, "min-h-10 font-semibold")}
                        value={c.title}
                        placeholder="Chapter title, e.g. Your Team"
                        aria-label={`Chapter ${ci + 1} title`}
                        onChange={(e) => update(ci, (x) => ({ ...x, title: e.target.value }))}
                      />
                      <input
                        className={cx(input, "min-h-9 text-sm")}
                        value={c.description}
                        placeholder="One line about this chapter (optional)"
                        aria-label={`Chapter ${ci + 1} description`}
                        onChange={(e) => update(ci, (x) => ({ ...x, description: e.target.value }))}
                      />
                      <input
                        className={cx(input, "min-h-9 text-sm")}
                        value={c.stage}
                        list="path-stages"
                        placeholder="Stage (optional), e.g. Stage 2: Working as a Care Coordinator"
                        aria-label={`Chapter ${ci + 1} stage`}
                        onChange={(e) => update(ci, (x) => ({ ...x, stage: e.target.value }))}
                      />
                    </>
                  ) : (
                    <>
                      <p className="font-semibold">{c.title}</p>
                      {c.description && <p className="text-sm text-ink-muted">{c.description}</p>}
                    </>
                  )}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full hover:bg-muted disabled:opacity-30"
                      disabled={ci === 0}
                      onClick={() => onChange(swap(chapters, ci, ci - 1))}
                      aria-label={`Move chapter ${ci + 1} up`}
                    >
                      <Icon name="arrow-left" className="size-4 rotate-90" />
                    </button>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full hover:bg-muted disabled:opacity-30"
                      disabled={ci === chapters.length - 1}
                      onClick={() => onChange(swap(chapters, ci, ci + 1))}
                      aria-label={`Move chapter ${ci + 1} down`}
                    >
                      <Icon name="arrow-right" className="size-4 rotate-90" />
                    </button>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full text-ink-muted hover:bg-muted hover:text-danger"
                      onClick={() => onChange(chapters.filter((_, i) => i !== ci))}
                      aria-label={`Delete chapter ${ci + 1}${c.lessons.length ? ` and take its ${c.lessons.length} topics out of the path` : ""}`}
                      title="Delete chapter"
                    >
                      <Icon name="trash" className="size-4" />
                    </button>
                  </div>
                )}
              </div>

              <ol className={cx("mt-3 flex flex-col gap-1.5", drag && "select-none")}>
                {c.lessons.map((slug, li) => {
                  const l = info(slug);
                  const dragging = drag?.ci === ci && drag.li === li;
                  const vpos = visible.indexOf(slug);
                  return (
                    <li
                      key={slug}
                      ref={(el) => void (el ? rows.current.set(`t:${slug}`, el) : rows.current.delete(`t:${slug}`))}
                      className={cx("relative flex items-center gap-2 rounded-xl bg-muted px-2 py-2", dragging && "z-10 shadow-xl ring-2 ring-action")}
                      style={dragging ? { transform: `translateY(${drag.dy}px)` } : undefined}
                    >
                      {!dragging && vpos >= 0 && lineAt(ci, vpos) && <DropLine top />}
                      {canEdit && (
                        <button
                          type="button"
                          aria-label={`Move ${l?.title ?? slug}. Drag, or use the up and down arrow keys.`}
                          title="Drag to reorder"
                          className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink active:cursor-grabbing"
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.currentTarget.setPointerCapture(e.pointerId);
                            setDrag({ ci, li, startY: e.clientY, dy: 0, target: { ci, pos: li } });
                          }}
                          onPointerMove={(e) => {
                            if (!drag || drag.ci !== ci || drag.li !== li) return;
                            setDrag({ ...drag, dy: e.clientY - drag.startY, target: targetAt(e.clientY, { ci, li }) });
                          }}
                          onPointerUp={() => {
                            if (!drag) return;
                            const { target } = drag;
                            setDrag(null);
                            if (!(target.ci === ci && target.pos === li)) moveTopic({ ci, li }, target);
                          }}
                          onPointerCancel={() => setDrag(null)}
                          onKeyDown={(e) => {
                            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                            e.preventDefault();
                            const up = e.key === "ArrowUp";
                            if (up && li > 0) moveTopic({ ci, li }, { ci, pos: li - 1 });
                            else if (!up && li < c.lessons.length - 1) moveTopic({ ci, li }, { ci, pos: li + 1 });
                            // At the edge of a chapter, move into the one before or after.
                            else if (up && ci > 0) moveTopic({ ci, li }, { ci: ci - 1, pos: chapters[ci - 1].lessons.length });
                            else if (!up && ci < chapters.length - 1) moveTopic({ ci, li }, { ci: ci + 1, pos: 0 });
                          }}
                        >
                          <Icon name="grip" className="size-4" />
                        </button>
                      )}
                      <span className="w-5 shrink-0 text-center text-sm font-semibold text-ink-muted tabular-nums">{li + 1}.</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium leading-snug">{l?.title ?? slug}</span>
                          {l?.draft && <Badge tone="warn">Draft</Badge>}
                        </span>
                        <span className="text-xs text-ink-muted">
                          {l?.minutes ?? 0} min · {trackLabel[l?.track ?? ""] ?? "Everyone"}
                        </span>
                      </span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => update(ci, (x) => ({ ...x, lessons: x.lessons.filter((s) => s !== slug) }))}
                          aria-label={`Remove ${l?.title ?? slug}`}
                          className="grid size-8 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-danger"
                        >
                          <Icon name="close" className="size-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
                {lineAt(ci, visible.length) && (
                  <li aria-hidden className="relative h-2">
                    <DropLine top />
                  </li>
                )}
                {!c.lessons.length && (
                  <li className="rounded-xl border border-dashed border-line-strong p-3 text-center text-sm text-ink-muted">No topics yet.</li>
                )}
              </ol>
              {canEdit && (
                <AddTopic
                  catalogue={catalogue}
                  used={used}
                  canCreate={canCreate}
                  onAdd={(slug) => update(ci, (x) => ({ ...x, lessons: [...x.lessons, slug] }))}
                  onCreate={async (title) => {
                    const [made] = await createDrafts([title]);
                    update(ci, (x) => ({ ...x, lessons: [...x.lessons, made.slug] }));
                  }}
                />
              )}
            </section>
          </div>
        );
      })}
      <datalist id="path-stages">
        {stages.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {canEdit && (
        <button
          type="button"
          className={cx(btn.secondary, "self-start")}
          onClick={() => onChange([...chapters, { id: newChapterId(), title: "", description: "", stage: chapters.at(-1)?.stage ?? "", lessons: [] }])}
        >
          <Icon name="plus" className="size-4" /> Add a chapter
        </button>
      )}
    </div>
  );
}

const DropLine = ({ top }: { top?: boolean }) => (
  <span
    aria-hidden
    className={cx("absolute left-1 right-1 h-1 rounded-full bg-action shadow-[0_0_0_3px_rgb(0_130_138/0.2)]", top ? "-top-[4px]" : "-bottom-[4px]")}
  />
);

function swap<T>(list: T[], a: number, b: number) {
  const n = [...list];
  [n[a], n[b]] = [n[b], n[a]];
  return n;
}

/** Type to find a lesson to add, or create an empty draft with that title. */
function AddTopic({
  catalogue,
  used,
  canCreate,
  onAdd,
  onCreate,
}: {
  catalogue: PathLesson[];
  used: Set<string>;
  canCreate: boolean;
  onAdd: (slug: string) => void;
  onCreate: (title: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const found = needle ? catalogue.filter((l) => !used.has(l.slug) && l.title.toLowerCase().includes(needle)).slice(0, 5) : [];
  const exact = catalogue.some((l) => l.title.toLowerCase() === needle);
  return (
    <div className="relative mt-2">
      <input
        className={cx(input, "min-h-10 text-sm")}
        placeholder={canCreate ? "Add a topic: find a topic, or type a new one" : "Add a topic: find a topic"}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setError(null);
        }}
        aria-label="Add a topic"
      />
      {needle && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line-strong bg-surface shadow-lg">
          {found.map((l) => (
            <li key={l.slug}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onAdd(l.slug);
                  setQ("");
                }}
              >
                <Icon name="plus" className="size-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate">{l.title}</span>
                {l.draft && <Badge tone="warn">Draft</Badge>}
              </button>
            </li>
          ))}
          {canCreate && !exact && (
            <li>
              <button
                type="button"
                disabled={busy}
                className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm font-semibold text-accent hover:bg-muted"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onCreate(q.trim());
                    setQ("");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Icon name="pen" className="size-4 shrink-0" /> {busy ? "Creating…" : `Create draft topic “${q.trim()}”`}
              </button>
            </li>
          )}
          {!found.length && !canCreate && <li className="px-3 py-2 text-sm text-ink-muted">No topics match.</li>}
        </ul>
      )}
      {error && <ErrorNote text={error} />}
    </div>
  );
}

type Plan = OutlineChapter & { picks: (string | "new")[] };

/** Paste a course outline: preview the chapters and which topics match existing lessons, then apply. */
export function OutlineImport({
  catalogue,
  canCreate,
  replacing,
  createDrafts,
  onApply,
  onClose,
}: {
  catalogue: PathLesson[];
  canCreate: boolean;
  replacing: boolean;
  createDrafts: (titles: string[], track: string) => Promise<PathLesson[]>;
  onApply: (chapters: ChapterDraft[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<Plan[] | null>(null);
  const [track, setTrack] = useState("core");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = () => {
    const parsed = parseOutline(text);
    if (!parsed.length) {
      setError("No chapters found. Chapters look like “01 · Your Team”, with topics underneath like “1. Your Two Key Contacts”.");
      return;
    }
    setError(null);
    setPlan(parsed.map((c) => ({ ...c, picks: c.topics.map((t) => lessonMatches(t, catalogue)[0]?.slug ?? "new") })));
  };
  const newCount = plan?.reduce((n, c) => n + c.picks.filter((p) => p === "new").length, 0) ?? 0;
  const topicCount = plan?.reduce((n, c) => n + c.topics.length, 0) ?? 0;

  async function apply() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const titles = plan.flatMap((c) => c.topics.filter((_, i) => c.picks[i] === "new"));
      const made = titles.length ? await createDrafts(titles, track) : [];
      let k = 0;
      const seen = new Set<string>();
      const chapters = plan.map((c) => ({
        id: newChapterId(),
        title: c.title,
        description: c.description,
        stage: c.stage,
        // A lesson can only appear once in a path: later repeats are left out.
        lessons: c.picks.map((p) => (p === "new" ? made[k++].slug : p)).filter((s) => !seen.has(s) && Boolean(seen.add(s))),
      }));
      onApply(chapters);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="outline-title"
      className="fixed inset-0 z-50 grid place-items-center bg-[rgb(10_26_46/0.55)] p-3 sm:p-6"
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-[min(52rem,100%)] flex-col overflow-hidden rounded-3xl bg-surface text-ink shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 id="outline-title" className="font-serif text-2xl font-semibold">
              Import an outline
            </h2>
            <p className="text-sm text-ink-muted">
              Paste chapters and topics. Topics that match a topic are linked; the rest{" "}
              {canCreate ? "become empty draft topics" : "are left out (only learning authors can create topics)"}.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-muted">
            <Icon name="close" className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!plan ? (
            <>
              <textarea
                className={cx(input, "min-h-72 py-3 font-mono text-sm")}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  "Stage 1: Getting started\n01 · Your Team\nGetting connected with the people who support you.\n1. Your Two Key Contacts\n2. Who to Contact and When"
                }
                aria-label="Outline"
                autoFocus
              />
              <p className="mt-2 text-xs text-ink-muted">
                Lines like “Stage 2: …” set the stage for the chapters after them. Lines like “6 topics” are ignored.
              </p>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm">
                {plan.length} chapters · {topicCount} topics · <strong>{topicCount - newCount} linked</strong> to existing topics
                {canCreate ? (
                  <>
                    {" "}
                    · <strong>{newCount} new drafts</strong>
                  </>
                ) : null}
              </p>
              {plan.map((c, ci) => (
                <div key={ci}>
                  {c.stage && (ci === 0 || plan[ci - 1].stage !== c.stage) && (
                    <p className="mb-1 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{c.stage}</p>
                  )}
                  <div className="rounded-2xl border border-line p-3">
                    <p className="font-semibold">
                      {c.number} · {c.title}
                    </p>
                    {c.description && <p className="text-sm text-ink-muted">{c.description}</p>}
                    <ol className="mt-2 flex flex-col gap-1">
                      {c.topics.map((t, ti) => {
                        const options = lessonMatches(t, catalogue);
                        return (
                          <li key={ti} className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="w-5 text-ink-muted">{ti + 1}.</span>
                            <span className="min-w-0 flex-1">{t}</span>
                            <select
                              className={cx(input, "min-h-9 w-auto max-w-[18rem] text-xs")}
                              value={c.picks[ti]}
                              aria-label={`Topic for “${t}”`}
                              onChange={(e) =>
                                setPlan(plan.map((x, i) => (i === ci ? { ...x, picks: x.picks.map((p, j) => (j === ti ? e.target.value : p)) } : x)))
                              }
                            >
                              {options.map((o) => (
                                <option key={o.slug} value={o.slug}>
                                  Link: {o.title}
                                  {o.draft ? " (draft)" : ""}
                                </option>
                              ))}
                              {canCreate && <option value="new">New draft topic</option>}
                              {!canCreate && !options.length && <option value="new">Not available</option>}
                            </select>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && (
            <div className="mt-3">
              <ErrorNote text={error} />
            </div>
          )}
        </div>
        <footer className="flex flex-wrap items-end justify-end gap-3 border-t border-line p-5">
          {plan && canCreate && newCount > 0 && (
            <label className="mr-auto flex flex-col gap-1 text-sm font-semibold">
              New drafts are for
              <select className={cx(input, "w-auto font-normal")} value={track} onChange={(e) => setTrack(e.target.value)}>
                {Object.entries(trackLabel).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
          {plan && (
            <button type="button" className={btn.secondary} onClick={() => setPlan(null)} disabled={busy}>
              Back
            </button>
          )}
          {!plan ? (
            <button type="button" className={btn.primary} onClick={preview} disabled={!text.trim()}>
              Preview
            </button>
          ) : (
            <button type="button" className={btn.primary} onClick={apply} disabled={busy}>
              {busy
                ? "Creating drafts…"
                : `${replacing ? "Replace the path’s topics" : "Use this outline"}${newCount && canCreate ? ` and create ${newCount} drafts` : ""}`}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
