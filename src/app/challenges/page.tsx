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
      {/* The solo game first (it's always open), then the team challenges. */}
      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <GameTile />
        {list.map((c) => (
          <ChallengeTile key={c.id} c={c} />
        ))}
      </ul>
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

/** The Coordinator's Day: a solo board game, shown like a challenge but open to play any time. */
function GameTile() {
  return (
    <li className="group relative flex flex-col gap-4 overflow-hidden rounded-3xl bg-[#2d4875] p-5 text-white">
      <GameCover />
      <div className="min-w-0">
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-white/75">
          Solo board game · <span className="text-[#ffd27a]">Play any time</span>
        </p>
        <h2 className="mt-1 font-serif text-xl font-semibold leading-tight">
          <Link href="/challenges/coordinators-day" className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4">
            The Coordinator’s Day
          </Link>
        </h2>
        <p className="mt-1 text-white/85">From the first call to handover: decide, replan when things change, and climb when you handle an opening well.</p>
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <div>
          <dt className="text-white/70">Levels</dt>
          <dd className="font-mulish text-xl font-extrabold">3</dd>
        </div>
        <div>
          <dt className="text-white/70">Squares</dt>
          <dd className="font-mulish text-xl font-extrabold">10–16</dd>
        </div>
        <div>
          <dt className="text-white/70">Minutes</dt>
          <dd className="font-mulish text-xl font-extrabold">15</dd>
        </div>
      </dl>
      <span className="mt-auto inline-flex items-center gap-1 font-semibold">
        Play the day <Icon name="arrow-right" className="size-4" />
      </span>
    </li>
  );
}

/** A little board for the game's card: squares in a winding path, a ladder, a slide and the token. */
function GameCover() {
  const cell = (i: number) => {
    const row = Math.floor(i / 5);
    const col = row % 2 === 0 ? i % 5 : 4 - (i % 5);
    return { x: 14 + col * 62, y: 118 - row * 52 };
  };
  const tone = (i: number) => (i === 9 ? "#fde9c4" : i === 3 || i === 6 ? "#dff3ea" : i === 4 ? "#fbe3e1" : "#ffffff");
  const c = (i: number) => ({ x: cell(i).x + 26, y: cell(i).y + 21 });
  return (
    <svg aria-hidden viewBox="0 0 338 176" className="-mx-5 -mt-5 block aspect-[16/9] w-[calc(100%+2.5rem)] max-w-none bg-[#1d2b4f]">
      <rect width="338" height="176" fill="#1d2b4f" />
      <circle cx="300" cy="20" r="60" fill="#3cb8b9" opacity="0.25" />
      <circle cx="30" cy="170" r="40" fill="#fab53d" opacity="0.2" />
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={cell(i).x} y={cell(i).y} width="52" height="42" rx="9" fill={tone(i)} opacity="0.95" />
      ))}
      {/* Ladder from square 4 to 7. */}
      <g stroke="#2a9d8f" strokeWidth="3.5" strokeLinecap="round">
        <line x1={c(3).x - 6} y1={c(3).y} x2={c(6).x - 6} y2={c(6).y} />
        <line x1={c(3).x + 6} y1={c(3).y} x2={c(6).x + 6} y2={c(6).y} />
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1={c(3).x - 6 + (c(6).x - c(3).x) * t} y1={c(3).y + (c(6).y - c(3).y) * t} x2={c(3).x + 6 + (c(6).x - c(3).x) * t} y2={c(3).y + (c(6).y - c(3).y) * t} strokeWidth="2.5" />
        ))}
      </g>
      {/* Slide from square 5 back to 3. */}
      <path d={`M${c(4).x} ${c(4).y} Q${(c(4).x + c(2).x) / 2} ${c(4).y + 34} ${c(2).x} ${c(2).y}`} fill="none" stroke="#c7393e" strokeWidth="6" strokeLinecap="round" opacity="0.85" />
      <circle cx={c(1).x + 12} cy={c(1).y + 8} r="11" fill="#008282" stroke="#fff" strokeWidth="3" />
    </svg>
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
