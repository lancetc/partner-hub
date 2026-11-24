"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { caseThreadSpace } from "@/server/caseThreads";
import { Icon } from "../Icon";

/*
  The Community page's way into "What Would You Do?" case threads (docs/case-threads.md): the canonical threads this
  person's role can see, fetched from the server, which checks each thread's audience. Nothing renders when there
  are none, so a thread for another role isn't advertised.
*/
export function CaseThreadsPanel({ className }: { className?: string }) {
  const space = useApi<ReturnType<typeof caseThreadSpace>>("/api/case-threads?space=1");
  const list = space.data?.threads ?? [];
  if (!list.length) return null;
  return (
    <section
      aria-labelledby="ct-panel-h"
      className={cx("rounded-3xl border-t-[6px] border-[#1f4e79] bg-surface p-4 ring-1 ring-line dark:border-[#9cc3ec]", className)}
    >
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Case threads</p>
      <h2 id="ct-panel-h" className="font-serif text-xl font-semibold">
        What would you do?
      </h2>
      <p className="text-sm text-ink-muted">
        Fictional dilemmas. Write your own first take privately, then compare with experienced coordinators. The same discussions appear in the Magazine.
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {list.map((t) => (
          <li key={t.id}>
            <Link href={t.href} className="inline-flex min-h-11 items-start gap-2 py-1 hover:underline">
              <Icon name="chat" className="mt-1 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">{t.title}</span>
                <span className="block text-sm text-ink-muted">
                  {t.responses} approved {t.responses === 1 ? "response" : "responses"} · {t.mine}
                  {t.status !== "open" && ` · ${t.statusText}`}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {(space.data?.saved ?? 0) > 0 && (
        <p className="mt-1 text-sm text-ink-muted">
          {space.data!.saved} saved {space.data!.saved === 1 ? "script" : "scripts"}, kept with each case.
        </p>
      )}
    </section>
  );
}
