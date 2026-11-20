"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { PlaybookBlock } from "@/lib/magazine";
import type { placeableSnippets } from "@/server/playbooks";
import { Field, input } from "./ui";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Live SOP playbook block (docs/live-playbooks.md). A course places a snippet by reference; it
  never copies or edits the steps. Snippets, releases and approvals live in the playbook library.
*/

export function PlaybookEdit({ block: b, update }: { block: PlaybookBlock; update: Update }) {
  const lib = useApi<{ snippets: ReturnType<typeof placeableSnippets> }>("/api/admin/playbooks?placeable=1");
  const list = lib.data?.snippets ?? [];
  const chosen = list.find((s) => s.id === b.snippetId);
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="clipboard" className="size-5" /> Job Aid
      </p>
      {lib.error && <p role="alert">{lib.error}</p>}
      <Field label="Which Job Aid" hint="The page points to it. It never holds a copy, so the aid stays the same everywhere it’s placed.">
        <select className={input} value={b.snippetId} onChange={(e) => update<PlaybookBlock>(b.id, (x) => void (x.snippetId = e.target.value))}>
          {!chosen && <option value={b.snippetId}>{b.snippetId || "Choose a snippet"}</option>}
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
              {s.withdrawn ? " (withdrawn)" : s.approved ? "" : " (no approved release yet)"}
            </option>
          ))}
        </select>
      </Field>
      <div className="mt-3">
        <Field label="Why it belongs here" hint="Shown with it: why to use this tool at work, at this point in the story or task.">
          <input
            className={input}
            maxLength={300}
            value={b.why ?? ""}
            onChange={(e) => update<PlaybookBlock>(b.id, (x) => (e.target.value ? void (x.why = e.target.value) : void delete x.why))}
          />
        </Field>
      </div>
      <NewAidFromHere onMade={(id) => (lib.reload(), update<PlaybookBlock>(b.id, (x) => void (x.snippetId = id)))} />
      {lib.data && (
        <p
          role="status"
          className={cx(
            "mt-3 rounded-2xl px-4 py-3 text-sm font-semibold",
            chosen?.approved && !chosen.withdrawn
              ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]"
              : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
          )}
        >
          {chosen?.withdrawn
            ? "This snippet is withdrawn: readers see its fallback route, and the course can’t be published until it’s restored."
            : chosen?.approved
              ? "This snippet has an approved release. Readers see whatever release is current when they open the course."
              : "This snippet has no approved release, so the course can’t be published with it. Approve a release in the playbook library."}
        </p>
      )}
      <p className="mt-3 text-sm text-ink-muted">
        Steps, owners and sign-offs are managed in{" "}
        <Link href="/admin/playbooks" className="font-semibold text-accent underline">
          Playbooks
        </Link>
        . Changing them there updates every course that places this snippet.
      </p>
    </div>
  );
}

/**
  Create Job Aid from this section: a new draft in the library that this block then points to. It is a draft, not a
  copy of the page: it shows nothing to learners, and the course can't be published with it, until its release is
  approved in the library.
*/
function NewAidFromHere({ onMade }: { onMade: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  if (!open)
    return (
      <p className="mt-3 text-sm">
        <button type="button" className="font-semibold text-accent underline" onClick={() => setOpen(true)}>
          Create a Job Aid from this section
        </button>
      </p>
    );
  return (
    <div className="mt-3 rounded-2xl bg-muted p-3">
      <Field label="Name the task" hint="For example: Invoice rate check. You’ll write its steps, source and sign-offs in the library.">
        <input className={input} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-full bg-action px-4 font-semibold text-on-action disabled:opacity-60"
          disabled={title.trim().length < 3}
          onClick={async () => {
            setError("");
            try {
              const r = await api<{ id: string }>("/api/admin/playbooks", {
                body: {
                  action: "save-snippet",
                  data: { title, audiences: ["staff"], risk: "operational", source: { docId: "", anchor: "" }, fallback: { text: "", contactKeys: [] } },
                },
              });
              onMade(r.id);
              setOpen(false);
              setTitle("");
            } catch (e) {
              setError(e instanceof Error ? e.message : "That couldn’t be created.");
            }
          }}
        >
          Create the draft
        </button>
        <button type="button" className="min-h-11 px-2 font-semibold underline" onClick={() => setOpen(false)}>
          Cancel
        </button>
        {error && (
          <span role="alert" className="text-sm font-semibold text-danger">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
