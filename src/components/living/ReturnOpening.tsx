"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import type { ReturnOpening as Opening } from "@/server/living";
import type { CharacterHistory } from "@/server/story";
import { Icon } from "../Icon";

/*
  What opens a return episode (docs/living-cases.md): where we left the person, what has changed, and what the
  learner must decide. Enough for someone who never saw the first story, and no more than that for someone who did.

  A line about the learner's own earlier answer is shown only to them, marked as theirs. It is a prompt for their
  own thinking: it never changes what happens to the person in the story, and no one else is ever sent it.
*/

const eventKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const report = (body: Record<string, unknown>) => void api("/api/living", { body: { ...body, key: eventKey() } }).catch(() => undefined);

/** The opening for one page, or null when the page isn't a return. Reports the opening once, and the activity when it's reached. */
export function useReturnOpening(slug: string, pageId: string, preview: boolean) {
  const [opening, setOpening] = useState<Opening | null>(null);
  const [noteId, setNoteId] = useState("");
  useEffect(() => {
    let live = true;
    const q = new URLSearchParams(window.location.search);
    const note = q.get("note") ?? "";
    api<{ opening: Opening | null }>(
      `/api/living?${new URLSearchParams({ guide: slug, page: pageId, ...(preview && { preview: "1" }), ...(preview && q.get("prior") ? { prior: q.get("prior")! } : {}) })}`,
    )
      .then((r) => {
        if (!live) return;
        setOpening(r.opening);
        setNoteId(note);
        if (r.opening && !r.opening.preview) report({ event: "return_episode_opened", returnId: r.opening.id, noteId: note });
      })
      .catch(() => live && setOpening(null));
    return () => {
      live = false;
    };
  }, [slug, pageId, preview]);
  // The transfer activity coming into view is "started". Seen once is enough; the server keeps one per version.
  useEffect(() => {
    if (!opening || opening.preview || !opening.transferBlock) return;
    const el = document.getElementById(`block-${opening.transferBlock}`);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        report({ event: "transfer_activity_started", returnId: opening.id, noteId });
        io.disconnect();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [opening, noteId]);
  return { opening, noteId };
}

function Story({ opening, onClose }: { opening: Opening; onClose: () => void }) {
  const who = opening.character!;
  const [h, setH] = useState<CharacterHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(
    (later: boolean) =>
      api<CharacterHistory>(`/api/story?character=${encodeURIComponent(who.id)}&episode=${encodeURIComponent(opening.episode)}${later ? "&later=1" : ""}`)
        .then(setH)
        .catch(() => setFailed(true)),
    [who.id, opening.episode],
  );
  useEffect(() => {
    void load(false);
  }, [load]);
  return (
    <section aria-label={`${who.name}’s story so far`} className="mt-3 rounded-2xl bg-muted p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{who.name}’s story so far</p>
        <button type="button" onClick={onClose} className="min-h-11 px-2 text-sm font-semibold underline underline-offset-2">
          Hide
        </button>
      </div>
      {failed ? (
        <p className="text-ink-muted">That story couldn’t be opened just now.</p>
      ) : !h ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <>
          <p className="text-ink-muted">
            {h.character.fictional}. {h.character.summary}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {[...h.upTo, ...h.later].map((i) => (
              <li key={i.id}>
                {i.href ? (
                  <Link href={i.href} className="font-semibold text-accent underline underline-offset-2">
                    {i.title}
                  </Link>
                ) : (
                  <span className="font-semibold">{i.title}</span>
                )}
                <span className="text-ink-muted"> · {[i.whenLabel, i.format].filter(Boolean).join(" · ")}</span>
                {i.summary && <span className="block text-sm text-ink-muted">{i.summary}</span>}
              </li>
            ))}
            {!h.upTo.length && !h.later.length && <li className="text-ink-muted">Nothing else you can open yet.</li>}
          </ul>
          {h.laterCount > 0 && !h.later.length && (
            <button type="button" onClick={() => void load(true)} className="mt-2 min-h-11 text-sm font-semibold underline underline-offset-2">
              Show {h.laterCount} later {h.laterCount === 1 ? "appearance" : "appearances"} (may give away what happens next)
            </button>
          )}
        </>
      )}
    </section>
  );
}

export function ReturnOpeningPanel({ opening, noteId, className }: { opening: Opening; noteId?: string; className?: string }) {
  const [story, setStory] = useState(false);
  const followed = useRef(false);
  const name = opening.character?.name ?? "this person";
  const parts = [
    { key: "left", label: `Where we left ${name}`, text: opening.recap },
    { key: "changed", label: "What’s changed", text: opening.changed },
    { key: "decide", label: "What you decide", text: [opening.role, opening.decide].filter(Boolean).join(" ") },
  ].filter((p) => p.text);
  return (
    <aside aria-label="A return to an earlier story" className={cx("rounded-3xl border border-line-strong bg-surface p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
          <Icon name="refresh" className="size-4" /> A return{opening.whenLabel && ` · ${opening.whenLabel}`}
          {opening.preview && <span className="rounded-full bg-muted px-2 py-0.5 tracking-normal text-ink">Preview of the working copy</span>}
        </p>
        {noteId && (
          <Link href="/field-notes" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline underline-offset-2">
            <Icon name="arrow-left" className="size-4" /> Field Notes
          </Link>
        )}
      </div>
      <dl className="mt-2 grid gap-4 sm:grid-cols-3">
        {parts.map((p) => (
          <div key={p.key}>
            <dt className="font-semibold">{p.label}</dt>
            <dd className="mt-1 text-ink-muted">{p.text}</dd>
          </div>
        ))}
      </dl>
      {opening.mine && (
        <p className="mt-4 rounded-2xl bg-tealtint p-4">
          <span className="flex items-center gap-1.5 font-mulish text-xs font-extrabold uppercase tracking-[0.12em]">
            <Icon name="lock" className="size-3.5" /> Only you can see this
          </span>
          <span className="mt-1 block text-lg">{opening.mine}</span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-semibold">
        {opening.earlier && (
          <Link href={opening.earlier.href} className="inline-flex min-h-11 items-center text-accent underline underline-offset-2">
            Earlier in this story: {opening.earlier.title} (optional)
          </Link>
        )}
        {opening.character && (
          <button
            type="button"
            aria-expanded={story}
            onClick={() => {
              setStory(!story);
              if (!story && !followed.current && !opening.preview) {
                followed.current = true;
                report({ event: "character_history_followed", returnId: opening.id, noteId });
              }
            }}
            className="inline-flex min-h-11 items-center text-accent underline underline-offset-2"
          >
            View {opening.character.name}’s story
          </button>
        )}
      </div>
      {story && opening.character && <Story opening={opening} onClose={() => setStory(false)} />}
      <p className="mt-2 text-sm text-ink-muted">
        {name} is a fictional character. What you choose here is practice: it gets its own feedback and doesn’t change {name}’s story.
      </p>
    </aside>
  );
}
