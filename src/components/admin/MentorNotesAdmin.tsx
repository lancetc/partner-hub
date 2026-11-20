"use client";

import { useState } from "react";
import { useApi } from "@/lib/api";
import { BADGES, STATES, TOPICS, type MentorNoteData } from "@/lib/notes";
import type { noteLibrary } from "@/server/notes";
import { AdminShell, Badge, btn, ErrorNote } from "./ui";
import { NoteFields } from "../notes/NoteFields";

/*
  The mentor note library for editors (docs/notes-to-a-younger-me.md). Review a submitted note (it's then dealt
  into decks), edit its wording (a contributor approves edits before they're published), record a policy owner's
  endorsement, flag it for re-review when a policy changes (copying pauses and it isn't dealt), withdraw it
  everywhere, or decline it. Helpful votes are shown as a signal, never as approval.
*/

type Loaded = ReturnType<typeof noteLibrary>;
type Row = Loaded["notes"][number];
const tone = (s: string) =>
  s === "reviewed" || s === "endorsed" ? "good" : s === "needs_review" || s === "changes" ? "warn" : s === "withdrawn" || s === "declined" ? "bad" : "info";

export function MentorNotesAdmin() {
  const lib = useApi<Loaded>("/api/admin/mentor-notes");
  const [editing, setEditing] = useState<{ id: string; data: MentorNoteData } | null>(null);
  const [problem, setProblem] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setProblem([]);
    try {
      const r = await fetch("/api/admin/mentor-notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw Object.assign(new Error(j.error), { problems: j.problems });
      lib.reload();
      return true;
    } catch (e) {
      setProblem((e as { problems?: string[] }).problems ?? [(e as Error).message]);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const ask = (q: string, body: Record<string, unknown>) => {
    const reason = window.prompt(q);
    if (reason) void act({ ...body, reason });
  };

  if (lib.error)
    return (
      <AdminShell title="Mentor notes">
        <ErrorNote text={lib.error} />
      </AdminShell>
    );
  if (!lib.data)
    return (
      <AdminShell title="Mentor notes">
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  if (editing)
    return (
      <AdminShell title="Edit a note" back={{ href: "/admin/mentor-notes", label: "Mentor notes" }}>
        <NoteFields value={editing.data} onChange={(data) => setEditing({ ...editing, data })} editor />
        {problem.length > 0 && <ErrorNote text={problem.join(" ")} />}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={btn.primary}
            disabled={busy}
            onClick={async () => (await act({ action: "edit", id: editing.id, data: editing.data })) && setEditing(null)}
          >
            Save edits
          </button>
          <button type="button" className={btn.secondary} onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          A contributor’s note: your edits wait for their OK before they’re published. A seed or editor-written note: edits to a published card go back for
          review.
        </p>
      </AdminShell>
    );

  const order = ["submitted", "changes", "needs_review", "draft", "reviewed", "endorsed", "declined", "withdrawn"];
  const notes = [...lib.data.notes].sort((a, b) => order.indexOf(a.latest.state) - order.indexOf(b.latest.state));
  return (
    <AdminShell title="Mentor notes">
      <p className="max-w-3xl text-ink-muted">
        Notes to a Younger Me. Only reviewed notes are dealt into course decks. Helpful votes are a signal that a note resonates, never a sign it’s current or
        correct.
      </p>
      {problem.length > 0 && (
        <div className="mt-3">
          <ErrorNote text={problem.join(" ")} />
        </div>
      )}
      <ul className="mt-4 flex flex-col gap-3">
        {notes.map((n) => (
          <NoteRow
            key={n.latest.id}
            n={n}
            busy={busy}
            onEdit={() => setEditing({ id: n.latest.id, data: structuredClone(n.latest.data) })}
            onReview={() => void act({ action: "review", id: n.latest.id })}
            onEndorse={() => ask("Which policy owner endorses it?", { action: "endorse", id: n.latest.id })}
            onFlag={() => ask("Why does it need re-review? (Copying pauses and it won’t be dealt.)", { action: "flag", id: n.latest.id })}
            onWithdraw={() => ask("Why is it withdrawn? (Shown to anyone who saved it.)", { action: "withdraw", id: n.latest.id })}
            onDecline={() => ask("Why won’t it be published? (Shown to the author.)", { action: "decline", id: n.latest.id })}
          />
        ))}
      </ul>
    </AdminShell>
  );
}

function NoteRow({
  n,
  busy,
  onEdit,
  onReview,
  onEndorse,
  onFlag,
  onWithdraw,
  onDecline,
}: {
  n: Row;
  busy: boolean;
  onEdit: () => void;
  onReview: () => void;
  onEndorse: () => void;
  onFlag: () => void;
  onWithdraw: () => void;
  onDecline: () => void;
}) {
  const s = n.latest.state;
  const d = n.latest.data;
  return (
    <li className="rounded-3xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-serif text-lg font-semibold">{d.hook || "Untitled note"}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <Badge tone={tone(s)}>{STATES[s]}</Badge>
            {n.published && n.published.version !== n.latest.version && <Badge tone="good">Published: version {n.published.version}</Badge>}
            <span>
              {d.badge} · {BADGES[d.badge]} · {d.rank}
            </span>
            <span>{d.topics.map((t) => TOPICS[t]).join(", ")}</span>
            <span>{n.contributed ? "Contributed" : "Seed or editor-written"}</span>
            {d.illustrative && <span>Illustrative</span>}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {d.authorName}
            {d.authorRole && `, ${d.authorRole}`} · {n.stats.helpful ?? 0} helpful · {n.stats.flipped ?? 0} read · {n.stats.copied ?? 0} phrase copies ·
            consent: {d.consent.audience && d.consent.attribution ? "recorded" : "missing"}
          </p>
          {n.latest.reason && <p className="mt-1 text-sm">{n.latest.reason}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn.secondary} onClick={onEdit}>
            Edit
          </button>
          {(s === "submitted" || s === "needs_review") && (
            <button type="button" className={btn.primary} disabled={busy || n.problems.length > 0} onClick={onReview}>
              {s === "needs_review" ? "Re-review: it’s current" : "Review: publish to decks"}
            </button>
          )}
          {s === "reviewed" && (
            <button type="button" className={btn.secondary} disabled={busy} onClick={onEndorse}>
              Record endorsement
            </button>
          )}
          {(s === "reviewed" || s === "endorsed") && (
            <button type="button" className={btn.secondary} disabled={busy} onClick={onFlag}>
              Flag for re-review
            </button>
          )}
          {s === "submitted" && (
            <button type="button" className={btn.secondary} disabled={busy} onClick={onDecline}>
              Decline
            </button>
          )}
          {s !== "withdrawn" && (
            <button type="button" className={btn.quiet} disabled={busy} onClick={onWithdraw}>
              Withdraw
            </button>
          )}
        </div>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-ink-muted">Read it</summary>
        <p className="mt-1">{d.scenario}</p>
        <p className="mt-1 font-serif">“{d.note}”</p>
        {d.phrase && <p className="mt-1">Phrase: “{d.phrase}”</p>}
        {n.problems.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-[#b3261e]">
            {n.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-ink-muted">History: {n.history.map((h) => `v${h.version} ${STATES[h.state].toLowerCase()}`).join(" · ")}</p>
      </details>
    </li>
  );
}
