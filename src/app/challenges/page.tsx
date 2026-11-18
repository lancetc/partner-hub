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
      {/* Challenges live under Resources (there's no menu item of their own), so the way back is here. */}
      <Link href="/resources" className="mb-2 inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> Resources
      </Link>
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
      {list.length > 0 && (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((c) => (
            <ChallengeTile key={c.id} c={c} />
          ))}
        </ul>
      )}
      {!list.length && (
        <p className="mt-10 max-w-2xl rounded-3xl border border-line p-6 text-ink-muted">
          You’re not in a team challenge right now. When one starts for your team, it will appear here and on your Learning page.
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
