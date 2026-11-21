"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { NOTE_STATUS, RETURN_STATUS } from "@/lib/living";
import type { LivingLibrary } from "@/server/living";
import { AdminShell, Badge, btn, ErrorNote, Field, input, statusText, statusTone } from "../ui";
import { Icon } from "../../Icon";
import { box } from "../problems/problemUi";

/*
  Return episodes (docs/living-cases.md): a later story that brings learners back to someone they have met, to
  practise the same judgement in a situation that looks different. Each has a return link (what the two stories
  share, and how they differ) and can have one Field Note inviting people back.
*/
export function ReturnList() {
  const lib = useApi<LivingLibrary>("/api/admin/living");
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      return await api<{ id?: string }>("/api/admin/living", { body });
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const d = lib.data;
  return (
    <AdminShell title="Return episodes" back={{ href: "/admin/characters", label: "Characters and stories" }}>
      <p className="max-w-3xl text-ink-muted">
        A return brings learners back to a person they’ve met, a little later, with one thing changed and a new decision to make. It tests whether a judgement
        travels. Everyone here is fictional, and what a learner chose the first time never changes what happens to the person.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btn.primary} onClick={() => setAdding(!adding)}>
          <Icon name="plus" className="size-4" /> New return
        </button>
        {d && !d.hasPilot && (
          <button
            type="button"
            className={btn.secondary}
            disabled={busy}
            onClick={async () => {
              const r = await post({ action: "pilot" });
              if (r?.id) router.push(`/admin/characters/returns/${r.id}`);
            }}
          >
            <Icon name="refresh" className="size-4" /> Add the Dot return pilot
          </button>
        )}
        <Link href="/admin/signal-room" className={btn.secondary}>
          <Icon name="gauge" className="size-4" /> Signal Room
        </Link>
      </div>
      {d && !d.hasPilot && (
        <p className="mt-2 max-w-3xl text-sm text-ink-muted">
          The pilot adds “Dot at the markets” as a draft course with its return link and a draft Field Note. Nothing is approved, published, released or sent by
          adding it.
        </p>
      )}
      {error && (
        <div className="mt-3">
          <ErrorNote text={error} />
        </div>
      )}
      {adding && (
        <form
          className={cx(box, "mt-4 flex flex-wrap items-end gap-3")}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await post({ action: "create", title });
            if (r?.id) router.push(`/admin/characters/returns/${r.id}`);
          }}
        >
          <Field label="Working title" hint="For example: Dot at the markets." className="min-w-64 flex-1">
            <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={4} />
          </Field>
          <button type="submit" className={btn.primary} disabled={busy}>
            Start
          </button>
        </form>
      )}
      {lib.error && (
        <div className="mt-4">
          <ErrorNote text={lib.error} />
        </div>
      )}
      {!d ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : !d.returns.length ? (
        <p className={cx(box, "mt-6")}>No returns yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {d.returns.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/characters/returns/${r.id}`} className={cx(box, "block transition hover:ring-1 hover:ring-action")}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-serif text-xl font-semibold">{r.title}</span>
                  {r.sample && <Badge tone="warn">Sample</Badge>}
                  <Badge tone={r.status === "approved" ? (r.changed ? "warn" : "good") : r.status === "withdrawn" ? "bad" : "neutral"}>
                    {r.status === "approved" && r.changed ? "Approved, with unapproved changes" : RETURN_STATUS[r.status]}
                  </Badge>
                </span>
                <span className="mt-1 block text-sm text-ink-muted">
                  {r.character || "No returning character"}
                  {r.from && r.to && ` · “${r.from}” → “${r.to}”`}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                  <span>
                    Course: {r.course ? r.course.title : "none chosen"}
                    {r.course && (
                      <>
                        {" "}
                        <Badge tone={statusTone(r.course.status)}>{statusText[r.course.status] ?? r.course.status}</Badge>
                      </>
                    )}
                  </span>
                  <span>Field Note: {r.note ? NOTE_STATUS[r.note.status] : "none"}</span>
                  {r.status !== "approved" && r.blocking > 0 && (
                    <span>
                      {r.blocking} {r.blocking === 1 ? "thing" : "things"} to settle before approval
                    </span>
                  )}
                  {r.reviewOn && <span>Review {r.reviewOn}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
