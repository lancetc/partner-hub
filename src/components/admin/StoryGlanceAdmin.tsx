"use client";

import { useState } from "react";
import type { Story } from "@/content/stories";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { textHash } from "@/lib/magazineNarration";
import type { NarrationAudio } from "@/lib/magazine";
import {
  GLANCE_MAX,
  GLANCE_MIN,
  GLANCE_SHAPE,
  glanceScript,
  needsReview,
  PRACTICE_MAX,
  storyBasis,
  type GlancePoint,
  type PracticeItem,
  type StoryGlance,
  type StoryPractice,
} from "@/lib/storyGlance";
import { Icon } from "../Icon";
import { AtAGlance, PutIntoPractice } from "../news/StoryGlance";
import { Badge, btn, ErrorNote, input } from "./ui";

/*
  The News editor's "At a glance" and "Put it into practice" panels (the owner, Nov 2026; lib/storyGlance).

  AI drafts from the story as it stands here (Claude, or the Hub's OpenAI connection without it); the author edits, reorders and turns each on. Both are stamped with the
  story they were checked against: when the story's words change, the panel says so until the author marks them checked
  again. A summary proposed by AI for an existing story arrives switched off, marked "Proposed", for the same review.
*/

const textarea = "w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base leading-relaxed";
type Draft = { points?: GlancePoint[]; actions?: PracticeItem[]; basis: string };

const move = <T,>(list: T[], i: number, d: -1 | 1) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

function useDraft(slug: string | null, story: Story) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function draft(what: "glance" | "practice") {
    if (!slug) return null;
    setBusy(true);
    setError(null);
    try {
      return await api<Draft>(`/api/admin/stories/${encodeURIComponent(slug)}/glance`, { body: { story, what } });
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, draft };
}

/** Reorder and remove buttons for one row. */
function RowTools({ i, n, onMove, onRemove, what }: { i: number; n: number; onMove: (d: -1 | 1) => void; onRemove: () => void; what: string }) {
  return (
    <span className="flex shrink-0 flex-col">
      <button type="button" className={cx(btn.quiet, "min-h-8 px-2")} disabled={i === 0} onClick={() => onMove(-1)} aria-label={`Move ${what} ${i + 1} up`}>
        <Icon name="arrow-up" className="size-4" />
      </button>
      <button
        type="button"
        className={cx(btn.quiet, "min-h-8 px-2")}
        disabled={i === n - 1}
        onClick={() => onMove(1)}
        aria-label={`Move ${what} ${i + 1} down`}
      >
        <Icon name="arrow-down" className="size-4" />
      </button>
      <button type="button" className={cx(btn.quiet, "min-h-8 px-2 hover:text-danger")} onClick={onRemove} aria-label={`Remove ${what} ${i + 1}`}>
        <Icon name="close" className="size-4" />
      </button>
    </span>
  );
}

function StateBadge({ part, story, kind }: { part?: { enabled: boolean; proposed?: boolean; basis: string }; story: Story; kind: string }) {
  if (!part) return null;
  if (part.proposed) return <Badge tone="info">Proposed by AI: check it</Badge>;
  if (needsReview(part, story)) return <Badge tone="warn">Story changed: check the {kind}</Badge>;
  return part.enabled ? <Badge tone="good">On</Badge> : <Badge>Off</Badge>;
}

/** The takeaways under the hero: draft, edit, reorder, turn on, record and preview. */
export function GlanceField({ slug, story, onChange }: { slug: string | null; story: Story; onChange: (g: StoryGlance | undefined) => void }) {
  const g = story.glance;
  const points = g?.points ?? [];
  const { busy, error, setError, draft } = useDraft(slug, story);
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState(false);
  const stale = needsReview(g, story);
  const shape = GLANCE_SHAPE[story.category];
  const script = glanceScript(points);
  const recordedNow = Boolean(g?.audio && g.audio.scriptHash === textHash(script));
  const base = (): StoryGlance => g ?? { enabled: false, points: [], basis: storyBasis(story) };
  const setPoints = (next: GlancePoint[]) => onChange(next.length || g?.audio ? { ...base(), points: next, audioApproved: false } : undefined);

  async function write() {
    if (
      points.length &&
      !(await confirmAction("AI writes new takeaways from the story as it is now. Your current ones are replaced.", {
        title: "Redraft At a glance?",
        confirmLabel: "Redraft",
      }))
    )
      return;
    const d = await draft("glance");
    if (d?.points) onChange({ ...base(), points: d.points, basis: d.basis, proposed: false, enabled: false, audioApproved: false });
  }
  async function record() {
    if (!slug) return;
    setRecording(true);
    setError(null);
    try {
      const { audio } = await api<{ audio: NarrationAudio }>(`/api/admin/stories/${encodeURIComponent(slug)}/narration`, { body: { script, part: "summary" } });
      onChange({ ...base(), audio, audioApproved: false });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRecording(false);
    }
  }
  const checked = () => onChange({ ...base(), basis: storyBasis(story), proposed: false });

  return (
    <section aria-labelledby="glance-edit-h" className="flex flex-col gap-3 rounded-2xl border border-line p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="glance-edit-h" className="flex items-center gap-2 font-semibold">
          <Icon name="list" className="size-4 text-accent" /> At a glance
        </h2>
        <StateBadge part={g} story={story} kind="summary" />
      </div>
      <p className="text-sm text-ink-muted">
        {GLANCE_MIN} to {GLANCE_MAX} takeaways under the picture, before the story. Every point must be in the story. Shaped for {shape.label}:{" "}
        {shape.parts.join(", ")}.
      </p>

      {(stale || g?.proposed) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#fff1d6] px-3 py-2 text-sm text-[#6b4a12]">
          <span className="flex-1">
            {g?.proposed
              ? "AI proposed these from the published story. Read each against the story before turning them on."
              : "The story has changed since these were checked. Read them against the story again."}
          </span>
          <button type="button" className="font-semibold underline underline-offset-2" onClick={checked}>
            Mark as checked
          </button>
        </div>
      )}

      {points.length > 0 && (
        <ol className="flex flex-col gap-3">
          {points.map((p, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-right text-sm tabular-nums text-ink-muted">{i + 1}.</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <input
                  aria-label={`Title for takeaway ${i + 1}`}
                  placeholder="A short title, a few words"
                  className={cx(input, "font-semibold")}
                  value={p.title ?? ""}
                  onChange={(e) => setPoints(points.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                />
                <textarea
                  rows={2}
                  aria-label={`Takeaway ${i + 1}`}
                  className={textarea}
                  value={p.text}
                  onChange={(e) => setPoints(points.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                />
                {p.from && <p className="mt-1 text-sm text-ink-muted">From the story: “{p.from}”</p>}
              </div>
              <RowTools
                i={i}
                n={points.length}
                what="takeaway"
                onMove={(d) => setPoints(move(points, i, d))}
                onRemove={() => setPoints(points.filter((_, j) => j !== i))}
              />
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn.secondary} disabled={busy || !slug} onClick={() => void write()}>
          <Icon name="spark" className="size-4" /> {busy ? "Writing…" : points.length ? "Redraft with AI" : "Draft with AI"}
        </button>
        {points.length < GLANCE_MAX && (
          <button type="button" className={btn.quiet} onClick={() => setPoints([...points, { text: "" }])}>
            <Icon name="plus" className="size-4" /> Add a takeaway
          </button>
        )}
        {points.length > 0 && (
          <button type="button" className={btn.quiet} onClick={() => setPreview(!preview)}>
            <Icon name="eye" className="size-4" /> {preview ? "Hide preview" : "Preview"}
          </button>
        )}
      </div>
      {!slug && <p className="text-sm text-ink-muted">Save the story first, then draft its summary.</p>}
      {error && <ErrorNote text={error} />}

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 size-5 accent-[var(--action)]"
          checked={g?.enabled === true}
          disabled={points.filter((p) => p.text.trim()).length < GLANCE_MIN}
          // Turning it on is the author's check: it takes the "proposed" and "story changed" flags off.
          onChange={(e) => onChange({ ...base(), enabled: e.target.checked, ...(e.target.checked ? { proposed: false, basis: storyBasis(story) } : {}) })}
        />
        <span>
          <span className="text-sm font-semibold">Show At a glance on the story</span>
          <span className="block text-sm text-ink-muted">I’ve checked every takeaway against the story.</span>
        </span>
      </label>

      {points.length >= GLANCE_MIN && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-sm font-semibold">Summary audio (optional)</p>
          <p className="text-sm text-ink-muted">The takeaways read in the Magazine Editorial Voice. Readers press Play; it never starts by itself.</p>
          <button type="button" className={cx(btn.secondary, "self-start")} disabled={recording || !slug} onClick={() => void record()}>
            <Icon name="mic" className="size-4" /> {recording ? "Recording…" : g?.audio ? "Record again" : "Record the summary"}
          </button>
          {g?.audio && (
            <>
              <audio controls src={g.audio.src} className="w-full" preload="none" />
              {recordedNow ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[var(--color-action)]"
                    checked={g.audioApproved === true}
                    onChange={(e) => onChange({ ...base(), audioApproved: e.target.checked })}
                  />
                  <span className="font-semibold">Approved for learners</span>
                </label>
              ) : (
                <p className="text-sm font-semibold text-[#7a4b00] dark:text-gold">
                  The takeaways have changed since this was recorded. Record it again to approve it.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {preview && points.length > 0 && (
        <div className="rounded-2xl border border-dashed border-line-strong p-3">
          <p className="mb-2 text-sm text-ink-muted">How readers see it{g?.enabled ? "" : " once it’s turned on"}:</p>
          <AtAGlance points={points.filter((p) => p.text.trim())} audio={recordedNow && g?.audioApproved ? g.audio : null} />
        </div>
      )}
    </section>
  );
}

/** The optional ideas to try, at the end of the story. */
export function PracticeField({ slug, story, onChange }: { slug: string | null; story: Story; onChange: (p: StoryPractice | undefined) => void }) {
  const p = story.practice;
  const items = p?.items ?? [];
  const { busy, error, draft } = useDraft(slug, story);
  const { data: linkData } = useApi<{ links: { href: string; label: string; kind: string }[] }>(
    slug ? `/api/admin/stories/${encodeURIComponent(slug)}/glance` : null,
  );
  const links = linkData?.links ?? [];
  const [preview, setPreview] = useState(false);
  const stale = needsReview(p, story);
  const base = (): StoryPractice => p ?? { enabled: false, items: [], checklist: true, basis: storyBasis(story) };
  const setItems = (next: PracticeItem[]) => onChange(next.length ? { ...base(), items: next } : undefined);
  const newId = () => {
    let n = items.length + 1;
    while (items.some((i) => i.id === `a${n}`)) n++;
    return `a${n}`;
  };

  async function write() {
    if (
      items.length &&
      !(await confirmAction("AI suggests new actions from the story as it is now. Your current ones are replaced.", {
        title: "Redraft the actions?",
        confirmLabel: "Redraft",
      }))
    )
      return;
    const d = await draft("practice");
    if (!d) return;
    if (!d.actions?.length) {
      onChange(undefined);
      return;
    }
    onChange({ ...base(), items: d.actions, basis: d.basis, proposed: false, enabled: false });
  }

  return (
    <section aria-labelledby="practice-edit-h" className="flex flex-col gap-3 rounded-2xl border border-line p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="practice-edit-h" className="flex items-center gap-2 font-semibold">
          <Icon name="checklist" className="size-4 text-accent" /> Put it into practice <span className="font-normal text-ink-muted">(optional)</span>
        </h2>
        <StateBadge part={p} story={story} kind="actions" />
      </div>
      <p className="text-sm text-ink-muted">
        Up to {PRACTICE_MAX} short things a reader could try after reading, at the end of the story. None is required. Leave this empty for a story that’s only
        news.
      </p>
      {story.category === "policy" && (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm">
          <strong>Policy story.</strong> Actions here are reminders only: they must match the approved policy and can’t add a rule, step or deadline. Check them
          with the policy’s owner{story.policy?.owner ? ` (${story.policy.owner})` : ""} through the usual sign-off before turning them on.
        </p>
      )}
      {(stale || p?.proposed) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#fff1d6] px-3 py-2 text-sm text-[#6b4a12]">
          <span className="flex-1">
            {p?.proposed
              ? "AI suggested these from the published story. Check each one before turning them on."
              : "The story has changed since these were checked."}
          </span>
          <button
            type="button"
            className="font-semibold underline underline-offset-2"
            onClick={() => onChange({ ...base(), basis: storyBasis(story), proposed: false })}
          >
            Mark as checked
          </button>
        </div>
      )}

      {items.length > 0 && (
        <ol className="flex flex-col gap-3">
          {items.map((it, i) => (
            <li key={it.id} className="flex gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-right text-sm tabular-nums text-ink-muted">{i + 1}.</span>
              <div className="grid min-w-0 flex-1 gap-2">
                <textarea
                  rows={2}
                  aria-label={`Action ${i + 1}`}
                  className={textarea}
                  value={it.text}
                  onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                />
                <select
                  aria-label={`Link for action ${i + 1}`}
                  className={input}
                  value={it.href ?? ""}
                  onChange={(e) => {
                    const l = links.find((x) => x.href === e.target.value);
                    setItems(items.map((x, j) => (j === i ? { id: x.id, text: x.text, ...(l ? { href: l.href, label: l.label } : {}) } : x)));
                  }}
                >
                  <option value="">No link</option>
                  {it.href && !links.some((l) => l.href === it.href) && <option value={it.href}>{it.label || it.href}</option>}
                  {["Topic", "Resource", "Work Tool"].map((kind) => (
                    <optgroup key={kind} label={`${kind}s`}>
                      {links
                        .filter((l) => l.kind === kind)
                        .map((l) => (
                          <option key={l.href} value={l.href}>
                            {l.label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <RowTools
                i={i}
                n={items.length}
                what="action"
                onMove={(d) => setItems(move(items, i, d))}
                onRemove={() => setItems(items.filter((_, j) => j !== i))}
              />
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn.secondary} disabled={busy || !slug} onClick={() => void write()}>
          <Icon name="spark" className="size-4" /> {busy ? "Writing…" : items.length ? "Redraft with AI" : "Suggest with AI"}
        </button>
        {items.length < PRACTICE_MAX && (
          <button type="button" className={btn.quiet} onClick={() => setItems([...items, { id: newId(), text: "" }])}>
            <Icon name="plus" className="size-4" /> Add an action
          </button>
        )}
        {items.length > 0 && (
          <button type="button" className={btn.quiet} onClick={() => setPreview(!preview)}>
            <Icon name="eye" className="size-4" /> {preview ? "Hide preview" : "Preview"}
          </button>
        )}
      </div>
      {error && <ErrorNote text={error} />}

      {items.length > 0 && (
        <>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 size-5 accent-[var(--action)]"
              checked={p?.checklist === true}
              onChange={(e) => onChange({ ...base(), checklist: e.target.checked })}
            />
            <span>
              <span className="text-sm font-semibold">Let readers tick these off</span>
              <span className="block text-sm text-ink-muted">A personal checklist: each reader’s ticks are kept for them alone.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 size-5 accent-[var(--action)]"
              checked={p?.enabled === true}
              disabled={!items.some((i) => i.text.trim())}
              onChange={(e) => onChange({ ...base(), enabled: e.target.checked, ...(e.target.checked ? { proposed: false, basis: storyBasis(story) } : {}) })}
            />
            <span>
              <span className="text-sm font-semibold">Show Put it into practice on the story</span>
              <span className="block text-sm text-ink-muted">
                I’ve checked these against the story{story.category === "policy" ? " and the approved policy" : ""}.
              </span>
            </span>
          </label>
        </>
      )}

      {preview && items.length > 0 && (
        <div className="rounded-2xl border border-dashed border-line-strong p-4">
          <p className="mb-2 text-sm text-ink-muted">How readers see it{p?.enabled ? "" : " once it’s turned on"} (ticks here aren’t saved):</p>
          <PutIntoPractice
            slug={slug ?? "preview"}
            items={items.filter((i) => i.text.trim())}
            checklist={p?.checklist === true}
            initialTicked={[]}
            policy={story.category === "policy"}
            preview
          />
        </div>
      )}
    </section>
  );
}
