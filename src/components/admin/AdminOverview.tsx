"use client";

import Link from "next/link";
import { useApi, type Me } from "@/lib/api";
import { Icon } from "../Icon";
import { AdminShell } from "./ui";
import { ADMIN_GROUPS, linkAllowed } from "./adminNav";

/** The admin front page: every area, grouped, with what each one is for. */
export function AdminOverview() {
  const me = useApi<Me>("/api/me").data;
  // Open review comments, shown on the Comments card so they're noticed.
  const open = useApi<{ open: number }>(me?.canAuthor ? "/api/admin/review-comments" : null).data?.open ?? 0;
  return (
    <AdminShell title="Overview">
      <div className="flex flex-col gap-8">
        {ADMIN_GROUPS.map((g) => {
          const links = g.links.filter((l) => linkAllowed(l, me));
          if (!links.length) return null;
          return (
            <section key={g.title} aria-labelledby={`group-${g.title}`}>
              <h2 id={`group-${g.title}`} className="font-mulish text-sm font-extrabold uppercase tracking-[0.14em] text-ink-muted">
                {g.title}
              </h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="flex h-full items-start gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-line-strong hover:bg-muted/40"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#DCECE5] text-[#0e7c7b]">
                        <Icon name={l.icon} className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 font-semibold">
                          {l.label}
                          {l.href === "/admin/comments" && open > 0 && (
                            <span className="rounded-full bg-gold px-2 text-xs font-bold text-[#102a43]">{open} open</span>
                          )}
                        </span>
                        <span className="block text-sm text-ink-muted">{l.description}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </AdminShell>
  );
}
