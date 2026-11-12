"use client";

import Link from "next/link";
import { DEFAULT_WHO_PHOTO } from "@/lib/pathPhoto";
import type { Thumbnail } from "@/lib/pathThumbnail";
import { StoryVisual } from "../StoryVisual";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi, type Me } from "@/lib/api";
import { cx, formatHoursMinutes } from "@/lib/format";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon } from "../Icon";
import { confirmAction } from "@/lib/confirm";
import { QrShare } from "./QrShare";
import { PathReviewShare } from "./PathReviewShare";
import { PathPublicShare } from "./PathPublicShare";
import { LessonPicker, OrderedLessons } from "./PathLessons";
import { ChapterBuilder, newChapterId, OutlineImport, type ChapterDraft, type OutlinePlan } from "./PathChapters";
import { ClaudeDraftDialog } from "./ClaudeDraft";
import { PATH_STEPS } from "@/lib/buildSequence";
import { AssignDialog, AssignedList, type AssignedPerson } from "./PathPeople";
import { QUIZ_DEFAULTS, type PathQuizSettings } from "@/lib/pathQuizSettings";

/* Learning paths: a named set of lessons, in order, that an administrator assigns to people. */

type LessonInfo = {
  summary?: string;
  slug: string;
  title: string;
  minutes: number;
  track: string | null;
  /** Still being written: learners see it as coming soon. */
  draft?: boolean;
  /** How many quick-check questions it has (published topics), for the upfront quiz. */
  checks?: number;
};
type Person = {
  id: string;
  name: string;
  audience: string;
  service_role: string | null;
  org: string;
};
type PathSummary = {
  id: string;
  name: string;
  description: string;
  audience: string;
  inOrder: boolean;
  allowSkip: boolean;
  quiz: boolean;
  lessons: LessonInfo[];
  chapters: { id: string; title: string; stage: string; slugs: string[] }[];
  minutes: number;
  thumbnail: Thumbnail | null;
  assigned: number;
  started: number;
  finished: number;
  canEdit: boolean;
};
/** Claude's draft of a path, from Generate with Claude. */
type PathDraftResult = {
  name: string;
  description: string;
  audience: string;
  whoFor: string;
  outcomes: string[];
  chapters: { title: string; description: string; stage: string; topics: ({ slug: string } | { newTopic: string })[] }[];
};
type DeletedPath = { id: string; name: string; deletedAt: string; lessons: number; assigned: number; canEdit: boolean };
type ListData = {
  paths: PathSummary[];
  deleted?: DeletedPath[];
  people: Person[];
  catalogue: LessonInfo[];
};

/** Asks first, saying who it affects, then deletes the path (it can be restored from the list). */
async function deletePath(p: { id: string; name: string; assigned: number }) {
  const ok = await confirmAction(
    `${p.assigned ? `It disappears for the ${p.assigned} ${p.assigned === 1 ? "person" : "people"} assigned to it. ` : ""}The topics themselves aren’t touched, and topic completions are kept. You can restore it from Deleted learning paths.`,
    { title: `Delete “${p.name}”?`, confirmLabel: "Delete", danger: true },
  );
  if (!ok) return false;
  await api(`/api/admin/learning-paths/${encodeURIComponent(p.id)}`, { method: "DELETE" });
  return true;
}
type Step = LessonInfo & { completedAt: string | null; locked: boolean };
type Assignment = {
  userId: string;
  name: string;
  org: string;
  dueDate: string | null;
  assignedAt: string;
  selfEnrolled: boolean;
  steps: Step[];
  completed: number;
  total: number;
  nextSlug: string | null;
  done: boolean;
  quiz: AssignedPerson["quiz"];
};
type Detail = {
  id: string;
  name: string;
  description: string;
  audience: string;
  inOrder: boolean;
  allowSkip: boolean;
  whoFor: string;
  whoPhoto?: string;
  outcomes: string[];
  reward: string;
  quiz: PathQuizSettings | null;
  lessons: string[];
  chapters: ChapterDraft[];
  canEdit: boolean;
  assignments: Assignment[];
  people: Person[];
  catalogue: LessonInfo[];
};

export function LearningPathList() {
  const { data, error: loadError, reload } = useApi<ListData>("/api/admin/learning-paths");
  const me = useApi<Me>("/api/me").data;
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const error = actionError ?? loadError;
  async function remove(p: PathSummary) {
    setActionError(null);
    try {
      if (await deletePath(p)) {
        setNotice(`“${p.name}” deleted.`);
        reload();
      }
    } catch (e) {
      setActionError((e as Error).message);
    }
  }
  async function restore(p: DeletedPath) {
    setActionError(null);
    try {
      await api(`/api/admin/learning-paths/${encodeURIComponent(p.id)}`, { body: { action: "restore" } });
      setNotice(`“${p.name}” restored.`);
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }
  const deleted = data?.deleted ?? [];
  return (
    <AdminShell title="Learning paths">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-3xl text-ink-muted">
          A learning path is a named set of topics in order. Build one, then assign it to the people who need it. They’ll see it on their Learning page with
          their progress and what’s next.
        </p>
        <Link href="/admin/learning-paths/new" className={btn.primary}>
          <Icon name="plus" className="size-4" /> New learning path
        </Link>
      </div>
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}
      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : !data.paths.length ? (
        <p className="mt-6 rounded-3xl border border-dashed border-line-strong p-6 text-center text-ink-muted">No learning paths yet.</p>
      ) : (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {data.paths.map((p) => (
            <PathTile key={p.id} path={p} canPreview={Boolean(me?.canAuthor)} onDelete={() => remove(p)} />
          ))}
        </ul>
      )}
      {notice && (
        <p role="status" className="mt-4 rounded-2xl bg-tealtint px-4 py-2 text-sm">
          {notice}
        </p>
      )}
      {deleted.length > 0 && (
        <section className="mt-8">
          <button
            type="button"
            aria-expanded={showDeleted}
            onClick={() => setShowDeleted((s) => !s)}
            className="inline-flex min-h-11 items-center gap-2 font-semibold text-ink-muted hover:text-ink"
          >
            <Icon name="trash" className="size-4" /> Deleted learning paths ({deleted.length})
            <Icon name="chevron-down" className={cx("size-4 transition-transform", showDeleted && "rotate-180")} />
          </button>
          {showDeleted && (
            <ul className="mt-2 flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
              {deleted.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{p.name}</span>
                    <span className="text-sm text-ink-muted">
                      {p.lessons} {p.lessons === 1 ? "topic" : "topics"}
                      {p.assigned ? ` · was assigned to ${p.assigned}` : ""} · deleted{" "}
                      {new Date(p.deletedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </span>
                  {p.canEdit && (
                    <button type="button" className={btn.secondary} onClick={() => restore(p)}>
                      <Icon name="refresh" className="size-4" /> Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </AdminShell>
  );
}

/**
  One path on the list: what it's for, how far through writing it is, its shape (stages and
  chapters, or the first few lessons) and how the people on it are going.
*/
function PathTile({ path: p, canPreview, onDelete }: { path: PathSummary; canPreview: boolean; onDelete: () => void }) {
  const ready = p.lessons.filter((l) => !l.draft).length;
  const drafts = p.lessons.length - ready;
  const isReady = new Set(p.lessons.filter((l) => !l.draft).map((l) => l.slug));
  const pct = (n: number, of: number) => `${of ? (n / of) * 100 : 0}%`;
  // Chapters under their stage headings, in order; a stage shows once, over its first chapter.
  const stages: { stage: string; chapters: (PathSummary["chapters"][number] & { number: number })[] }[] = [];
  p.chapters.forEach((c, i) => {
    const last = stages[stages.length - 1];
    if (last && last.stage === c.stage) last.chapters.push({ ...c, number: i + 1 });
    else stages.push({ stage: c.stage, chapters: [{ ...c, number: i + 1 }] });
  });
  const preview = 4;
  const notStarted = p.assigned - p.started - p.finished;

  return (
    <li className="relative flex flex-col gap-4 overflow-hidden rounded-3xl border border-line bg-surface p-5 hover:border-line-strong">
      {p.thumbnail && <StoryVisual {...p.thumbnail} alt="" className="-mx-5 -mt-5 aspect-[16/7]" />}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {p.audience && <Badge tone="info">{p.audience}</Badge>}
          {!p.lessons.length && <Badge tone="warn">Planned: no topics yet</Badge>}
          {p.allowSkip && <Badge tone="warn">Testing: skipping allowed</Badge>}
          {p.quiz && <Badge tone="neutral">Upfront quiz</Badge>}
        </div>
        <p className="mt-2 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
          {p.chapters.length ? `${p.chapters.length} chapters · ` : ""}
          {p.lessons.length} {p.lessons.length === 1 ? "topic" : "topics"} · {formatHoursMinutes(p.minutes)}
          {p.inOrder ? " · in order" : ""}
        </p>
        <h2 className="mt-1 font-serif text-xl font-semibold">
          <Link href={`/admin/learning-paths/${p.id}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">
            {p.name}
          </Link>
        </h2>
        {p.description && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{p.description}</p>}
      </div>

      {p.lessons.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div
            className="flex h-2 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${ready} of ${p.lessons.length} topics ready, ${drafts} in draft`}
          >
            <div className="h-full bg-action" style={{ width: pct(ready, p.lessons.length) }} />
            <div className="h-full bg-gold/60" style={{ width: pct(drafts, p.lessons.length) }} />
          </div>
          <p className="flex flex-wrap gap-x-3 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-action" aria-hidden /> <strong className="text-ink">{ready}</strong> ready for learners
            </span>
            {drafts > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-gold/60" aria-hidden /> <strong className="text-ink">{drafts}</strong> still in draft
              </span>
            )}
          </p>
        </div>
      )}

      {stages.length > 0 ? (
        <div className="flex flex-col gap-4">
          {stages.map((st, si) => (
            <div key={si}>
              {st.stage && <p className="mb-1 font-mulish text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-ink-muted">{st.stage}</p>}
              <ol className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {st.chapters.map((c) => {
                  const done = c.slugs.filter((x) => isReady.has(x)).length;
                  return (
                    <li key={c.id} className="flex items-baseline gap-2 text-sm">
                      <span className="font-serif font-semibold text-accent tabular-nums">{String(c.number).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      <span
                        className={cx(
                          "shrink-0 text-xs tabular-nums",
                          c.slugs.length && done === c.slugs.length ? "font-semibold text-success" : "text-ink-muted",
                        )}
                        title={`${done} of ${c.slugs.length} ready`}
                      >
                        {done}/{c.slugs.length}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      ) : (
        p.lessons.length > 0 && (
          <ol className="flex flex-col gap-1 text-sm">
            {p.lessons.slice(0, preview).map((l, i) => (
              <li key={l.slug} className="flex items-baseline gap-2">
                <span className="font-serif font-semibold text-accent tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{l.title}</span>
                {l.draft && <span className="shrink-0 text-xs text-ink-muted">Draft</span>}
              </li>
            ))}
            {p.lessons.length > preview && <li className="pl-5 text-xs text-ink-muted">and {p.lessons.length - preview} more</li>}
          </ol>
        )
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        {p.assigned ? (
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <div
              className="flex h-1.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${p.finished} finished, ${p.started} in progress, ${notStarted} not started`}
            >
              <div className="h-full bg-success" style={{ width: pct(p.finished, p.assigned) }} />
              <div className="h-full bg-action/50" style={{ width: pct(p.started, p.assigned) }} />
            </div>
            <p className="text-xs text-ink-muted">
              <strong className="text-ink">{p.assigned}</strong> assigned · {p.started} in progress · {p.finished} finished
            </p>
          </div>
        ) : (
          <p className="text-xs text-ink-muted">Not assigned to anyone yet</p>
        )}
        <div className="flex items-center gap-1">
          {canPreview && p.lessons.length > 0 && (
            <Link href={`/paths/${encodeURIComponent(p.id)}?preview=1`} className={cx(btn.quiet, "relative z-10")}>
              <Icon name="play" className="size-4" /> Preview
            </Link>
          )}
          {p.canEdit && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${p.name}`}
              title="Delete learning path"
              className="relative z-10 grid size-11 place-items-center rounded-full text-ink-muted hover:bg-muted hover:text-danger"
            >
              <Icon name="trash" className="size-4" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function LearningPathEditor({ id }: { id?: string }) {
  const isNew = !id;
  const list = useApi<ListData>(isNew ? "/api/admin/learning-paths" : null);
  const detail = useApi<Detail>(id ? `/api/admin/learning-paths/${id}` : null);
  const source = isNew ? list.data : detail.data;
  const loadError = isNew ? list.error : detail.error;
  if (loadError || !source) {
    return (
      <AdminShell title={isNew ? "New learning path" : "Learning path"} back={{ href: "/admin/learning-paths", label: "Learning paths" }}>
        {loadError ? <ErrorNote text={loadError} /> : <p className="text-ink-muted">Loading…</p>}
      </AdminShell>
    );
  }
  return <PathForm id={id} catalogue={source.catalogue} detail={detail.data} reload={detail.reload} />;
}

function PathForm({ id, catalogue, detail, reload }: { id?: string; catalogue: LessonInfo[]; detail: Detail | null; reload: () => void }) {
  const router = useRouter();
  const isNew = !id;
  const [name, setName] = useState(detail?.name ?? "");
  const [description, setDescription] = useState(detail?.description ?? "");
  const [audience, setAudience] = useState(detail?.audience ?? "");
  const [inOrder, setInOrder] = useState(detail?.inOrder ?? true);
  const [allowSkip, setAllowSkip] = useState(detail?.allowSkip ?? false);
  const [quizOn, setQuizOn] = useState(Boolean(detail?.quiz));
  const [quiz, setQuiz] = useState<PathQuizSettings>(detail?.quiz ?? QUIZ_DEFAULTS);
  const [whoFor, setWhoFor] = useState(detail?.whoFor ?? "");
  // One outcome per line while editing.
  const [outcomes, setOutcomes] = useState((detail?.outcomes ?? []).join("\n"));
  const [reward, setReward] = useState(detail?.reward ?? "");
  const [whoPhoto, setWhoPhoto] = useState(detail?.whoPhoto ?? "");
  const [flat, setPicked] = useState<string[]>(detail?.lessons ?? []);
  // Chapters (with optional stages); null for a path that's a plain list of lessons.
  const [chapters, setChapters] = useState<ChapterDraft[] | null>(detail?.chapters?.length ? detail.chapters : null);
  const [addTo, setAddTo] = useState(-1);
  const [importing, setImporting] = useState(false);
  // Generate with Claude: the brief dialog, then Claude's outline to review (with its overview).
  const [generating, setGenerating] = useState(false);
  const [claudeOutline, setClaudeOutline] = useState<{ plan: OutlinePlan[]; draft: PathDraftResult } | null>(null);
  const [genAudience, setGenAudience] = useState("core");
  // Draft lessons created here, so they show before the catalogue reloads.
  const [created, setCreated] = useState<LessonInfo[]>([]);
  const me = useApi<Me>("/api/me").data;
  const picked = chapters ? chapters.flatMap((c) => c.lessons) : flat;
  const allLessons = [...catalogue, ...created.filter((c) => !catalogue.some((l) => l.slug === c.slug))];
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const info = (slug: string) => allLessons.find((l) => l.slug === slug);
  async function createDrafts(titles: string[], track = "core") {
    const r = await api<{ lessons: LessonInfo[] }>("/api/admin/lessons/placeholders", { body: { titles, track } });
    setCreated((c) => [...c, ...r.lessons]);
    return r.lessons;
  }
  const setChaptered = (next: ChapterDraft[] | null) => change(() => setChapters(next));
  const minutes = picked.reduce((n, s) => n + (info(s)?.minutes ?? 0), 0);
  const canEdit = isNew || Boolean(detail?.canEdit);
  const change = (fn: () => void) => {
    fn();
    setDirty(true);
    setNotice(null);
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name,
        description,
        audience,
        inOrder,
        allowSkip,
        quiz: quizOn ? quiz : null,
        whoFor,
        whoPhoto,
        outcomes: outcomes
          .split("\n")
          .map((o) => o.replace(/^\s*[-•*]\s*/, "").trim())
          .filter(Boolean),
        reward,
        lessons: picked,
        ...(chapters ? { chapters } : {}),
      };
      if (isNew) {
        const r = await api<{ id: string }>("/api/admin/learning-paths", {
          body: payload,
        });
        router.push(`/admin/learning-paths/${r.id}`);
        return;
      }
      await api(`/api/admin/learning-paths/${id}`, {
        method: "PUT",
        body: payload,
      });
      setDirty(false);
      setNotice("Saved. People already assigned see the updated topics straight away.");
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!id) return;
    setBusy(true);
    try {
      if (!(await deletePath({ id, name, assigned: detail?.assignments.length ?? 0 }))) {
        setBusy(false);
        return;
      }
      router.push("/admin/learning-paths");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <AdminShell title={isNew ? "New learning path" : name || "Learning path"} back={{ href: "/admin/learning-paths", label: "Learning paths" }}>
      {me?.canAuthor && canEdit && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-tealtint px-4 py-3 text-sm">
          <Icon name="spark" className="size-4 text-accent" />
          <span className="min-w-0 flex-1">
            Start from a brief and Claude drafts the path: who it’s for, the outcomes, and chapters of topics, using your existing topics where they fit.
          </span>
          <button type="button" className={btn.primary} onClick={() => setGenerating(true)}>
            <Icon name="spark" className="size-4" /> Generate with Claude
          </button>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-6">
          <section className="rounded-3xl border border-line bg-surface p-5">
            <h2 className="mb-4 font-serif text-xl font-semibold">About this path</h2>
            <fieldset disabled={!canEdit} className="grid gap-4">
              <Field label="Name" hint="People see this on their Learning page.">
                <input
                  className={input}
                  value={name}
                  onChange={(e) => change(() => setName(e.target.value))}
                  placeholder="For example: Service partner essentials"
                  maxLength={120}
                />
              </Field>
              <Field label="Audience label" hint="A short tag on the path, for example: Care Coordinators, or All staff and partners.">
                <input className={input} value={audience} onChange={(e) => change(() => setAudience(e.target.value))} maxLength={120} />
              </Field>
              <Field label="What it covers" hint="Two or three sentences at the top of the path page. Say what it's about and why it matters.">
                <textarea
                  rows={3}
                  className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[0.98rem]"
                  value={description}
                  onChange={(e) => change(() => setDescription(e.target.value))}
                  maxLength={500}
                />
              </Field>
              <Field label="Who it’s for" hint="A sentence for the learner, for example: New care coordinators in their first month with Trilogy Care.">
                <textarea
                  rows={2}
                  className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[0.98rem]"
                  value={whoFor}
                  onChange={(e) => change(() => setWhoFor(e.target.value))}
                  maxLength={300}
                />
              </Field>
              <WhoPhotoField value={whoPhoto} onChange={(src) => change(() => setWhoPhoto(src))} />
              <Field label="What you’ll be able to do" hint="One outcome per line, up to 8. Start each with a verb: Know…, Run…, Recognise…">
                <textarea
                  rows={5}
                  className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[0.98rem]"
                  value={outcomes}
                  onChange={(e) => change(() => setOutcomes(e.target.value))}
                />
              </Field>
              <Field label="What you get at the end" hint="For example: A certificate of completion you can download and keep.">
                <input className={input} value={reward} onChange={(e) => change(() => setReward(e.target.value))} maxLength={300} />
              </Field>
              <label className="flex min-h-11 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 accent-[var(--action)]"
                  checked={inOrder}
                  onChange={(e) => change(() => setInOrder(e.target.checked))}
                />
                <span>
                  <span className="font-semibold">Complete in order</span>
                  <span className="block text-sm text-ink-muted">Each topic opens once the one before it is finished.</span>
                </span>
              </label>
              <label className="flex min-h-11 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 accent-[var(--action)]"
                  checked={allowSkip}
                  onChange={(e) => change(() => setAllowSkip(e.target.checked))}
                />
                <span>
                  <span className="font-semibold">Allow skipping before audio or video finishes</span>
                  <span className="block text-sm text-ink-muted">
                    For testers. People on this path can continue or swipe on without waiting for audio, video or Required completion. They still answer quizzes
                    and other questions.
                  </span>
                </span>
              </label>
              <QuizSettings
                on={quizOn}
                value={quiz}
                topics={picked.map(info).filter((l): l is LessonInfo => Boolean(l))}
                onToggle={(v) => change(() => setQuizOn(v))}
                onChange={(v) => change(() => setQuiz(v))}
              />
            </fieldset>
          </section>

          {canEdit && (
            <LessonPicker
              catalogue={allLessons}
              picked={picked}
              toolbar={
                chapters && chapters.length > 0 ? (
                  <label className="flex flex-col gap-1 text-sm font-semibold">
                    Add to
                    <select
                      className={cx(input, "w-auto max-w-[14rem] font-normal")}
                      value={addTo < 0 || addTo >= chapters.length ? chapters.length - 1 : addTo}
                      onChange={(e) => setAddTo(Number(e.target.value))}
                    >
                      {chapters.map((c, i) => (
                        <option key={c.id} value={i}>
                          {String(i + 1).padStart(2, "0")} · {c.title || "Untitled chapter"}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null
              }
              onToggle={(slug, on) => {
                if (!chapters) return change(() => setPicked(on ? [...flat, slug] : flat.filter((s) => s !== slug)));
                const target = addTo < 0 || addTo >= chapters.length ? chapters.length - 1 : addTo;
                setChaptered(
                  chapters.map((c, i) => ({
                    ...c,
                    lessons: on ? (i === target ? [...c.lessons, slug] : c.lessons) : c.lessons.filter((s) => s !== slug),
                  })),
                );
              }}
            />
          )}

          <section className="rounded-3xl border border-line bg-surface p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl font-semibold">{canEdit ? (chapters ? "2. Chapters and topics" : "2. Put them in order") : "Topics"}</h2>
              <span className="text-sm text-ink-muted">
                {chapters ? `${chapters.length} ${chapters.length === 1 ? "chapter" : "chapters"} · ` : ""}
                {picked.length} {picked.length === 1 ? "topic" : "topics"} · about {formatHoursMinutes(minutes)}
              </span>
            </div>
            {canEdit && (
              <div className="mb-4 flex flex-wrap gap-2">
                {!chapters && (
                  <button
                    type="button"
                    className={btn.secondary}
                    onClick={() => setChaptered([{ id: newChapterId(), title: "", description: "", stage: "", lessons: flat }])}
                  >
                    <Icon name="list" className="size-4" /> Organise into chapters
                  </button>
                )}
                <button type="button" className={btn.secondary} onClick={() => setImporting(true)}>
                  <Icon name="doc" className="size-4" /> Import an outline
                </button>
                {chapters && (
                  <button
                    type="button"
                    className={btn.quiet}
                    onClick={async () => {
                      if (
                        await confirmAction("The topics stay in the path, in the same order, as one list.", {
                          title: "Remove the chapters?",
                          confirmLabel: "Remove chapters",
                        })
                      ) {
                        setPicked(picked);
                        setChaptered(null);
                      }
                    }}
                  >
                    Remove chapters
                  </button>
                )}
              </div>
            )}
            {generating && (
              <ClaudeDraftDialog<{ draft: PathDraftResult }>
                title="Generate the path with Claude"
                intro="Describe the path, and attach a policy or course outline if you have one. Claude plans it using your existing topics where they fit, and names any new ones to write. You review the outline before anything changes."
                steps={PATH_STEPS}
                endpoint="/api/admin/learning-paths/draft"
                placeholder="For example: New care coordinators in their first month. They need to know who to contact, the rules that protect clients, and how to manage budgets and incidents."
                extra={
                  <label className="flex flex-col gap-1 text-sm font-semibold">
                    Who it’s for
                    <select className={cx(input, "font-normal")} value={genAudience} onChange={(e) => setGenAudience(e.target.value)}>
                      <option value="core">Everyone</option>
                      <option value="partner">Service partners</option>
                      <option value="coordinator">Care coordinators</option>
                    </select>
                  </label>
                }
                addFields={(form) => form.append("audience", genAudience)}
                onClose={() => setGenerating(false)}
                onDone={({ draft }) => {
                  setGenerating(false);
                  setClaudeOutline({
                    draft,
                    plan: draft.chapters.map((c, i) => ({
                      number: String(i + 1).padStart(2, "0"),
                      title: c.title,
                      description: c.description,
                      stage: c.stage,
                      topics: c.topics.map((t) => ("slug" in t ? (info(t.slug)?.title ?? t.slug) : t.newTopic)),
                      picks: c.topics.map((t) => ("slug" in t ? t.slug : "new")),
                    })),
                  });
                }}
              />
            )}
            {claudeOutline && (
              <OutlineImport
                catalogue={allLessons}
                canCreate={Boolean(me?.canAuthor)}
                replacing={picked.length > 0}
                createDrafts={createDrafts}
                initialPlan={claudeOutline.plan}
                heading="Claude’s outline"
                blurb={
                  <>
                    <strong>{claudeOutline.draft.name}</strong>. Check each topic: change any link, or make it a new draft. Applying also fills in any empty
                    overview fields (name, description, who it’s for and outcomes) with Claude’s wording.
                  </>
                }
                onClose={() => setClaudeOutline(null)}
                onApply={(next) => {
                  const d = claudeOutline.draft;
                  setClaudeOutline(null);
                  change(() => {
                    if (!name.trim()) setName(d.name);
                    if (!description.trim()) setDescription(d.description);
                    if (!audience.trim()) setAudience(d.audience);
                    if (!whoFor.trim()) setWhoFor(d.whoFor);
                    if (!outcomes.trim()) setOutcomes(d.outcomes.join("\n"));
                  });
                  setChaptered(next);
                  setNotice("Claude’s outline is in. Check the topics and the overview, then save.");
                }}
              />
            )}
            {importing && (
              <OutlineImport
                catalogue={allLessons}
                canCreate={Boolean(me?.canAuthor)}
                replacing={picked.length > 0}
                createDrafts={createDrafts}
                onClose={() => setImporting(false)}
                onApply={(next) => {
                  setImporting(false);
                  setChaptered(next);
                  setNotice(null);
                }}
              />
            )}
            {chapters ? (
              <ChapterBuilder
                chapters={chapters}
                onChange={setChaptered}
                info={info}
                catalogue={allLessons}
                canEdit={canEdit}
                canCreate={Boolean(me?.canAuthor)}
                createDrafts={(titles) => createDrafts(titles)}
              />
            ) : !picked.length ? (
              <p className="rounded-2xl border border-dashed border-line-strong p-4 text-center text-ink-muted">
                Add topics above and they appear here. Drag them into order.
              </p>
            ) : (
              <OrderedLessons
                slugs={picked}
                info={info}
                canEdit={canEdit}
                onReorder={(from, to) =>
                  change(() =>
                    setPicked((p) => {
                      const n = [...p];
                      const [moved] = n.splice(from, 1);
                      n.splice(to, 0, moved);
                      return n;
                    }),
                  )
                }
                onRemove={(slug) => change(() => setPicked(picked.filter((s) => s !== slug)))}
              />
            )}
          </section>

          {error && <ErrorNote text={error} />}
          {notice && (
            <p role="status" className="rounded-2xl bg-tealtint p-3 text-sm">
              {notice}
            </p>
          )}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn.primary} disabled={busy || (!dirty && !isNew)} onClick={save}>
                {busy ? "Saving…" : isNew ? "Create learning path" : "Save changes"}
              </button>
              {!isNew && (
                <button type="button" className={btn.danger} disabled={busy} onClick={archive}>
                  <Icon name="trash" className="size-4" /> Delete learning path
                </button>
              )}
            </div>
          )}
          {!isNew && id && (
            <div className="flex flex-wrap gap-2">
              {me?.canAuthor && (
                <Link href={`/paths/${encodeURIComponent(id)}?preview=1`} className={btn.secondary} title={dirty ? "Shows the last saved version" : undefined}>
                  <Icon name="play" className="size-4" /> Preview path
                </Link>
              )}
              <QrShare kind="path" id={id} assigned={detail?.assignments.length ?? 0} className={btn.secondary} />
            </div>
          )}
          {!isNew && id && me?.canAuthor && <PathReviewShare id={id} />}
          {!isNew && id && me?.canAuthor && <PathPublicShare id={id} />}
          {!canEdit && (
            <p className="text-sm text-ink-muted">Made by another organisation’s administrator or a learning author. You can assign it to your people.</p>
          )}
        </div>

        <aside>
          {isNew ? (
            <div className="rounded-3xl border border-dashed border-line-strong p-5 text-sm text-ink-muted">
              <h2 className="mb-1 font-semibold text-ink">Assign people</h2>
              Create the path first, then assign it to people here.
            </div>
          ) : (
            detail &&
            (detail.lessons.length ? (
              <People detail={detail} onChange={reload} />
            ) : (
              <div className="rounded-3xl border border-dashed border-line-strong p-5 text-sm text-ink-muted">
                <h2 className="mb-1 font-semibold text-ink">Assign people</h2>
                This path is still being planned. Tick at least one topic and save, then you can assign it.
              </div>
            ))
          )}
        </aside>
      </div>
    </AdminShell>
  );
}

function People({ detail, onChange }: { detail: Detail; onChange: () => void }) {
  const [assigning, setAssigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // People who enrolled themselves can still be assigned (with a due date), which makes it an assignment.
  const assignedIds = new Set(detail.assignments.filter((a) => !a.selfEnrolled).map((a) => a.userId));
  const available = detail.people.filter((p) => !assignedIds.has(p.id));
  const selfCount = detail.assignments.filter((a) => a.selfEnrolled).length;

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/learning-paths/${detail.id}/assignments`, { body });
      onChange();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-24">
      <section className="rounded-3xl border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl font-semibold">Assigned</h2>
          <span className="text-sm text-ink-muted">
            {detail.assignments.length}
            {selfCount > 0 && ` · ${selfCount} self-enrolled`}
          </span>
        </div>
        <AssignedList
          assigned={detail.assignments.map((a) => ({
            userId: a.userId,
            name: a.name,
            org: a.org,
            dueDate: a.dueDate,
            selfEnrolled: a.selfEnrolled,
            completed: a.completed,
            total: a.total,
            done: a.done,
            nextTitle: a.steps.find((s) => s.slug === a.nextSlug)?.title ?? null,
            quiz: a.quiz,
          }))}
          onClearQuiz={async (a) => {
            if (
              await confirmAction(`${a.name} can take the upfront quiz again, with the full number of tries. Their earlier results stay on record.`, {
                title: `Give ${a.name} another try?`,
                confirmLabel: "Allow another try",
              })
            )
              await send({ action: "clear-quiz", userId: a.userId });
          }}
          busy={busy}
          onRemove={async (a) => {
            if (
              await confirmAction(`${a.name} will no longer see this path. The topics they’ve finished stay finished.`, {
                title: `Remove ${a.name}?`,
                confirmLabel: "Remove",
                danger: true,
              })
            )
              await send({ action: "remove", userId: a.userId });
          }}
        />
        {error && !assigning && (
          <div className="mt-3">
            <ErrorNote text={error} />
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-serif text-xl font-semibold">Assign people</h2>
        {!available.length ? (
          <p className="mt-2 text-sm text-ink-muted">Everyone you can assign already has this path.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-muted">
              {available.length} {available.length === 1 ? "person" : "people"} can be assigned. Search, filter by organisation or role, or select everyone who
              matches.
            </p>
            <button type="button" className={cx(btn.primary, "mt-3 w-full")} onClick={() => setAssigning(true)}>
              <Icon name="plus" className="size-4" /> Assign people
            </button>
          </>
        )}
      </section>
      {assigning && (
        <AssignDialog
          people={available}
          busy={busy}
          error={error}
          onClose={() => setAssigning(false)}
          onAssign={async (ids, due) => {
            if (await send({ action: "assign", userIds: ids, dueDate: due })) setAssigning(false);
          }}
        />
      )}
    </div>
  );
}

/** Every lesson that can go in a path, with a checkbox. Ticking adds it to the end of the order. */

/** A picture behind the "Who it's for" panel on the path page, chosen from the image library. */
function WhoPhotoField({ value, onChange }: { value: string; onChange: (src: string) => void }) {
  const [open, setOpen] = useState(false);
  const library = useApi<{ uploads: { src: string; name: string }[] }>(open ? "/api/admin/uploads" : null).data;
  return (
    <Field
      label="Picture behind “Who it’s for”"
      hint="Shown under a navy tint so the text stays readable. Without a picture of its own, the path uses the default."
    >
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-16 w-24 rounded-xl object-cover ring-1 ring-line" />
        ) : (
          <span className="relative h-16 w-24 overflow-hidden rounded-xl ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={DEFAULT_WHO_PHOTO} alt="" className="size-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[0.65rem] font-semibold text-white">Default</span>
          </span>
        )}
        <button type="button" className={btn.secondary} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Done" : "Change picture"}
        </button>
        {value && (
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => onChange("")}>
            Use the default
          </button>
        )}
      </div>
      {open && (
        <ul className="mt-2 grid max-h-64 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
          {!library ? (
            <li className="col-span-full text-sm text-ink-muted">Loading the image library…</li>
          ) : (
            library.uploads.map((p) => (
              <li key={p.src}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(p.src);
                    setOpen(false);
                  }}
                  aria-pressed={value === p.src}
                  aria-label={`Use ${p.name}`}
                  className={cx("block aspect-square w-full overflow-hidden rounded-lg border-2", value === p.src ? "border-action" : "border-transparent")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt="" className="size-full object-cover" />
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </Field>
  );
}

/** The upfront quiz: on or off, and when on, how many questions, the pass mark and the number of tries. */
function QuizSettings({
  on,
  value: q,
  topics,
  onToggle,
  onChange,
}: {
  on: boolean;
  value: PathQuizSettings;
  topics: LessonInfo[];
  onToggle: (on: boolean) => void;
  onChange: (q: PathQuizSettings) => void;
}) {
  const num = (v: string) => (v === "" ? null : Number(v));
  // What the quiz can draw on: published topics with a quick check. Drafts aren't asked about until they're published.
  const live = topics.filter((t) => !t.draft);
  const tested = live.filter((t) => (t.checks ?? 0) > 0);
  const untested = live.filter((t) => !t.checks);
  const pool = tested.reduce((n, t) => n + (t.checks ?? 0), 0);
  const asked = Math.min(q.questions ?? tested.length, pool);
  return (
    <div className={cx("rounded-2xl border p-4", on ? "border-action/50 bg-tealtint/40" : "border-line")}>
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" className="mt-0.5 size-5 accent-[var(--action)]" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        <span>
          <span className="font-semibold">Offer an upfront quiz</span>
          <span className="block text-sm text-ink-muted">
            For people who think they know it already. Pass it and every topic in the path is complete, certificate included. Questions are drawn from the
            topics’ quick checks, shuffled for each person.
          </span>
        </span>
      </label>
      {on && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Questions" hint={`Leave empty for one from each topic with a quick check${tested.length ? ` (${tested.length})` : ""}.`}>
            <input
              type="number"
              min={5}
              max={200}
              className={input}
              value={q.questions ?? ""}
              placeholder={tested.length ? String(tested.length) : "One per topic"}
              onChange={(e) => onChange({ ...q, questions: num(e.target.value) })}
            />
          </Field>
          <Field label="Pass mark (%)" hint="Between 50 and 100.">
            <input
              type="number"
              min={50}
              max={100}
              className={input}
              value={q.passMark}
              onChange={(e) => onChange({ ...q, passMark: Number(e.target.value) })}
            />
          </Field>
          <Field label="Tries" hint="Each person’s attempts. You can allow another from the Assigned list.">
            <input type="number" min={1} max={5} className={input} value={q.attempts} onChange={(e) => onChange({ ...q, attempts: Number(e.target.value) })} />
          </Field>
          <div className="text-sm sm:col-span-3">
            {!pool ? (
              <p className="rounded-xl border border-danger/60 bg-surface p-3">
                None of this path’s published topics has a quick check yet, so there’s nothing to ask. Learners won’t see the quiz until one does.
              </p>
            ) : (
              <p>
                <strong>
                  {asked} {asked === 1 ? "question" : "questions"}
                </strong>{" "}
                from {tested.length} {tested.length === 1 ? "topic" : "topics"}, out of {pool} quick-check {pool === 1 ? "question" : "questions"} in the path.
                {q.questions && q.questions > pool ? ` That’s all of them: ask for ${pool} or fewer.` : ""}
              </p>
            )}
            {pool > 0 && untested.length > 0 && (
              <p className="mt-2 rounded-xl border border-gold bg-gold/15 p-3">
                <strong>
                  {untested.length} {untested.length === 1 ? "topic has" : "topics have"} no quick check
                </strong>
                , so the quiz can’t test {untested.length === 1 ? "it" : "them"}, but passing still marks {untested.length === 1 ? "it" : "them"} complete:{" "}
                {untested.map((t) => `“${t.title}”`).join(", ")}. Add a quick check to {untested.length === 1 ? "it" : "each"} to include{" "}
                {untested.length === 1 ? "it" : "them"}.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
