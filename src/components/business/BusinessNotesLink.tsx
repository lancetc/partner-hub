"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { businessSpace } from "@/server/businessNotes";
import { Icon } from "../Icon";

/*
  The way into Business Field Notes from Work Tools, Community and Pocket Deck. It asks the server, which answers
  only for a verified principal; for anyone else it renders nothing, so the deck's existence isn't advertised.
  `threads` lists the canonical discussions (the Community view).
*/
export function BusinessNotesLink({ threads, className }: { threads?: boolean; className?: string }) {
  const space = useApi<ReturnType<typeof businessSpace>>("/api/business-notes?space=1");
  if (!space.data) return null;
  const list = space.data.threads;
  return (
    <section aria-labelledby="bfn-link-h" className={cx("rounded-3xl border-t-[6px] border-[#e0a63a] bg-surface p-4 ring-1 ring-line", className)}>
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Principals only</p>
      <h2 id="bfn-link-h" className="font-serif text-xl font-semibold">
        <Link href="/business-notes" className="hover:underline">
          Business Field Notes
        </Link>
      </h2>
      <p className="text-sm text-ink-muted">
        Other Care Partner principals on one business decision each, with a discussion for each card. Peer experience, not policy.
      </p>
      {threads && list.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {list.map((t) => (
            <li key={t.noteId}>
              <Link href={t.href} className="inline-flex min-h-11 items-center gap-2 hover:underline">
                <Icon name="chat" className="size-4 shrink-0" />
                <span>{t.title}</span>
                <span className="text-sm text-ink-muted">
                  · {t.questions} question{t.questions === 1 ? "" : "s"}
                  {t.state !== "open" && ` · ${t.state}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!threads && (
        <Link href="/business-notes" className="mt-2 inline-flex min-h-11 items-center gap-1 font-semibold text-accent hover:underline">
          Open the deck <Icon name="arrow-right" className="size-4" />
        </Link>
      )}
    </section>
  );
}
