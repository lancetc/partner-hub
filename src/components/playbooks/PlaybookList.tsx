"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { RISK, type Risk } from "@/lib/playbook";
import type { playbookList } from "@/server/playbooks";
import { Icon } from "../Icon";

/*
  The playbooks a reader's role may see (docs/live-playbooks.md), with the ones they've saved to their Shift Wallet
  first. Each opens the same card a course shows: the current approved release, or its fallback route.
*/

type Loaded = ReturnType<typeof playbookList>;
type Row = NonNullable<Loaded["playbooks"][number]>;

export function PlaybookList() {
  const loaded = useApi<Loaded>("/api/playbooks");
  if (loaded.error) return <p role="alert">{loaded.error}</p>;
  if (!loaded.data) return <p className="text-ink-muted">Loading…</p>;
  const rows = loaded.data.playbooks.filter((r): r is Row => Boolean(r));
  if (!rows.length) return <p className="mt-6 text-lg">There are no playbooks for your role yet.</p>;
  const saved = rows.filter((r) => r.saved);
  return (
    <>
      {saved.length > 0 && (
        <section aria-labelledby="wallet" className="mt-6">
          <h2 id="wallet" className="flex items-center gap-2 font-serif text-2xl font-semibold">
            <Icon name="bookmark-filled" className="size-5 text-accent" /> Your Shift Wallet
          </h2>
          <p className="text-sm text-ink-muted">Saved playbooks always open at the current approved release.</p>
          <Cards rows={saved} />
        </section>
      )}
      <section aria-labelledby="all" className="mt-8">
        <h2 id="all" className="font-serif text-2xl font-semibold">
          All playbooks for your role
        </h2>
        <Cards rows={rows} />
      </section>
    </>
  );
}

function Cards({ rows }: { rows: Row[] }) {
  return (
    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            href={`/resources/playbooks/${r.id}`}
            className="group flex h-full items-start gap-4 rounded-3xl bg-muted p-5 ring-1 ring-line transition hover:shadow-md hover:ring-action"
          >
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-action text-on-action">
              <Icon name="clipboard" className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{RISK[r.risk as Risk]}</span>
              <span className="mt-0.5 block font-serif text-xl font-semibold leading-snug group-hover:underline">{r.title}</span>
              <span className="mt-1 block text-ink-muted">{r.purpose}</span>
              <span
                className={cx(
                  "mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  r.readiness === "fallback" ? "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]" : "bg-tealtint",
                )}
              >
                {r.readiness === "fallback" ? "Temporarily unavailable: see the fallback route" : `Release ${r.number}`}
                {r.readiness === "review_due" ? " · review due" : ""}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
