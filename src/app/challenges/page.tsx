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

export const metadata: Metadata = { title: "Challenges", robots: { index: false } };

export default function ChallengesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:pt-10">
      <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Challenges</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">
        A short story told over a few days. A new mission opens each morning: make the calls, earn points, keep your streak and help your team.
      </p>
      <Suspense>
        <Challenges />
      </Suspense>
    </div>
  );
}

type Mine = ReturnType<typeof myChallenges>[number];

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
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
    <li className="group relative flex flex-col gap-4 overflow-hidden rounded-3xl bg-[#2d4875] p-5 text-white sm:p-6">
      {c.cover && <StoryVisual {...c.cover} alt="" className="-mx-5 -mt-5 aspect-[16/7] sm:-mx-6 sm:-mt-6" />}
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
          <h2 className="mt-1 font-serif text-2xl font-semibold leading-tight">
            <Link href={`/challenge/${c.id}`} className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4">
              {c.name}
            </Link>
          </h2>
          {c.tagline && <p className="mt-1 text-white/85">{c.tagline}</p>}
        </div>
      </div>
      {c.state !== "upcoming" && (
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
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
