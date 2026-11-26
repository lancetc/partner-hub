"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useApi, type Me } from "@/lib/api";
import { useHub, useHydrated } from "@/lib/store";
import { cx, formatDate } from "@/lib/format";
import { sinceLastVisit, type VisitItem } from "@/lib/sinceLastVisit";
import type { TopicSummary } from "@/lib/topicSummary";
import { AskTrilogy } from "./AskTrilogy";
import { Icon } from "./Icon";
import { StoryVisual } from "./StoryVisual";
import { CountUp } from "./CountUp";
import type { MyPath } from "./MyLearningPaths";
import { HomeCourses } from "./onboarding/HomeCourses";

/*
  The top of the homepage: a workspace, not a content feed. It answers three questions in a couple of
  minutes. What do I need to know (since your last visit, the latest important update)? What do I need
  to do (actions, learning to continue)? Where can I get help (Ask Trilogy)? Below it, the homepage's
  discovery area keeps the learning, Community, games and news.
*/

type Item = VisitItem & { id: number; body: string; href: string | null; ackRequired: boolean; ackedAt: string | null; read: boolean };
type Box = { action: Item[]; updates: Item[]; activity: Item[]; counts: { action: number; updates: number; activity: number } };

const step = (n: number) => ({ "--step": n }) as React.CSSProperties;
const lastVisitKey = (who: string) => `tc-last-visit-${who}`;

export function HomeWorkspace({ topics }: { topics: TopicSummary[] }) {
  const hydrated = useHydrated();
  const me = useApi<Me>("/api/me").data;
  if (!hydrated || !me) return <div className="min-h-[24rem]" aria-hidden />;
  return <Workspace me={me} topics={topics} />;
}

function Workspace({ me, topics }: { me: Me; topics: TopicSummary[] }) {
  const box = useApi<Box>("/api/inbox").data;
  const paths = useApi<{ paths: (MyPath & { done?: boolean })[] }>("/api/learning-paths?started=1").data?.paths ?? [];
  const attempts = useHub((s) => s.lessons);
  // The time the page opened, once, so every part agrees on today.
  const [now] = useState(() => new Date());
  // When they last opened the homepage (on this device), read once, then set to now for next time.
  const [last] = useState<string | null>(() => {
    try {
      return localStorage.getItem(lastVisitKey(me.user.id));
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(lastVisitKey(me.user.id), new Date().toISOString());
    } catch {}
  }, [me.user.id]);

  const all = box ? [...box.action, ...box.updates, ...box.activity] : [];
  const summary = box ? sinceLastVisit(all, last, now) : null;
  // The cover picture's slot for that note (home/HomeHero): it's on the page by the time this has its inbox.
  const hydrated = useHydrated();
  const noteSlot = hydrated && typeof document !== "undefined" ? document.getElementById("home-hero-note") : null;
  // Starting courses' invitations and reminders stay in the Inbox but not here: "Your courses and training" carries them,
  // and they're not urgent (the owner, Nov 2026). The My actions count follows the same list.
  const todo = box?.action.filter((a) => !a.done && a.category !== "Getting started") ?? [];
  // Time-sensitive only (the owner, Nov 2026): due within the next 7 days, or overdue, soonest first. The rest wait in
  // the Inbox, and My actions still counts them all.
  const week = now.getTime() + 7 * 86_400_000;
  const dueSoon = todo.filter((a) => a.dueAt && Date.parse(a.dueAt) <= week).sort((x, y) => x.dueAt!.localeCompare(y.dueAt!));

  // Learning: the most recent topic in progress, and how far through their first learning path they are.
  const bySlug = new Map(topics.map((t) => [t.slug, t]));
  const current = Object.entries(attempts)
    .filter(([slug, a]) => a.status === "in_progress" && bySlug.has(slug))
    .sort(([, a], [, b]) => (b.savedAt ?? b.startedAt).localeCompare(a.savedAt ?? a.startedAt))
    .map(([slug, a]) => ({ topic: bySlug.get(slug)!, step: (bySlug.get(slug)!.stepOf[a.nodeId] ?? 0) + 1 }))[0];
  const path = paths.find((p) => !p.done) ?? paths[0];
  const live = path?.steps.filter((s) => !s.draft) ?? [];
  const pathDone = live.filter((s) => s.completedAt || attempts[s.slug]?.status === "completed").length;
  const percent = live.length ? Math.round((pathDone / live.length) * 100) : null;

  return (
    // The greeting is in the homepage's cover (home/HomeHero), straight above this.
    <section aria-label="Your workspace" className="flex flex-col gap-5">
      {/* A small note at the bottom left of the homepage's cover picture (its slot is in home/HomeHero). */}
      {summary &&
        noteSlot &&
        createPortal(
          <p
            role="status"
            className="hub-note-in flex items-start gap-2 rounded-2xl bg-white/85 px-3 py-1.5 text-sm text-ink shadow-sm ring-1 ring-black/5 backdrop-blur-md dark:bg-[#0b1f33]/80 dark:ring-white/10"
          >
            <Icon name="spark" className="mt-0.5 size-4 shrink-0 text-[#008282] dark:text-[#3cb8b9]" />
            <span>
              <span className="font-semibold">{summary.lead}: </span>
              {summary.text}
            </span>
          </p>,
          noteSlot,
        )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <div data-build-step style={step(2)} className="h-full [&>section]:h-full">
            <AskTrilogy />
          </div>
        </div>

        {/* Smaller tiles, and the topic to continue filling the rest, so this side ends where Ask Trilogy does. */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/inbox"
              data-build-step
              style={step(2)}
              className="rounded-3xl border border-[#c7393e]/25 bg-[#c7393e]/10 px-4 py-3 hover:border-[#c7393e]/60"
            >
              <span className="block text-xs font-semibold text-ink-muted">My actions</span>
              <span className={cx("block font-serif text-3xl font-semibold leading-tight", todo.length ? "text-[#c7393e] dark:text-[#ff9ea2]" : "")}>
                {box ? <CountUp value={todo.length} step={2} /> : "–"}
              </span>
              <span className="block text-xs text-ink-muted">{todo.length === 1 ? "item needs attention" : "items need attention"}</span>
            </Link>
            <Link
              href={path ? `/paths/${encodeURIComponent(path.id)}` : "/paths"}
              data-build-step
              style={step(3)}
              className="rounded-3xl border border-[#3cb8b9]/40 bg-[#3cb8b9]/15 px-4 py-3 hover:border-[#008282]"
            >
              <span className="block text-xs font-semibold text-ink-muted">My learning</span>
              <span className="block font-serif text-3xl font-semibold leading-tight text-[#008282] dark:text-[#3cb8b9]">
                {percent === null ? "–" : <CountUp value={percent} step={3} format={(n) => `${n}%`} />}
              </span>
              <span className="block truncate text-xs text-ink-muted">{path ? path.name : "Start a Discovery Path"}</span>
            </Link>
          </div>

          {current && (
            <Link
              href={`/topics/${current.topic.slug}`}
              data-build-step
              style={step(4)}
              className="tile tile-card group flex flex-1 items-stretch gap-4 border border-[#f9b53f]/50 bg-[#f9b53f]/15 pr-4 hover:border-[#f9b53f] hover:bg-[#e6f3f1] dark:hover:bg-[#3cb8b9]/15"
            >
              <StoryVisual {...current.topic.visual} alt="" className="min-h-24 w-28 shrink-0" iconSize="size-6" />
              <span className="min-w-0 self-center py-4">
                <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Continue where you left off</span>
                <span className="tile-heading mt-0.5 block font-serif text-lg font-semibold leading-snug">{current.topic.title}</span>
                <span className="block text-sm text-ink-muted">
                  Step {current.step} of {current.topic.steps} · {current.topic.minutes} min topic
                </span>
              </span>
            </Link>
          )}
        </div>
      </div>

      {/* Two halves (the owner, Nov 2026): the courses and training allocated to them, and what needs them now. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2">
        <div data-build-step style={step(4)} className="min-w-0 [&>section]:h-full">
          <HomeCourses />
        </div>
        {/* What do I need to do? Kept apart from anything optional, so it never competes with a game or a post. */}
        <section
          data-build-step
          style={step(3)}
          aria-labelledby="attention"
          className="min-w-0 rounded-3xl border border-[#fab53d]/50 bg-[#fab53d]/12 p-5 sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="attention" className="font-serif text-2xl font-semibold">
              Needs your attention
            </h2>
            <Link href="/inbox" className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent transition-colors hover:text-[#007f7e]">
              View all <Icon name="arrow-right" className="size-4" />
            </Link>
          </div>
          {!box ? (
            <p className="mt-3 text-ink-muted">Loading…</p>
          ) : dueSoon.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-ink-muted">
              <Icon name="circle-check" className="size-5 text-success" /> {todo.length ? "Nothing due in the next 7 days." : "You’re all caught up."}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {dueSoon.slice(0, 3).map((a) => {
                const days = a.dueAt ? Math.ceil((Date.parse(a.dueAt) - now.getTime()) / 86_400_000) : null;
                return (
                  <li key={a.id}>
                    <Link
                      href="/inbox"
                      className="group flex items-center gap-3 rounded-2xl bg-surface px-3 py-3 shadow-sm ring-1 ring-black/5 hover:ring-[#fab53d]"
                    >
                      <span
                        aria-hidden
                        className={cx(
                          "grid size-10 shrink-0 place-items-center rounded-full",
                          a.priority === "critical" ? "bg-[#c7393e] text-white" : "bg-[#fff1d6] text-[#7a4a00]",
                        )}
                      >
                        <Icon name={a.ackRequired ? "check" : "flag"} className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold leading-snug transition-colors group-hover:text-[#007f7e]">{a.title}</span>
                        <span className="block text-sm text-ink-muted">
                          {a.ackRequired ? "Read and acknowledge" : a.category}
                          {a.dueAt && ` · due ${formatDate(a.dueAt)}`}
                          {days !== null && days <= 7 && (
                            <span className="font-semibold text-[#c7393e] dark:text-[#ff9ea2]">
                              {" "}
                              · {days < 0 ? "overdue" : days === 0 ? "due today" : days === 1 ? "1 day left" : `${days} days left`}
                            </span>
                          )}
                        </span>
                      </span>
                      {a.priority === "critical" && <span className="rounded-full bg-[#c7393e] px-2 py-0.5 text-xs font-bold text-white">Critical</span>}
                      <Icon name="arrow-right" className="size-4 shrink-0 text-ink-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
