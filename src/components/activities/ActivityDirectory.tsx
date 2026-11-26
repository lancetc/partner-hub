"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cx } from "@/lib/format";
import { GUIDE_GOALS, GUIDE_ROLES } from "@/lib/magazine";
import { ACTIVITY_KINDS, type ActivityKind } from "@/lib/activityCatalogue";
import type { DirectoryItem } from "@/server/activityCatalogue";
import { Icon } from "../Icon";

/*
  The learner directory of interactive activities: everything this person can open, filtered by role, kind or intent.
  The list is already only what their audience and access allow; the filters just narrow it. Fictional practice and
  tools for real work are labelled apart, and Resume shows only where the course keeps their place.
*/

const select = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3";

function track(activity: string, ref?: string) {
  try {
    void fetch("/api/activities/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "opened", activity, surface: "directory", ...(ref && { ref }) }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics never gets in the learner's way.
  }
}

export function ActivityDirectory({ items, audience }: { items: DirectoryItem[]; audience: string }) {
  // Starts on the person's own role where it's one of the browsing roles, so the first view is the relevant one.
  const [role, setRole] = useState(GUIDE_ROLES.some((r) => r.value === audience) ? audience : "");
  const [kind, setKind] = useState("");
  const [goal, setGoal] = useState("");
  const [q, setQ] = useState("");
  const kinds = [...new Set(items.map((i) => i.kind))] as ActivityKind[];
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter(
      (i) =>
        (!role || i.roles.includes(role)) &&
        (!kind || i.kind === kind) &&
        (!goal || i.goals.includes(goal)) &&
        (!t || `${i.title} ${i.text} ${i.name}`.toLowerCase().includes(t)),
    );
  }, [items, role, kind, goal, q]);
  if (!items.length) return <p className="mt-8 text-lg">There aren’t any interactive activities for your role yet.</p>;
  return (
    <div className="mt-8">
      <div className="grid gap-3 rounded-3xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Search
          <input type="search" className={select} value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example: discharge" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          For
          <select className={select} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Every role</option>
            {GUIDE_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Kind
          <select className={select} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Every kind</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {ACTIVITY_KINDS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          To help you
          <select className={select} value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option value="">With anything</option>
            {GUIDE_GOALS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-3 text-sm text-ink-muted" role="status">
        {shown.length} of {items.length} you can open
      </p>
      {!shown.length ? (
        <p className="mt-4 text-lg">Nothing matches those filters. Try “Every role” or another kind.</p>
      ) : (
        <ul className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((i) => {
            const work = i.practice === "Use it at work";
            return (
              <li key={i.key} className="flex">
                <Link
                  href={i.href}
                  onClick={() => track(i.activity, i.href.startsWith("/magazine/") ? i.href.slice("/magazine/".length) : undefined)}
                  className={cx(
                    "group flex w-full flex-col overflow-hidden rounded-3xl border bg-surface transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action motion-reduce:transition-none",
                    work ? "border-2 border-[#fab53d]" : "border-line",
                  )}
                >
                  {i.image && (
                    <div className="relative aspect-[16/9] overflow-hidden bg-[#007373]">
                      {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded course cover, sized by the frame */}
                      <img src={i.image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
                      {ACTIVITY_KINDS[i.kind as ActivityKind]} · {i.practice}
                      {i.minutes ? ` · about ${i.minutes} min` : ""}
                    </p>
                    <h2 className="font-serif text-xl font-semibold leading-snug group-hover:underline">{i.title}</h2>
                    {i.text && <p className="text-sm text-ink-muted">{i.text}</p>}
                    {i.title !== i.name && <p className="text-sm">Activity: {i.name}</p>}
                    {i.also.length > 0 && <p className="text-xs text-ink-muted">Also: {i.also.join(", ")}</p>}
                    <span className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start font-semibold text-accent">
                      {i.state === "started" ? "Resume" : i.state === "completed" ? "Open again" : work ? "Open the tool" : "Start"}{" "}
                      <Icon name="arrow-right" className="size-4" />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
