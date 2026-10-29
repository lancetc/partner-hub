"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { formatDate, formatDuration } from "@/lib/format";
import { Icon } from "./Icon";

type Certificate = { id: string; name: string; completedAt: string; topics: number; minutes: number; deleted: boolean; reference: string };

/** In the profile: a certificate for every learning path they've finished, to view or print any time. */
export function MyCertificates() {
  const { data, error } = useApi<{ certificates: Certificate[] }>("/api/me/certificates");
  const list = data?.certificates ?? [];
  return (
    <section id="certificates" className="mt-5 scroll-mt-24 rounded-3xl border border-line bg-surface p-5" aria-labelledby="certificates-heading">
      <h2 id="certificates-heading" className="flex items-center gap-2 font-serif text-xl font-semibold">
        <Icon name="star" className="size-5 text-accent" /> Certificates
      </h2>
      {error ? (
        <p className="mt-2 text-ink-muted">Your certificates couldn’t be loaded. Check your connection and try again.</p>
      ) : !data ? (
        <p className="mt-2 text-ink-muted">Loading…</p>
      ) : !list.length ? (
        <p className="mt-2 text-ink-muted">
          You’ll get a certificate for each learning path you finish. It appears here, ready to print or save as a PDF whenever you need it.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {list.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#DCECE5] text-[#0e7c7b]">
                <Icon name="star" className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug">{c.name}</span>
                <span className="block text-sm text-ink-muted">
                  Completed {formatDate(c.completedAt)} · {c.topics} {c.topics === 1 ? "topic" : "topics"} ·{" "}
                  {formatDuration(c.minutes).replace(/^About/, "about")}
                </span>
                <span className="block text-xs text-ink-muted">
                  Reference {c.reference}
                  {c.deleted && " · this path is no longer offered, but your certificate still stands"}
                </span>
              </span>
              <Link
                href={`/paths/${encodeURIComponent(c.id)}/certificate?from=profile`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted"
              >
                View and print
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
