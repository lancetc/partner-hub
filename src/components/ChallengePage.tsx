"use client";

import Link from "next/link";
import { useState } from "react";
import { api, formatWhen, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { TEAM_SWATCH } from "@/lib/challengeScoring";
import { Icon, type IconName } from "./Icon";
import { StoryVisual } from "./StoryVisual";
import type { Thumbnail } from "@/lib/pathThumbnail";

/*
  A challenge from the learner's side: today's mission, the days ahead, points, streak and badges,
  the leaderboards, and the story so far. Built for phones first.
*/

type View = {
  id: string;
  name: string;
  tagline: string;
  story: string;
  /** The first mission's cover photo. */
  cover: Thumbnail | null;
  timezone: string;
  preview: boolean;
  state: "upcoming" | "live" | "finished";
  closesAt: string;
  me: {
    total: number;
    streak: number;
    rank: number | null;
    of: number;
    achievements: { id: string; label: string; description: string; earned: boolean }[];
    hideName: boolean;
    emails: boolean;
    team: string | null;
  };
  missions: {
    day: number;
    slug: string;
    beat: string;
    title: string | null;
    minutes: number;
    opensAt: string;
    open: boolean;
    completedAt: string | null;
    onTheDay: boolean;
    perfect: boolean;
    total: number;
    possible: number;
  }[];
  leaderboard: {
    top: { rank: number; name: string; points: number; team: string | null; colour: string; me: boolean }[];
    me: { rank: number; points: number } | null;
  };
  teams: { rank: number; id: string; name: string; colour: string; members: number; average: number; finishedToday: number; mine: boolean }[];
  storySoFar: { day: number; title: string; decisions: { label: string; choice: string | null; right: boolean }[] }[];
};

const BADGE_ICON: Record<string, IconName> = { "first-steps": "flag", "on-a-roll": "spark", sharp: "target", "full-streak": "star", finale: "check" };

export function ChallengePage({ id }: { id: string }) {
  const { data, error, setData } = useApi<View>(`/api/challenges/${encodeURIComponent(id)}`);
  const [board, setBoard] = useState<"people" | "teams">("people");
  if (error) return <Shell>{<p className="mt-4 rounded-2xl border border-line p-4 text-ink-muted">This challenge isn’t available.</p>}</Shell>;
  if (!data) return <Shell>{<p className="mt-4 text-ink-muted">Loading…</p>}</Shell>;

  const open = data.missions.filter((m) => m.open);
  const today = open[open.length - 1];
  const next = data.missions.find((m) => !m.open);
  const days = data.missions.length;
  const earned = data.me.achievements.filter((a) => a.earned).length;

  async function setPref(prefs: { hideName?: boolean; emails?: boolean }) {
    setData((d) => (d ? { ...d, me: { ...d.me, ...prefs } } : d));
    await api(`/api/challenges/${encodeURIComponent(id)}`, { method: "PUT", body: prefs }).catch(() => {});
  }

  return (
    <Shell>
      {data.preview && (
        <p className="mt-3 rounded-2xl border-2 border-dashed border-gold px-3 py-2 text-sm">
          <strong>Author view.</strong> You’re not in this challenge, so this is how it looks with no points yet.
        </p>
      )}

      {/* The hero: name, and where you stand. */}
      <section className="mt-4 overflow-hidden rounded-3xl bg-[#2d4875] p-5 text-white sm:p-6">
        {data.cover && <StoryVisual {...data.cover} alt="" priority className="-mx-5 -mt-5 mb-5 aspect-[16/7] sm:-mx-6 sm:-mt-6" />}
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.16em] text-white/75">Trilogy Challenge</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold leading-tight sm:text-4xl">{data.name}</h1>
        {data.tagline && <p className="mt-1 text-white/85">{data.tagline}</p>}
        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          <Stat label="Points" value={data.me.total.toLocaleString("en-AU")} />
          <Stat label={data.me.rank ? `of ${data.me.of}` : "Rank"} value={data.me.rank ? `#${data.me.rank}` : "—"} />
          <Stat label={data.me.streak === 1 ? "day streak" : "day streak"} value={String(data.me.streak)} />
        </dl>
        <p className="mt-4 text-sm text-white/85">
          {data.state === "upcoming"
            ? `Day 1 opens ${formatWhen(data.missions[0].opensAt, data.timezone)}.`
            : data.state === "finished"
              ? "The challenge has finished. These are the final scores."
              : `Day ${open.length} of ${days} is open.${next ? ` Day ${next.day} opens ${formatWhen(next.opensAt, data.timezone)}.` : " It’s the final mission."}`}
          {data.me.team && ` You’re in ${data.me.team}.`}
        </p>
      </section>

      {/* Today's mission. */}
      {data.state === "live" && today && (
        <section className={cx("mt-4 rounded-3xl border p-5", today.completedAt ? "border-line bg-surface" : "border-action bg-action/5")}>
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">
            {today.day === days ? "The final mission" : `Day ${today.day}`}
          </p>
          <h2 className="mt-1 font-serif text-2xl font-semibold">{today.title}</h2>
          {today.beat && <p className="mt-2 text-ink-muted">{today.beat}</p>}
          {today.completedAt ? (
            <p className="mt-3 font-semibold text-success">
              Done: {today.total} of {today.possible} points{today.perfect ? ", a perfect mission" : ""}.
            </p>
          ) : (
            <Link
              href={`/topics/${today.slug}`}
              className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-action px-6 font-semibold text-on-action hover:bg-action-hover"
            >
              <Icon name="play" className="size-4" /> Play now · about {today.minutes} min
            </Link>
          )}
        </section>
      )}

      {data.story && (
        <details className="mt-4 rounded-3xl border border-line bg-surface p-5" open={data.state === "upcoming" || open.length <= 1}>
          <summary className="cursor-pointer font-serif text-lg font-semibold">The story</summary>
          <p className="mt-2 whitespace-pre-line text-ink-muted">{data.story}</p>
        </details>
      )}

      {/* The days. */}
      <section className="mt-6">
        <h2 className="font-serif text-xl font-semibold">The week</h2>
        <ol className="mt-3 flex flex-col gap-2">
          {data.missions.map((m) => (
            <li key={m.day} className={cx("flex items-center gap-3 rounded-2xl border border-line p-3", m.open ? "bg-surface" : "bg-muted/60")}>
              <span
                className={cx(
                  "grid size-10 shrink-0 place-items-center rounded-full font-mulish text-sm font-extrabold",
                  m.completedAt ? "bg-success text-white" : m.open ? "bg-action text-on-action" : "bg-muted text-ink-muted",
                )}
                aria-hidden
              >
                {m.completedAt ? <Icon name="check" className="size-5" /> : m.open ? m.day : <Icon name="lock" className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {m.day === days && days > 1 ? "Finale" : `Day ${m.day}`}
                  {m.title ? `: ${m.title}` : ""}
                </p>
                <p className="text-sm text-ink-muted">
                  {!m.open
                    ? `Opens ${formatWhen(m.opensAt, data.timezone)}`
                    : m.completedAt
                      ? `${m.total} of ${m.possible} points${m.onTheDay ? " · on the day" : ""}${m.perfect ? " · perfect" : ""}`
                      : `Open · up to ${m.possible} points`}
                </p>
              </div>
              {m.open && (
                <Link href={`/topics/${m.slug}`} className="shrink-0 rounded-full px-3 py-2 text-sm font-semibold text-accent hover:bg-muted">
                  {m.completedAt ? "Replay" : "Play"}
                  <span className="sr-only"> day {m.day}</span>
                </Link>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-ink-muted">Only your first answers score, so replaying a mission is just for practice.</p>
      </section>

      {/* Badges. */}
      <section className="mt-6">
        <h2 className="font-serif text-xl font-semibold">
          Badges{" "}
          <span className="font-sans text-sm font-normal text-ink-muted">
            {earned} of {data.me.achievements.length}
          </span>
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.me.achievements.map((a) => (
            <li key={a.id} className={cx("flex items-start gap-2 rounded-2xl border p-3", a.earned ? "border-gold bg-gold/10" : "border-line opacity-60")}>
              <Icon name={BADGE_ICON[a.id] ?? "star"} className={cx("mt-0.5 size-5 shrink-0", a.earned ? "text-[#b8860b]" : "text-ink-muted")} />
              <span>
                <span className="block font-semibold">{a.label}</span>
                <span className="block text-xs text-ink-muted">{a.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Leaderboards. */}
      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl font-semibold">Leaderboard</h2>
          <div className="flex rounded-full border border-line p-1" role="tablist" aria-label="Leaderboard">
            {(["people", "teams"] as const).map((b) => (
              <button
                key={b}
                type="button"
                role="tab"
                aria-selected={board === b}
                onClick={() => setBoard(b)}
                className={cx("min-h-9 rounded-full px-4 text-sm font-semibold", board === b ? "bg-action text-on-action" : "text-ink-muted")}
              >
                {b === "people" ? "People" : "Teams"}
              </button>
            ))}
          </div>
        </div>
        {board === "people" ? (
          <div className="mt-3">
            {data.leaderboard.top.length ? (
              <ol className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
                {data.leaderboard.top.map((r, i) => (
                  <li key={i} className={cx("flex items-center gap-3 px-4 py-3", r.me && "bg-action/5")}>
                    <span className="w-8 font-mulish font-extrabold text-ink-muted">#{r.rank}</span>
                    <span className="size-3 shrink-0 rounded-full" style={{ background: TEAM_SWATCH[r.colour] }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cx("block truncate", r.me && "font-semibold")}>{r.name}</span>
                      {r.team && <span className="block text-xs text-ink-muted">{r.team}</span>}
                    </span>
                    <span className="font-semibold">{r.points.toLocaleString("en-AU")}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-2xl border border-dashed border-line-strong p-4 text-center text-ink-muted">No points yet. Be the first on the board.</p>
            )}
            {data.leaderboard.me && (
              <p className="mt-2 text-sm text-ink-muted">
                You’re #{data.leaderboard.me.rank} with {data.leaderboard.me.points.toLocaleString("en-AU")} points. Only you can see this.
              </p>
            )}
            <p className="mt-2 text-xs text-ink-muted">The top ten are shown. Everyone else sees only their own place.</p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {data.teams.map((t) => {
              const best = Math.max(1, ...data.teams.map((x) => x.average));
              return (
                <div key={t.id} className={cx("rounded-2xl border bg-surface p-3", t.mine ? "border-action" : "border-line")}>
                  <div className="flex items-center gap-3">
                    <span className="w-8 font-mulish font-extrabold text-ink-muted">#{t.rank}</span>
                    <span className="min-w-0 flex-1 font-semibold">
                      {t.name}
                      {t.mine && <span className="ml-2 text-xs font-normal text-ink-muted">your team</span>}
                    </span>
                    <span className="font-semibold">{t.average.toLocaleString("en-AU")}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${(100 * t.average) / best}%`, background: TEAM_SWATCH[t.colour] }} />
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    Average per member · {t.members} {t.members === 1 ? "member" : "members"}
                    {data.state === "live" ? ` · ${t.finishedToday} done today` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* The story so far: your first call on each decision. */}
      {data.storySoFar.length > 0 && (
        <section className="mt-6">
          <h2 className="font-serif text-xl font-semibold">Your story so far</h2>
          <ol className="mt-3 flex flex-col gap-3">
            {data.storySoFar.map((s) => (
              <li key={s.day} className="rounded-2xl border border-line bg-surface p-4">
                <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Day {s.day}</p>
                <p className="font-semibold">{s.title}</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {s.decisions.map((d, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <Icon name={d.right ? "check" : "refresh"} className={cx("mt-0.5 size-4 shrink-0", d.right ? "text-success" : "text-ink-muted")} />
                      <span>
                        <span className="font-semibold">{/[.?!]$/.test(d.label) ? d.label : `${d.label}.`}</span> Your first call: “{d.choice ?? "not recorded"}
                        ”{d.right ? "" : ". You changed course."}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}

      {!data.preview && (
        <section className="mt-6 flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
          <h2 className="font-serif text-lg font-semibold">Your settings</h2>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              className="size-5 accent-[var(--action)]"
              checked={!data.me.hideName}
              onChange={(e) => setPref({ hideName: !e.target.checked })}
            />
            Show my name on the leaderboard
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" className="size-5 accent-[var(--action)]" checked={data.me.emails} onChange={(e) => setPref({ emails: e.target.checked })} />
            Email me when each day opens, and a reminder if I haven’t finished
          </label>
        </section>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6">
      <Link href="/challenges" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> All challenges
      </Link>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-2 py-3">
      <dd className="font-serif text-2xl font-semibold">{value}</dd>
      <dt className="text-xs text-white/80">{label}</dt>
    </div>
  );
}

/* ---------- The banner on Home and Learning ---------- */

type Mine = {
  id: string;
  name: string;
  tagline: string;
  state: string;
  day: number;
  days: number;
  startsAt: string;
  points: number;
  streak: number;
  todayDone: boolean;
};

export function ChallengeBanner() {
  const { data } = useApi<{ challenges: Mine[] }>("/api/challenges");
  const c = data?.challenges.find((x) => x.state === "live") ?? data?.challenges.find((x) => x.state === "upcoming");
  if (!c) return null;
  return (
    <Link href={`/challenge/${c.id}`} className="mt-6 flex items-center gap-4 rounded-3xl bg-[#2d4875] p-4 text-white hover:opacity-95 sm:p-5">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15">
        <Icon name="flag" className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-white/75">Trilogy Challenge</span>
        <span className="block font-serif text-xl font-semibold leading-tight">{c.name}</span>
        <span className="block text-sm text-white/85">
          {c.state === "upcoming"
            ? `Starts ${new Date(c.startsAt).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}`
            : c.todayDone
              ? `Day ${c.day} done · ${c.points.toLocaleString("en-AU")} points${c.streak ? ` · ${c.streak}-day streak` : ""}`
              : `Day ${c.day} of ${c.days} is open · ${c.points.toLocaleString("en-AU")} points so far`}
        </span>
      </span>
      <Icon name="arrow-right" className="size-5 shrink-0" />
    </Link>
  );
}
