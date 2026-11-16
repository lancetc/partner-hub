import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/server/db";
import { canAuthor, currentUser } from "@/server/auth";
import { myChallenges } from "@/server/challenges";
import { Icon } from "@/components/Icon";
import { StoryVisual } from "@/components/StoryVisual";
import { cx } from "@/lib/format";
import { HeroStats, PageHero } from "@/components/PageHero";

export const metadata: Metadata = { title: "Challenges", robots: { index: false } };

export default function ChallengesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
      <PageHero
        eyebrow="Trilogy Challenge"
        title="Challenges"
        aside={
          <Suspense>
            <ChallengeStats />
          </Suspense>
        }
      >
        A five-day team competition where Care Coordinators tackle real-world client scenarios, make decisions and put their knowledge to the test. Each day
        unlocks a new challenge, with points, streaks and leaderboards encouraging teams to collaborate, solve problems and compete for the top spot.
      </PageHero>

      {/* A game to play on your own any time, alongside the team challenges. */}
      <Link
        href="/challenges/coordinators-day"
        className="group mt-8 flex flex-col gap-4 overflow-hidden rounded-3xl bg-[#1d2b4f] p-5 text-white ring-1 ring-black/5 transition hover:shadow-lg sm:flex-row sm:items-center sm:p-6"
      >
        <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[#fab53d] text-[#102a43]">
          <Icon name="route" className="size-8" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#fab53d]">New · solo board game · about 15 minutes</span>
          <span className="mt-1 block font-serif text-2xl font-semibold group-hover:underline">The Coordinator’s Day</span>
          <span className="mt-1 block text-white/85">
            Follow a care coordinator from the first call to handover. Good decisions move you forward, setbacks send you back, and opportunities handled well let you
            climb. Three levels, from new to experienced.
          </span>
        </span>
        <span className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-full bg-white px-5 font-semibold text-[#102a43] sm:self-center">
          Play <Icon name="arrow-right" className="size-4" />
        </span>
      </Link>

      <Suspense>
        <Challenges />
      </Suspense>
    </div>
  );
}

type Mine = ReturnType<typeof myChallenges>[number];

/** The person's challenges at a glance, for the banner. */
async function ChallengeStats() {
  await connection();
  const db = getDb();
  const list = myChallenges(db, await currentUser(db), new Date());
  const live = list.filter((c) => c.state === "live").length;
  return (
    <HeroStats
      stats={[
        { label: "challenges", value: list.length },
        // The green dot only while one is actually on.
        { label: "on now", value: live, dot: live > 0 },
        { label: "your points", value: list.reduce((n, c) => n + c.points, 0) },
      ]}
    />
  );
}

/** Read per request: what's open depends on the time, and points on the person. */
async function Challenges() {
  await connection();
  const db = getDb();
  const user = await currentUser(db);
  const list = myChallenges(db, user, new Date());
  const order = { live: 0, upcoming: 1, finished: 2 } as const;
  list.sort((a, b) => order[a.state as keyof typeof order] - order[b.state as keyof typeof order]);
  return (
    <>
      {list.length ? (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((c) => (
            <ChallengeTile key={c.id} c={c} />
          ))}
        </ul>
      ) : (
        <p className="mt-10 max-w-2xl rounded-3xl border border-line p-6 text-ink-muted">
          You’re not in a challenge right now. When one starts for your team, it will appear here and on your Learning page.
        </p>
      )}
      {canAuthor(user) && (
        <p className="mt-6 text-sm text-ink-muted">
          <Link href="/admin/challenges" className="font-semibold text-accent hover:underline">
            Manage challenges
          </Link>{" "}
          to make a new one or see how people are going.
        </p>
      )}
    </>
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

function ChallengeTile({ c }: { c: Mine }) {
  const status =
    c.state === "upcoming"
      ? `Starts ${day(c.startsAt)}`
      : c.state === "finished"
        ? "Finished"
        : c.todayDone
          ? `Day ${c.day} of ${c.days} done`
          : `Day ${c.day} of ${c.days} is open`;
  const cta =
    c.state === "upcoming" ? "See what’s coming" : c.state === "finished" ? "See the results" : c.todayDone ? "See the leaderboard" : "Play today’s mission";
  return (
    <li className="group relative flex flex-col gap-4 overflow-hidden rounded-3xl bg-[#2d4875] p-5 text-white">
      {c.cover && <StoryVisual {...c.cover} alt="" className="-mx-5 -mt-5 aspect-[16/9]" />}
      <div className="flex items-start gap-4">
        {/* The flag only when there's no picture: in a narrow column it crowds the name. */}
        {!c.cover && (
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15">
            <Icon name="flag" className="size-6" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-white/75">
            Trilogy Challenge · <span className={cx(c.state === "live" && !c.todayDone && "text-[#ffd27a]")}>{status}</span>
          </p>
          <h2 className="mt-1 font-serif text-xl font-semibold leading-tight">
            <Link href={`/challenge/${c.id}`} className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4">
              {c.name}
            </Link>
          </h2>
          {c.tagline && <p className="mt-1 text-white/85">{c.tagline}</p>}
        </div>
      </div>
      {c.state !== "upcoming" && (
        <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <div>
            <dt className="text-white/70">Points</dt>
            <dd className="font-mulish text-xl font-extrabold">{c.points.toLocaleString("en-AU")}</dd>
          </div>
          <div>
            <dt className="text-white/70">Streak</dt>
            <dd className="font-mulish text-xl font-extrabold">
              {c.streak} {c.streak === 1 ? "day" : "days"}
            </dd>
          </div>
          <div>
            <dt className="text-white/70">Missions</dt>
            <dd className="font-mulish text-xl font-extrabold">{c.days}</dd>
          </div>
        </dl>
      )}
      <span className="mt-auto inline-flex items-center gap-1 font-semibold">
        {cta} <Icon name="arrow-right" className="size-4" />
      </span>
    </li>
  );
}
