import { stories } from "@/content/stories";
import { NewsGrid } from "@/components/NewsGrid";
import { HomeWorkspace } from "@/components/HomeWorkspace";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { getDb } from "@/server/db";
import { catalogueTopics } from "@/server/catalogue";
import { canAuthor, currentUser, meantFor, type User } from "@/server/auth";
import { homeParts, moreFor, type HomePart } from "@/lib/homeLayout";
import { ChallengeBanner } from "@/components/ChallengePage";
import { HomeCommunity } from "@/components/community/HomeCommunity";
import { HomeFavourites } from "@/components/favourites/FavouritesList";
import { HomeLifeMoments } from "@/components/community/LifeMoments";
import { HomeCheckIn } from "@/components/community/CheckIn";
import { HomePinnedTools } from "@/components/pocket/HomePinnedTools";
import { HomeFieldNotes } from "@/components/living/FieldNotes";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeCourse } from "@/components/onboarding/HomeCourse";
import { Icon } from "@/components/Icon";
import { ActivityShowcase } from "@/components/home/ActivityShowcase";
import { homeShowcase } from "@/server/activityCatalogue";
import { now } from "@/server/clock";
import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/" } };

/** Where a part comes in the top-down build after signing in. */
const step = (n: number) => ({ "--step": n }) as React.CSSProperties;

/*
  The homepage, laid out like a magazine. A cover picture with the greeting as its masthead. Then the
  workspace: what you need to know, what you need to do, and where to get help (Ask Trilogy). Then the
  issue itself: the latest from Trilogy Care as the lead feature, and the Community and challenges after it,
  each under the same kind of section masthead. (Your learning is on Topics and Discovery Paths.)
  Each role gets the parts it uses most (lib/homeLayout); the rest are listed under "More on the Hub" at the end.
*/
export default function Home() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
      <HomeHero />

      <div className="mt-6">
        {/* A starting course (docs/onboarding.md, "Starting courses"): one action, next steps and help. Nothing when there's none. */}
        <HomeCourse />
        <Suspense fallback={<div className="min-h-[24rem]" aria-hidden />}>
          <Workspace />
        </Suspense>
      </div>

      {/*
        The Activity Catalogue's showcase (docs/activity-catalogue-audit.md), under the welcome and what's assigned: up to
        four featured activities this person can open, and one tool for work. Gone entirely when none qualifies.
      */}
      <Suspense>
        <Only part="practise">
          <Showcase />
        </Only>
      </Suspense>

      {/* Field Notes (docs/living-cases.md) and Favourites (docs/job-aids.md): shown only when there's something in them. */}
      <div data-build-step style={step(5)}>
        <HomeFieldNotes />
        {/* Pinned tools (docs/pocket-playbook.md): the person's own pins, only when there's one. */}
        <HomePinnedTools />
        {/*
          People I follow (Check in, docs/lives-in-progress.md) on the left and Your Favourites on the right, side by side at
          half each on wide screens and the same height; stacked, People I follow first, on narrow ones. A column is made for
          each one shown, so when the learner follows nobody (Check in shows nothing), Favourites takes the full width.
        */}
        <div className="mt-10 grid gap-6 empty:hidden lg:auto-cols-fr lg:grid-flow-col [&>section]:mt-0">
          <Suspense>
            <Only part="following">
              <HomeCheckIn />
            </Only>
          </Suspense>
          <Suspense>
            <Only part="favourites">
              <HomeFavourites />
            </Only>
          </Suspense>
        </div>
        {/* "Meanwhile, in their lives…" (docs/lives-in-progress.md): Life Moments, under Favourites at the owner's request. */}
        <Suspense>
          <Only part="lives">
            <HomeLifeMoments />
          </Only>
        </Suspense>
      </div>

      <Suspense>
        <Only part="news">
          <section aria-labelledby="latest" data-build-step style={step(6)} className="mt-16">
            <Masthead id="latest" kicker="In this issue" title="The latest from Trilogy Care" />
            <Suspense>
              <Stories />
            </Suspense>
          </section>
        </Only>
      </Suspense>

      <Suspense>
        <Only part="community">
          <section aria-labelledby="together" className="mt-16">
            <div data-build-step style={step(7)}>
              <Masthead id="together" kicker="Together" title="Community and challenges" href="/community" link="Go to the Community" />
              <p className="mt-3 max-w-2xl text-lg text-ink-muted">Questions, wins and a bit of friendly competition, for when you have a few minutes.</p>
            </div>
            <div data-build-step style={step(7)} className="max-w-3xl empty:hidden">
              <ChallengeBanner />
            </div>
            <HomeCommunity />
          </section>
        </Only>
      </Suspense>

      <Suspense>
        <MoreOnTheHub />
      </Suspense>
    </div>
  );
}

const viewer = (u: User) => ({ role: u.role, audience: u.audience, canAuthor: canAuthor(u) });

/** A part of the homepage, only for the roles that get it (lib/homeLayout). Personal, so read per request. */
async function Only({ part, children }: { part: HomePart; children: React.ReactNode }) {
  await connection();
  const user = await currentUser(getDb());
  return homeParts(viewer(user)).includes(part) ? <>{children}</> : null;
}

/** What this person's homepage leaves out, a click away: one quiet row at the end. Nothing for those who get everything. */
async function MoreOnTheHub() {
  await connection();
  const more = moreFor(viewer(await currentUser(getDb())));
  if (!more.length) return null;
  return (
    <section aria-labelledby="more-hub" className="mt-16">
      <Masthead id="more-hub" kicker="When you have a minute" title="More on the Hub" />
      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {more.map((m) => (
          <li key={m.part}>
            <Link
              href={m.href}
              className="group flex min-h-16 items-center gap-3 rounded-3xl border border-line bg-surface px-5 py-4 hover:border-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-lg font-semibold group-hover:underline">{m.label}</span>
                <span className="block text-sm text-ink-muted">{m.text}</span>
              </span>
              <Icon name="arrow-right" className="size-4 shrink-0 text-accent" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A section's masthead, as in a magazine: a small kicker, a serif title, a strong rule, and where to see more. */
function Masthead({ id, kicker, title, href, link }: { id: string; kicker: string; title: string; href?: string; link?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b-2 border-ink pb-3">
      <div className="min-w-0">
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.18em] text-accent">{kicker}</p>
        <h2 id={id} className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h2>
      </div>
      {href && link && (
        <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
          {link} <Icon name="arrow-right" className="size-4" />
        </Link>
      )}
    </div>
  );
}

/** The workspace: personal, so read per request. */
async function Workspace() {
  await connection();
  const db = getDb();
  return <HomeWorkspace topics={catalogueTopics(db, (await currentUser(db)).id)} />;
}

/** Personal: who may open which course decides the cards, so read per request. */
async function Showcase() {
  await connection();
  const db = getDb();
  const user = await currentUser(db);
  const { featured, cards, work } = homeShowcase(db, user, now(db));
  if (!featured && !cards.length && !work) return null;
  return (
    <section aria-labelledby="practise" data-build-step style={step(5)} className="mt-14">
      <Masthead
        id="practise"
        kicker="Learn by doing"
        title="Practise the decisions you make every day"
        href="/activities"
        link="Explore all interactive activities"
      />
      <p className="mt-3 max-w-2xl text-lg text-ink-muted">
        Try an interactive scenario, test a business decision, or save a tool for the next time you need it.
      </p>
      <ActivityShowcase featured={featured} cards={cards} work={work} />
    </section>
  );
}

/** Read per request: stories can be edited and published in admin at any time. Only the stories meant for this person (auth.meantFor). */
async function Stories() {
  await connection();
  const user = await currentUser(getDb());
  const ordered = stories.filter((s) => meantFor(user, s.audience)).sort((a, b) => b.date.localeCompare(a.date));
  return <NewsGrid stories={ordered} />;
}
