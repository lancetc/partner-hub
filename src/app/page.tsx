import { stories } from "@/content/stories";
import { NewsGrid } from "@/components/NewsGrid";
import { HomeWorkspace } from "@/components/HomeWorkspace";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { getDb } from "@/server/db";
import { catalogueTopics } from "@/server/catalogue";
import { currentUser } from "@/server/auth";
import { ChallengeBanner } from "@/components/ChallengePage";
import { HomeCommunity } from "@/components/community/HomeCommunity";
import { HomeFavourites } from "@/components/favourites/FavouritesList";
import { HomePinnedTools } from "@/components/pocket/HomePinnedTools";
import { HomeFieldNotes } from "@/components/living/FieldNotes";
import { HomeHero } from "@/components/home/HomeHero";
import { Icon } from "@/components/Icon";
import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/" } };

/** Where a part comes in the top-down build after signing in. */
const step = (n: number) => ({ "--step": n }) as React.CSSProperties;

/*
  The homepage, laid out like a magazine. A cover picture with the greeting as its masthead. Then the
  workspace: what you need to know, what you need to do, and where to get help (Ask Trilogy). Then the
  issue itself: the latest from Trilogy Care as the lead feature, and the Community and challenges after it,
  each under the same kind of section masthead. (Your learning is on Topics and Discovery Paths.)
*/
export default function Home() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
      <HomeHero />

      <div className="mt-6">
        <Suspense fallback={<div className="min-h-[24rem]" aria-hidden />}>
          <Workspace />
        </Suspense>
      </div>

      {/* Field Notes (docs/living-cases.md) and Favourites (docs/job-aids.md): shown only when there's something in them. */}
      <div data-build-step style={step(5)}>
        <HomeFieldNotes />
        {/* Pinned tools (docs/pocket-playbook.md): the person's own pins, only when there's one. */}
        <HomePinnedTools />
        <HomeFavourites />
      </div>

      <section aria-labelledby="latest" data-build-step style={step(6)} className="mt-16">
        <Masthead id="latest" kicker="In this issue" title="The latest from Trilogy Care" />
        <Suspense>
          <Stories />
        </Suspense>
      </section>

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
    </div>
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

/** Read per request: stories can be edited and published in admin at any time. */
async function Stories() {
  await connection();
  getDb();
  const ordered = [...stories].sort((a, b) => b.date.localeCompare(a.date));
  return <NewsGrid stories={ordered} />;
}
