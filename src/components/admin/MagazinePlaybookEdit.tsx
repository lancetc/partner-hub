"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
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
        <Icon name="clipboard" className="size-5" /> Live SOP playbook
      </p>
      {lib.error && <p role="alert">{lib.error}</p>}
      <Field label="Playbook snippet">
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
