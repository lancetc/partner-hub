"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api, useApi, type Me } from "@/lib/api";
import { AdminShell, Badge, btn, ErrorNote, input } from "./ui";
import { Icon } from "../Icon";
import { cumulative, spacedWhen } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { QrShare } from "./QrShare";
import { StoryVisual } from "../StoryVisual";
import { cx } from "@/lib/format";
import type { Lesson } from "@/content/lessons";

type Variation = { stage: string; slug: string; title: string; cards: number; minutes: number; source: string; gap: number; variant: string | null };
type LessonRow = {
  slug: string;
  title: string;
  track: string;
  minutes: number;
  cards: number;
  visual: Lesson["visual"];
  /** Last edited in the editor; null for content-file lessons never edited. */
  updatedAt: string | null;
  /** `unpublished`: saved in the editor, never live. `changes`: live, with saved edits not yet published. */
  status: "unpublished" | "live" | "changes";
  spaced: boolean;
  signoff: boolean;
  state: "off" | "live" | "review" | "empty";
  needsReview: boolean;
  pathId: string | null;
  pathName: string | null;
  variations: Variation[];
};
type DeletedRow = { slug: string; title: string; cards: number; deletedAt: string; published: boolean };
type Overview = { lessons: LessonRow[]; deleted?: DeletedRow[]; generator: { model: string; maxInstructions: number; connected: boolean } };
type ActionName = "enable" | "disable" | "regenerate" | "approve" | "signoff_on" | "signoff_off";
type Act = (a: ActionName, instructions?: string) => void;

const SUGGESTIONS = [
  "Use examples from both cleaning and gardening visits.",
  "Keep every follow up under two minutes.",
  "Make the Apply scenario about a request from a family member.",
  "Use simpler words for people reading in a second language.",
];

/** Master lessons with the spaced learning checkbox. Ticking it asks Claude to write the follow ups. */
export function LessonsAdmin() {
  const me = useApi<Me>("/api/me").data;
  const data = useApi<Overview>("/api/admin/lessons");
  const [busy, setBusy] = useState<{ slug: string; action: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Delete hides the lesson everywhere (it can be restored); restore brings it back. */
  async function lifecycle(l: { slug: string; title: string }, action: "delete" | "restore") {
    if (
      action === "delete" &&
      !(await confirmAction(
        "Learners won’t see it any more and it leaves this list. Their progress and completions are kept, and you can restore it from Deleted lessons.",
        {
          title: `Delete “${l.title}”?`,
          confirmLabel: "Delete lesson",
          danger: true,
        },
      ))
    )
      return;
    setBusy({ slug: l.slug, action });
    setError(null);
    try {
      await api(`/api/admin/lessons/${l.slug}/content`, { body: { action } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      data.reload();
    }
  }

  async function act(slug: string, action: ActionName, instructions?: string) {
    setBusy({ slug, action });
    setError(null);
    try {
      await api(`/api/admin/lessons/${slug}`, { body: { action, instructions } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      data.reload();
    }
  }

  return (
    <AdminShell title="Lessons">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-semibold">Master lessons</h2>
        {me?.canAuthor && (
          <Link href="/admin/lessons/new" className={btn.primary}>
            <Icon name="plus" className="size-4" /> New lesson
          </Link>
        )}
      </div>
      <p className="max-w-3xl text-ink-muted">
        Write one master lesson. Tick <strong>Spaced learning</strong> and Claude writes the follow ups from it: a quick Recall at week 2, an Apply scenario at
        month 2 and a Refresh at week 14, with an easier Refresh for anyone who struggled. Review them, then approve to send them to learners.
      </p>
      {data.data && !data.data.generator.connected && (
        <p className="mt-4 flex max-w-3xl items-start gap-2 rounded-2xl border-2 border-dashed border-gold p-3 text-sm">
          <Icon name="spark" className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Claude isn’t connected.</strong> Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart the server to generate new
            variations. Lessons that already have follow ups still work.
          </span>
        </p>
      )}
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}
      {data.error && (
        <div className="mt-4">
          <ErrorNote text={data.error} />
        </div>
      )}
      {!data.data ? (
        <p className="mt-6 text-ink-muted">Loading lessons…</p>
      ) : (
        <LessonGrid lessons={data.data.lessons}>
          {(l) => (
            <LessonCard
              key={l.slug}
              lesson={l}
              canEdit={Boolean(me?.canAuthor)}
              generator={data.data!.generator}
              busy={busy?.slug === l.slug ? busy.action : null}
              anyBusy={busy !== null}
              act={(a, instructions) => act(l.slug, a, instructions)}
              onDelete={() => lifecycle(l, "delete")}
            />
          )}
        </LessonGrid>
      )}
      {data.data && (data.data.deleted ?? []).length > 0 && (
        <details className="mt-8 rounded-3xl border border-line bg-surface p-5">
          <summary className="cursor-pointer font-serif text-lg font-semibold">Deleted lessons ({data.data.deleted!.length})</summary>
          <p className="mt-2 text-sm text-ink-muted">Hidden from learners and from learning paths. Restore one to put it back as it was.</p>
          <ul className="mt-3 divide-y divide-line">
            {data.data.deleted!.map((d) => (
              <li key={d.slug} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <span className="font-semibold">{d.title}</span>
                  <span className="block text-sm text-ink-muted">
                    {d.cards} cards · deleted {new Date(d.deletedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </span>
                {me?.canAuthor && (
                  <button type="button" className={btn.secondary} disabled={busy !== null} onClick={() => lifecycle(d, "restore")}>
                    <Icon name="refresh" className="size-4" /> {busy?.slug === d.slug ? "Restoring…" : "Restore"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </AdminShell>
  );
}

/*
  Sorting and finding lessons: search by title, filter by audience, and sort. The sort is remembered
  on this device.
*/
const SORTS = {
  attention: "Needs attention first",
  edited: "Recently edited",
  az: "Title A–Z",
  za: "Title Z–A",
  audience: "Audience",
  shortest: "Shortest first",
  longest: "Longest first",
} as const;
type SortId = keyof typeof SORTS;
const SORT_KEY = "tc-admin-lessons-sort";

/** Lower comes first: drafts, then unpublished changes, then follow ups to review, then the rest. */
const attention = (l: LessonRow) => (l.status === "unpublished" ? 0 : l.status === "changes" ? 1 : l.state === "review" || l.needsReview ? 2 : 3);
const byTitle = (a: LessonRow, b: LessonRow) => a.title.localeCompare(b.title, "en-AU", { sensitivity: "base" });
const COMPARE: Record<SortId, (a: LessonRow, b: LessonRow) => number> = {
  attention: (a, b) => attention(a) - attention(b) || byTitle(a, b),
  edited: (a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || byTitle(a, b),
  az: byTitle,
  za: (a, b) => byTitle(b, a),
  audience: (a, b) => (TRACK_LABEL[a.track] ?? a.track).localeCompare(TRACK_LABEL[b.track] ?? b.track) || byTitle(a, b),
  shortest: (a, b) => a.minutes - b.minutes || byTitle(a, b),
  longest: (a, b) => b.minutes - a.minutes || byTitle(a, b),
};

const sortListeners = new Set<() => void>();
const subscribeSort = (cb: () => void) => {
  sortListeners.add(cb);
  return () => void sortListeners.delete(cb);
};
// Kept in memory too, so sorting still works where the browser blocks storage.
let chosenSort: SortId | null = null;
function readSort(): SortId {
  if (chosenSort) return chosenSort;
  try {
    const saved = localStorage.getItem(SORT_KEY);
    if (saved && saved in SORTS) return saved as SortId;
  } catch {}
  return "attention";
}
function setSort(s: SortId) {
  chosenSort = s;
  try {
    localStorage.setItem(SORT_KEY, s);
  } catch {}
  sortListeners.forEach((l) => l());
}

function LessonGrid({ lessons, children }: { lessons: LessonRow[]; children: (l: LessonRow) => React.ReactNode }) {
  const sort = useSyncExternalStore(subscribeSort, readSort, () => "attention" as SortId);
  const [q, setQ] = useState("");
  const [track, setTrack] = useState("all");
  const tracks = [...new Set(lessons.map((l) => l.track))];
  const needle = q.trim().toLowerCase();
  const shown = lessons.filter((l) => (track === "all" || l.track === track) && (!needle || l.title.toLowerCase().includes(needle))).sort(COMPARE[sort]);
  return (
    <>
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm font-semibold sm:max-w-xs">
          Search
          <span className="relative">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input type="search" className={cx(input, "pl-9 font-normal")} placeholder="Lesson title" value={q} onChange={(e) => setQ(e.target.value)} />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Audience
          <select className={cx(input, "w-auto font-normal")} value={track} onChange={(e) => setTrack(e.target.value)}>
            <option value="all">All audiences</option>
            {tracks.map((t) => (
              <option key={t} value={t}>
                {TRACK_LABEL[t] ?? t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Sort by
          <select className={cx(input, "w-auto font-normal")} value={sort} onChange={(e) => setSort(e.target.value as SortId)}>
            {(Object.keys(SORTS) as SortId[]).map((id) => (
              <option key={id} value={id}>
                {SORTS[id]}
              </option>
            ))}
          </select>
        </label>
        <p className="ml-auto pb-2.5 text-sm text-ink-muted" role="status">
          {shown.length === lessons.length ? `${lessons.length} lessons` : `Showing ${shown.length} of ${lessons.length}`}
        </p>
      </div>
      {shown.length ? (
        <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{shown.map(children)}</ul>
      ) : (
        <p className="mt-4 rounded-3xl border border-dashed border-line-strong p-6 text-center text-ink-muted">
          No lessons match.{" "}
          <button
            type="button"
            className="font-semibold text-accent hover:underline"
            onClick={() => {
              setQ("");
              setTrack("all");
            }}
          >
            Clear search and filter
          </button>
        </p>
      )}
    </>
  );
}

const TRACK_LABEL: Record<string, string> = { core: "Everyone", partner: "Service partners", coordinator: "Care coordinators", briefing: "Policy briefing" };
const SPACED_STATE: Record<LessonRow["state"], { label: string; tone: "good" | "warn" | "neutral" }> = {
  live: { label: "Follow ups live", tone: "good" },
  review: { label: "Follow ups to review", tone: "warn" },
  empty: { label: "No follow ups yet", tone: "warn" },
  off: { label: "Spaced learning off", tone: "neutral" },
};

/** A lesson as a portrait card: cover, details and actions. Spaced learning opens in its own window. */
function LessonCard({
  lesson: l,
  canEdit,
  generator,
  busy,
  anyBusy,
  act,
  onDelete,
}: {
  lesson: LessonRow;
  canEdit: boolean;
  generator: Overview["generator"];
  busy: string | null;
  anyBusy: boolean;
  act: Act;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const generating = busy === "enable" || busy === "regenerate";
  const spaced = generating ? { label: "Writing follow ups…", tone: "neutral" as const } : SPACED_STATE[l.spaced ? l.state : "off"];
  return (
    <li className="flex flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-sm transition-shadow hover:shadow-md">
      <div className="relative">
        <StoryVisual {...l.visual} alt="" className="aspect-[4/3]" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {l.status === "unpublished" && <Badge tone="warn">Draft, not published</Badge>}
          {l.status === "changes" && <Badge tone="info">Unpublished changes</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-accent">
          {TRACK_LABEL[l.track] ?? l.track} · {l.minutes} min · {l.cards} cards
        </p>
        <h3 className="font-serif text-lg font-semibold leading-snug">
          {l.status === "unpublished" ? (
            l.title
          ) : (
            <Link href={`/learning/${l.slug}`} className="hover:underline">
              {l.title}
            </Link>
          )}
        </h3>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={l.status === "unpublished"}
          title={l.status === "unpublished" ? "Publish the lesson first" : "Spaced learning and follow ups"}
          className="flex items-center gap-2 self-start rounded-full text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Badge tone={spaced.tone}>
            {generating && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
            {spaced.label}
          </Badge>
          {l.status !== "unpublished" && <span className="text-accent hover:underline">Follow ups</span>}
        </button>
        <div className="mt-auto flex flex-col gap-2 pt-2">
          {canEdit && (
            <Link href={`/admin/lessons/${l.slug}/edit`} className={cx(btn.primary, "w-full justify-center")}>
              Edit lesson
            </Link>
          )}
          <div className="flex items-center justify-between gap-2">
            {l.status !== "unpublished" ? (
              <QrShare
                kind="lesson"
                id={l.slug}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-accent hover:bg-muted"
              />
            ) : (
              <span />
            )}
            {canEdit && (
              <button
                type="button"
                onClick={onDelete}
                disabled={anyBusy}
                aria-label={`Delete ${l.title}`}
                title="Delete"
                className="grid size-10 place-items-center rounded-full text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                {busy === "delete" ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Icon name="trash" className="size-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
      {open && (
        <SpacedDialog title={l.title} onClose={() => setOpen(false)}>
          <SpacedPanel lesson={l} canEdit={canEdit} generator={generator} busy={busy} anyBusy={anyBusy} act={act} />
        </SpacedDialog>
      )}
    </li>
  );
}

function SpacedDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="spaced-title"
      className="fixed inset-0 z-50 grid place-items-center bg-[rgb(10_26_46/0.55)] p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100dvh-2rem)] w-[min(52rem,100%)] overflow-y-auto rounded-3xl bg-surface p-5 text-ink shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Spaced learning</p>
            <h2 id="spaced-title" className="font-serif text-xl font-semibold">
              {title}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" autoFocus className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-muted">
            <Icon name="close" className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** The spaced learning checkbox, sign-off, and the follow ups Claude wrote from this lesson. */
function SpacedPanel({
  lesson: l,
  canEdit,
  generator,
  busy,
  anyBusy,
  act,
}: {
  lesson: LessonRow;
  canEdit: boolean;
  generator: Overview["generator"];
  busy: string | null;
  anyBusy: boolean;
  act: Act;
}) {
  const generating = busy === "enable" || busy === "regenerate";
  const [composing, setComposing] = useState(false);
  const model = generator.model;
  // First time on, ticking the box opens the instructions so the author can steer the first draft.
  const toggle = (on: boolean) => (on && !l.variations.length ? setComposing(true) : act(on ? "enable" : "disable"));
  const days = cumulative(l.variations.map((v) => (v.variant ? 0 : v.gap)));
  return (
    <div>
      <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 rounded-full border border-line-strong px-4 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
        <input
          type="checkbox"
          className="size-5 accent-[var(--action)]"
          checked={l.spaced}
          disabled={!canEdit || anyBusy || l.status === "unpublished"}
          title={l.status === "unpublished" ? "Publish the lesson first" : undefined}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span className="font-semibold">Spaced learning</span>
      </label>
      {l.spaced && (
        <label className="mt-3 flex cursor-pointer items-start gap-3 self-start has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
          <input
            type="checkbox"
            className="mt-0.5 size-5 accent-[var(--action)]"
            checked={l.signoff}
            disabled={!canEdit || anyBusy}
            onChange={(e) => act(e.target.checked ? "signoff_on" : "signoff_off")}
          />
          <span>
            <span className="font-semibold">Manager sign-off at the end</span>
            <span className="block text-sm text-ink-muted">
              After the last follow up, their manager confirms they’re applying it at work.{" "}
              <Link href="/admin/signoffs" className="text-accent underline-offset-4 hover:underline">
                See sign-offs
              </Link>
            </span>
          </span>
        </label>
      )}

      {composing && !generating ? (
        <Compose
          first={!l.variations.length}
          generator={generator}
          disabled={anyBusy}
          onCancel={() => setComposing(false)}
          onGenerate={(text) => {
            setComposing(false);
            act(l.variations.length ? "regenerate" : "enable", text);
          }}
        />
      ) : generating ? (
        <p className="mt-4 flex items-center gap-3 rounded-2xl bg-tealtint p-4" role="status">
          <span className="size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
          Claude ({model}) is writing the Recall, Apply and Refresh variations from this lesson. This usually takes a minute or two.
        </p>
      ) : !l.spaced ? (
        <p className="mt-3 text-sm text-ink-muted">
          {l.variations.length
            ? "Off. New completions won’t start follow ups; anyone already part way through carries on."
            : "Off. This lesson stands on its own."}
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {l.state === "live" && <Badge tone="good">Live for learners</Badge>}
            {l.state === "review" && <Badge tone="warn">Waiting for your review</Badge>}
            {l.state === "empty" && <Badge tone="warn">No variations yet</Badge>}
            {l.pathId && (
              <Link href={`/admin/schedules/${l.pathId}`} className="text-sm text-ink-muted underline-offset-4 hover:underline">
                Schedule and audience
              </Link>
            )}
          </div>
          {l.variations.length > 0 && (
            <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {l.variations.map((v, i) => {
                const support = Boolean(v.variant);
                return (
                  <li key={v.slug} className={"flex flex-col gap-1 rounded-2xl p-3 " + (support ? "border border-dashed border-line-strong" : "bg-muted")}>
                    <p className="font-mulish text-xs font-bold text-ink-muted">
                      {v.variant === "support"
                        ? "If they struggled"
                        : v.variant
                          ? `${v.variant[0].toUpperCase()}${v.variant.slice(1)} partners`
                          : spacedWhen(days[i]).replace(/^./, (c) => c.toUpperCase())}{" "}
                      · {v.cards} cards
                    </p>
                    <p className="font-semibold">{v.stage}</p>
                    <p className="text-sm leading-snug">{v.title}</p>
                    <p className="text-xs text-ink-muted">{v.source}</p>
                    <Link
                      href={`/learning/s/${v.slug}?preview=1`}
                      className="mt-auto inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-accent hover:underline"
                    >
                      Preview <Icon name="arrow-right" className="size-4" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
          {canEdit && (
            <div className="mt-4 flex flex-wrap gap-2">
              {(l.state === "review" || l.needsReview) && (
                <button type="button" className={btn.primary} disabled={anyBusy} onClick={() => act("approve")}>
                  {busy === "approve" ? "Publishing…" : "Approve and publish"}
                </button>
              )}
              <button type="button" className={btn.secondary} disabled={anyBusy} onClick={() => setComposing(true)} aria-expanded={composing}>
                <Icon name="spark" className="size-4" /> {l.variations.length ? "Regenerate with Claude" : "Generate with Claude"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Optional instructions for Claude before it writes (or rewrites) the follow ups. */
function Compose({
  first,
  generator,
  disabled,
  onCancel,
  onGenerate,
}: {
  first: boolean;
  generator: Overview["generator"];
  disabled: boolean;
  onCancel: () => void;
  onGenerate: (instructions: string) => void;
}) {
  const [text, setText] = useState("");
  const add = (s: string) => setText((t) => (t.includes(s) ? t : `${t.trim()}${t.trim() ? "\n" : ""}${s}`));
  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded-2xl border-2 border-action/40 bg-tealtint p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onGenerate(text);
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-2 font-semibold">
          <Icon name="spark" className="size-4 text-accent" /> Instructions for Claude <span className="font-normal text-ink-muted">(optional)</span>
        </span>
        <span className="text-sm text-ink-muted">
          Steer the focus, tone or examples. Claude still writes only from this lesson’s cards, so instructions can’t add new facts or policy.
        </span>
        <textarea
          rows={4}
          maxLength={generator.maxInstructions}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[0.98rem] leading-relaxed"
          placeholder="For example: make the Apply scenario about a client’s son asking for an extra visit, and keep the language simple."
          autoFocus
        />
        <span className="self-end text-xs text-ink-muted">
          {text.length} / {generator.maxInstructions}
        </span>
      </label>
      <div className="flex flex-wrap gap-1.5" aria-label="Suggestions">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => add(s)}
            className="min-h-9 rounded-full border border-line-strong bg-surface px-3 text-left text-sm hover:bg-muted"
          >
            <Icon name="plus" className="mr-1 inline size-3.5" />
            {s}
          </button>
        ))}
      </div>
      {!first && (
        <p className="text-sm text-ink-muted">This replaces the current drafts. Learners keep seeing the approved versions until you approve the new ones.</p>
      )}
      {!generator.connected && (
        <p className="text-sm">
          <strong>Claude isn’t connected yet,</strong> so this will show an error until <code>ANTHROPIC_API_KEY</code> is added to <code>.env.local</code>.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btn.primary} disabled={disabled}>
          <Icon name="spark" className="size-4" /> {first ? "Turn on and generate" : "Generate with Claude"}
        </button>
        <button type="button" className={btn.secondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
