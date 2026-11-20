"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { BADGES, cleanNote, STATES, TOPICS, type Badge, type MentorNoteData, type Topic } from "@/lib/notes";
import type { myNotes, pocketDeck } from "@/server/notes";
import { GoneNote, MentorCard, type CardView, type GoneCard } from "./MentorCard";
import { NoteFields } from "./NoteFields";
import { Icon } from "../Icon";

/*
  Pocket Deck (docs/notes-to-a-younger-me.md): the learner's private saved notes, each opened at its newest
  approved version, with a note when it's been updated and why when it's gone. Below, "Leave a note behind": an
  optional contribution that goes to the editors, never straight to a deck, and the contributor's own notes.
*/

type Pocket = ReturnType<typeof pocketDeck>;
type Mine = ReturnType<typeof myNotes>;
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const showDate = (d: string) => (d ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d)) : "");

export function PocketDeck() {
  const pocket = useApi<Pocket>("/api/mentor-notes?pocket=1");
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState<Topic | "">("");
  const [badge, setBadge] = useState<Badge | "">("");
  const [open, setOpen] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(true);
  const notes = (pocket.data?.notes ?? []) as (Pocket["notes"][number] & Partial<CardView>)[];
  const shown = notes.filter((n) => {
    if ("gone" in n && n.gone) return !q && !topic && !badge;
    const c = n as unknown as CardView;
    if (topic && !c.data.topics.includes(topic)) return false;
    if (badge && c.data.badge !== badge) return false;
    const hay = `${c.data.hook} ${c.data.scenario} ${c.data.note} ${c.data.phrase}`.toLowerCase();
    return q
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((t) => hay.includes(t));
  });

  return (
    <div className="mt-6 flex flex-col gap-8">
      <section aria-labelledby="pocket-h">
        <h2 id="pocket-h" className="font-serif text-2xl font-semibold">
          Saved notes
        </h2>
        <p className="text-ink-muted">A memory cue before a conversation. Each opens at its newest approved version. Only you see this list.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-3xl bg-surface p-4 ring-1 ring-line">
          <label className="flex min-w-56 flex-1 flex-col gap-1">
            <span className="text-sm font-semibold">Search</span>
            <input type="search" className="min-h-11 rounded-xl border border-line-strong bg-bg px-3" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Topic</span>
            <select className="min-h-11 rounded-xl border border-line-strong bg-bg px-3" value={topic} onChange={(e) => setTopic(e.target.value as Topic | "")}>
              <option value="">All</option>
              {(Object.keys(TOPICS) as Topic[]).map((t) => (
                <option key={t} value={t}>
                  {TOPICS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Role</span>
            <select className="min-h-11 rounded-xl border border-line-strong bg-bg px-3" value={badge} onChange={(e) => setBadge(e.target.value as Badge | "")}>
              <option value="">All</option>
              {(Object.keys(BADGES) as Badge[]).map((x) => (
                <option key={x} value={x}>
                  {BADGES[x]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {pocket.error ? (
          <p role="alert" className="mt-3">
            {pocket.error}
          </p>
        ) : !pocket.data ? (
          <p className="mt-3 text-ink-muted">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-bg p-4 ring-1 ring-line">Nothing saved yet. Save a note from a deck in a course and it’ll be here.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {shown.map((n) =>
              "gone" in n && n.gone ? (
                <li key={n.id}>
                  <GoneNote c={n as GoneCard} />
                  <RemoveButton id={n.id} onDone={pocket.reload} />
                </li>
              ) : (
                <li key={n.id} className="rounded-3xl bg-surface p-4 ring-1 ring-line">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      aria-expanded={open === n.id}
                      className="min-h-11 flex-1 text-left font-serif text-lg font-semibold hover:underline"
                      onClick={() => {
                        setOpen(open === n.id ? null : n.id);
                        setFlipped(true);
                      }}
                    >
                      {(n as unknown as CardView).data.hook}
                    </button>
                    <span className="text-sm text-ink-muted">
                      {n.updatedSince && <span className="mr-2 rounded-full bg-[#fff1cc] px-2 py-0.5 font-semibold text-[#4a3400]">Recently updated</span>}
                      Saved {showDate(n.savedAt)}
                    </span>
                  </div>
                  {open === n.id && (
                    <div className="mt-3">
                      <MentorCard c={n as unknown as CardView} position="Saved note" flipped={flipped} onFlip={setFlipped} onChange={() => pocket.reload()} />
                    </div>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </section>
      <Contribute />
    </div>
  );
}

function RemoveButton({ id, onDone }: { id: string; onDone: () => void }) {
  return (
    <button
      type="button"
      className={cx(secondary, "mt-2")}
      onClick={() => void api("/api/mentor-notes", { body: { action: "save", noteId: id, on: false } }).then(onDone)}
    >
      Remove from Pocket Deck
    </button>
  );
}

const blank = (): MentorNoteData => cleanNote({ topics: [], audiences: ["partner", "coordinator", "staff"] });

/** "Leave a note behind": optional, reviewed before it's shown anywhere, and never posted on the author's behalf. */
function Contribute() {
  const mine = useApi<Mine>("/api/mentor-notes?mine=1");
  const [editing, setEditing] = useState<{ id: string; data: MentorNoteData } | null>(null);
  const [problem, setProblem] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setProblem([]);
    try {
      const r = await fetch("/api/mentor-notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw Object.assign(new Error(j.error), { problems: j.problems });
      mine.reload();
      return j;
    } catch (e) {
      setProblem((e as { problems?: string[] }).problems ?? [(e as Error).message]);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="leave-a-note" id="leave-a-note" className="scroll-mt-24">
      <h2 id="leave-a-note" className="font-serif text-2xl font-semibold">
        Leave a note behind
      </h2>
      <p className="text-ink-muted">
        Optional. What do you wish you’d known in your first weeks? An editor checks it for clarity, privacy and policy before it can appear in a deck, and you
        approve any changes to your wording first.
      </p>
      {editing ? (
        <div className="mt-3 rounded-3xl bg-surface p-4 ring-1 ring-line sm:p-6">
          <NoteFields value={editing.data} onChange={(data) => setEditing({ ...editing, data })} />
          {problem.length > 0 && (
            <ul role="alert" className="mt-3 list-disc rounded-2xl bg-[#fff1cc] p-3 pl-8 text-sm text-[#4a3400]">
              {problem.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={secondary}
              disabled={busy}
              onClick={async () => {
                const r = await post({ action: "draft", id: editing.id || undefined, data: editing.data });
                if (r) setEditing({ id: r.note.id, data: r.note.data });
              }}
            >
              Save draft
            </button>
            <button
              type="button"
              className={primary}
              disabled={busy}
              onClick={async () => {
                const saved = await post({ action: "draft", id: editing.id || undefined, data: editing.data });
                if (saved && (await post({ action: "submit", id: saved.note.id }))) setEditing(null);
              }}
            >
              Send to the editors
            </button>
            <button type="button" className={secondary} onClick={() => setEditing(null)}>
              Close
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-muted">Nothing is posted on your behalf. Sending it puts it in the editors’ review queue.</p>
        </div>
      ) : (
        <button type="button" className={cx(primary, "mt-3")} onClick={() => setEditing({ id: "", data: blank() })}>
          <Icon name="pen" className="size-4" /> Write a note
        </button>
      )}

      {(mine.data?.notes.length ?? 0) > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold">Your notes</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {mine.data!.notes.map((n) => (
              <li key={n.latest.id} className="rounded-2xl bg-bg p-3 ring-1 ring-line">
                <p className="font-semibold">{n.latest.data.hook || "Untitled note"}</p>
                <p className="text-sm text-ink-muted">
                  {STATES[n.latest.state]}
                  {n.latest.reason && ` · ${n.latest.reason}`}
                  {n.published && n.latest.state !== n.published.state && ` · the published version is ${STATES[n.published.state].toLowerCase()}`}
                </p>
                {n.editorVersion && (
                  <div className="mt-2 rounded-xl bg-muted p-3 text-sm">
                    <p className="font-semibold">An editor suggested this wording:</p>
                    <p className="mt-1">“{n.editorVersion.data.note}”</p>
                    {n.editorVersion.data.phrase && <p className="mt-1">Phrase: “{n.editorVersion.data.phrase}”</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className={primary} disabled={busy} onClick={() => void post({ action: "approve-edits", id: n.latest.id })}>
                        Approve and publish
                      </button>
                      <button type="button" className={secondary} disabled={busy} onClick={() => void post({ action: "decline-edits", id: n.latest.id })}>
                        Keep my wording
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {n.latest.state === "draft" && (
                    <button type="button" className={secondary} onClick={() => setEditing({ id: n.latest.id, data: n.latest.data })}>
                      Edit draft
                    </button>
                  )}
                  {n.latest.state !== "withdrawn" && (
                    <button
                      type="button"
                      className={secondary}
                      disabled={busy}
                      onClick={() =>
                        window.confirm("Withdraw this note? It’s removed from every deck and Pocket Deck.") &&
                        void post({ action: "withdraw", id: n.latest.id })
                      }
                    >
                      Withdraw
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
