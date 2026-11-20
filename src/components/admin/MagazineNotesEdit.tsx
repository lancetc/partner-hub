"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { NotesDeckBlock } from "@/lib/magazine";
import { DEALABLE, NOTE_AUDIENCES, NOTE_MODES, SELECTION, STATES, TOPICS, type NoteAudience, type NoteMode, type Selection, type Topic } from "@/lib/notes";
import type { noteLibrary } from "@/server/notes";
import { Badge, btn, Field, input } from "./ui";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Notes to a Younger Me deck (docs/notes-to-a-younger-me.md): the topic and audience, how cards
  are chosen (curated, the reviewed pool, or pinned cards then the pool), how many, and the learning mode. Cards
  themselves are reviewed in the note library; only reviewed ones can be pinned or dealt.
*/

type Loaded = ReturnType<typeof noteLibrary>;
const group = "rounded-2xl bg-muted p-3";

export function NotesDeckEdit({ block: b, update }: { block: NotesDeckBlock; update: Update }) {
  const set = (fn: (x: NotesDeckBlock) => void, tag?: string) => update<NotesDeckBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const lib = useApi<Loaded>("/api/admin/mentor-notes");
  const notes = lib.data?.notes ?? [];
  const onTopic = notes.filter((n) => n.latest.data.topics.some((t) => b.topics.includes(t)));
  const reviewed = onTopic.filter((n) => n.published && DEALABLE.includes(n.published.state));
  const toggle = <T extends string>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="mail" className="size-5" /> Notes to a Younger Me deck
      </p>
      {lib.data && (
        <p
          role="status"
          className={cx(
            "rounded-2xl px-4 py-3 text-sm font-semibold",
            b.selection === "curated" || reviewed.length >= b.count
              ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]"
              : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
          )}
        >
          {reviewed.length} reviewed {reviewed.length === 1 ? "note" : "notes"} on these topics; the deck shows {b.count}.{" "}
          {b.selection !== "curated" && reviewed.length < b.count ? "Review more in the note library before publishing." : ""}
        </p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input className={input} value={b.title} maxLength={160} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction">
          <input className={input} value={b.intro} maxLength={600} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        <fieldset className="flex flex-wrap gap-3 sm:col-span-2">
          <legend className="text-sm font-semibold">Topics</legend>
          {(Object.keys(TOPICS) as Topic[]).map((t) => (
            <label key={t} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={b.topics.includes(t)} onChange={() => set((x) => void (x.topics = toggle(x.topics, t)))} />
              {TOPICS[t]}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap gap-3 sm:col-span-2">
          <legend className="text-sm font-semibold">Audience (empty: whoever can read the course)</legend>
          {(Object.keys(NOTE_AUDIENCES) as NoteAudience[]).map((a) => (
            <label key={a} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={b.audiences.includes(a)}
                onChange={() => set((x) => void (x.audiences = toggle(x.audiences, a)))}
              />
              {NOTE_AUDIENCES[a]}
            </label>
          ))}
        </fieldset>
        <Field label="Cards chosen by">
          <select className={input} value={b.selection} onChange={(e) => set((x) => void (x.selection = e.target.value as Selection))}>
            {(Object.keys(SELECTION) as Selection[]).map((s) => (
              <option key={s} value={s}>
                {SELECTION[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cards in the deck">
          <select className={input} value={b.count} onChange={(e) => set((x) => void (x.count = Number(e.target.value)))}>
            {[3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Learning mode">
          <select className={input} value={b.mode} onChange={(e) => set((x) => void (x.mode = e.target.value as NoteMode))}>
            {(Object.keys(NOTE_MODES) as NoteMode[]).map((m) => (
              <option key={m} value={m}>
                {NOTE_MODES[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reflection prompt (optional; answered once to finish)">
          <input className={input} value={b.reflection} maxLength={200} onChange={(e) => set((x) => void (x.reflection = e.target.value), "refl")} />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="size-5" checked={b.deal} onChange={(e) => set((x) => void (x.deal = e.target.checked))} />
          Offer “Deal another note”
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="size-5" checked={b.contribute} onChange={(e) => set((x) => void (x.contribute = e.target.checked))} />
          Invite learners to leave a note (optional for them)
        </label>
      </div>

      {b.selection !== "pool" && (
        <div className={cx(group, "mt-3")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">{b.selection === "curated" ? "Cards, in order" : "Pinned cards (shown first)"}</h4>
            <Link href="/admin/mentor-notes" target="_blank" className={btn.quiet}>
              Open the note library <Icon name="external" className="size-4" />
            </Link>
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {onTopic.map((n) => {
              const pinned = b.noteIds.includes(n.latest.id);
              const ok = Boolean(n.published && DEALABLE.includes(n.published.state));
              return (
                <li key={n.latest.id}>
                  <label className="flex min-h-11 items-center gap-2 rounded-xl p-2 text-sm hover:bg-surface">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={pinned}
                      disabled={!pinned && (!ok || b.noteIds.length >= 5)}
                      onChange={() => set((x) => void (x.noteIds = pinned ? x.noteIds.filter((y) => y !== n.latest.id) : [...x.noteIds, n.latest.id]))}
                    />
                    <span className="flex-1">{n.latest.data.hook}</span>
                    <Badge tone={ok ? "good" : "warn"}>{ok ? "Reviewed" : STATES[n.latest.state]}</Badge>
                  </label>
                </li>
              );
            })}
            {!onTopic.length && <li className="text-sm text-ink-muted">No notes on these topics yet.</li>}
          </ul>
          <p className="mt-1 text-xs text-ink-muted">
            Only reviewed notes can be pinned. A pinned card that’s later flagged or withdrawn stops the course being republished until it’s replaced.
          </p>
        </div>
      )}
    </div>
  );
}
