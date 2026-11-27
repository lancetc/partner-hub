"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { DrawerData, DrawerItem, homePins } from "@/server/pocketPlaybook";
import { Icon } from "../Icon";
import { openCompanion } from "./pocketApi";

/*
  The Live Call Pocket Playbook on the Hub home and in Work Tools (docs/pocket-playbook.md).
  HomePinnedTools: "Your pinned tools", the person's own pins in their order. Shown only when there's a pin.
  PocketToolCards: the live call tools at the top of Work Tools, for the person's role.
*/

const NOTE: Record<DrawerItem["state"], string> = {
  current: "",
  draft: "Draft",
  review_due: "Review due",
  updated: "Updated since you pinned this",
  unavailable: "Unavailable",
};
const icon = (it: DrawerItem) =>
  it.kind === "job_aid" ? "clipboard" : it.label === "Calculator" ? "money" : it.label === "Escalation path" ? "alert" : "chat";

export function HomePinnedTools() {
  const d = useApi<ReturnType<typeof homePins>>("/api/pocket?view=home").data;
  if (!d || !d.pinned.length) return null;
  return (
    <section aria-labelledby="home-pinned" className="mt-10 rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="home-pinned" className="flex items-center gap-2 font-serif text-2xl font-semibold">
          <Icon name="pin" className="size-5 text-accent" /> Your pinned tools
        </h2>
        <div className="flex flex-wrap gap-x-4 text-sm font-semibold">
          <button
            type="button"
            onClick={(e) => openCompanion(e.currentTarget)}
            className="inline-flex min-h-11 items-center text-accent underline underline-offset-2"
          >
            Arrange pins{d.more > 0 && ` (${d.more} more)`}
          </button>
          <Link href="/tools" className="inline-flex min-h-11 items-center text-accent underline underline-offset-2">
            View all Work Tools
          </Link>
        </div>
      </div>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {d.pinned.map((it) => (
          <li key={`${it.kind}:${it.id}`}>
            <Link
              href={`${it.href}${it.kind === "tool" ? `${it.href.includes("?") ? "&" : "?"}from=home` : ""}`}
              className="flex h-full min-h-16 items-center gap-3 rounded-2xl bg-muted px-4 py-3 hover:ring-1 hover:ring-action"
            >
              <span
                aria-hidden
                className={cx("grid size-10 shrink-0 place-items-center rounded-xl", it.state === "unavailable" ? "bg-surface" : "bg-action text-on-action")}
              >
                <Icon name={icon(it)} className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-accent">
                  {it.label}
                  {NOTE[it.state] && ` · ${NOTE[it.state]}`}
                </span>
                <span className="block font-semibold leading-snug">{it.title}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PocketToolCards() {
  const d = useApi<DrawerData>("/api/pocket").data;
  if (!d || !d.tools.length) return null;
  return (
    <section aria-labelledby="live-call-tools" className="mt-6">
      <h2 id="live-call-tools" className="font-serif text-2xl font-semibold">
        Live call tools
      </h2>
      <p className="mt-1 text-ink-muted">
        For the moment on a call. Also in <strong>Favourites</strong> in the header, where you can pin them. Pilot drafts until their owners approve them.
      </p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {d.tools.map((it) => (
          <li key={it.id}>
            <Link href={it.href} className="group flex h-full items-start gap-3 rounded-3xl bg-[#102a43] p-4 text-white ring-1 ring-line hover:ring-action">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#7fd4d4] text-[#102a43]">
                <Icon name={icon(it)} className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-[#7fd4d4]">
                  {it.label}
                  {NOTE[it.state] && ` · ${NOTE[it.state]}`}
                </span>
                <span className="mt-0.5 block font-serif text-lg font-semibold leading-snug transition-colors group-hover:text-[#007f7e] dark:group-hover:text-[#7fd6d2]">
                  {it.title}
                </span>
                <span className="mt-1 block text-sm text-white/85">{it.task}</span>
                {it.pinned && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold">
                    <Icon name="pin" className="size-3.5" /> Pinned
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
