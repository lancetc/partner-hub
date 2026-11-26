"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { useHydrated } from "@/lib/store";
import type { MyCourses } from "@/server/onboardingCourses";
import { Icon } from "../Icon";

/*
  "Your courses and training" on the homepage dashboard (the owner, Nov 2026): the starting courses allocated to them,
  as Getting started's last step promises, each with how far they are and when it's due. For everyone with a course
  allocated, whether or not they've finished Getting started (the owner, Nov 2026); nothing when none is.
*/
export function HomeCourses() {
  const hydrated = useHydrated();
  const { data } = useApi<MyCourses>(hydrated ? "/api/onboarding/courses" : null);
  if (!data?.courses.length) return null;
  return (
    <section aria-labelledby="home-courses" className="rounded-3xl border border-[#3cb8b9]/40 bg-[#3cb8b9]/10 p-5 sm:p-6">
      <h2 id="home-courses" className="font-serif text-2xl font-semibold">
        Your courses and training
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {data.courses.map((c) => {
          const pct = c.progress.total ? Math.round((c.progress.done / c.progress.total) * 100) : 0;
          // The course's picture (the owner, Nov 2026): its first item's poster, as Getting started shows it.
          const poster = c.steps.find((s) => s.poster)?.poster ?? null;
          return (
            <li key={c.id}>
              <Link
                href={`/onboarding/course/${c.id}`}
                className={
                  poster
                    ? "group flex items-stretch gap-3 overflow-hidden rounded-2xl bg-surface pr-3 shadow-sm ring-1 ring-black/5 hover:ring-[#008282]"
                    : "group flex items-center gap-3 rounded-2xl bg-surface px-3 py-3 shadow-sm ring-1 ring-black/5 hover:ring-[#008282]"
                }
              >
                {poster ? (
                  // The picture fills the card's left side, edge to edge (the owner, Nov 2026).
                  <span className="relative min-h-20 w-24 shrink-0 bg-muted sm:w-32">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the course's first item's own picture */}
                    <img src={poster} alt="" className="absolute inset-0 size-full object-cover" />
                  </span>
                ) : (
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-[#3cb8b9]/20 text-[#007373] dark:text-[#3cb8b9]">
                    <Icon name="route" className="size-5" />
                  </span>
                )}
                <span className={poster ? "min-w-0 flex-1 self-center py-3" : "min-w-0 flex-1"}>
                  <span className="block font-semibold leading-snug transition-colors group-hover:text-[#007f7e]">{c.title}</span>
                  <span className="block text-sm text-ink-muted">
                    {c.progress.done} of {c.progress.total} steps done · about {c.minutes} min left
                    {c.due ? ` · ${c.due.text}` : ""}
                  </span>
                  <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[#3cb8b9]/20">
                    <span className="block h-full rounded-full bg-[#008282] dark:bg-[#3cb8b9]" style={{ width: `${pct}%` }} />
                  </span>
                </span>
                <Icon name="arrow-right" className="size-4 shrink-0 self-center text-ink-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
