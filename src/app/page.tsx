import { stories } from "@/content/stories";
import { NewsGrid } from "@/components/NewsGrid";
import { HomeLearning } from "@/components/HomeLearning";
import { HomeWorkspace } from "@/components/HomeWorkspace";
import { Suspense } from "react";
import { connection } from "next/server";
import { getDb } from "@/server/db";
import { catalogueTopics } from "@/server/catalogue";
import { ChallengeBanner } from "@/components/ChallengePage";
import { HomeCommunity } from "@/components/community/HomeCommunity";
import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/" } };

/** Where a part comes in the top-down build after signing in. */
const step = (n: number) => ({ "--step": n }) as React.CSSProperties;

/*
  The homepage in two levels. At the top, a workspace: what you need to know, what you need to do,
  and where to get help (Ask Trilogy). Below it, discovery: your learning, the Community, challenges
  and the news, for when there's time to browse.
*/
export default function Home() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
      <Suspense fallback={<div className="min-h-[24rem]" aria-hidden />}>
        <Workspace />
      </Suspense>

      <section aria-labelledby="discover" className="mt-12 border-t border-line pt-8">
        <h2 id="discover" data-build-step style={step(6)} className="font-serif text-3xl font-semibold tracking-tight">
          Explore the Hub
        </h2>
        <p data-build-step style={step(6)} className="mt-1 max-w-2xl text-lg text-ink-muted">
          Learning, the Community, challenges and news, for when you have a few minutes.
        </p>
        <div data-build-step style={step(6)} className="max-w-3xl empty:hidden">
          <ChallengeBanner />
        </div>
        <Suspense fallback={<div className="mt-6 min-h-20" aria-hidden />}>
          <Learning />
        </Suspense>
        <HomeCommunity />
        <div data-build-step style={step(7)} className="mt-10">
          <h2 className="font-serif text-2xl font-semibold">The latest at Trilogy</h2>
          <Suspense>
            <Stories />
          </Suspense>
        </div>
      </section>
    </div>
  );
}

/** The workspace at the top: personal, so read per request. */
async function Workspace() {
  await connection();
  return <HomeWorkspace topics={catalogueTopics(getDb())} />;
}

/** Read per request: stories can be edited and published in admin at any time. */
async function Stories() {
  await connection();
  getDb();
  const ordered = [...stories].sort((a, b) => b.date.localeCompare(a.date));
  return <NewsGrid stories={ordered} />;
}

/** Where the person is in their learning. */
async function Learning() {
  await connection();
  return <HomeLearning topics={catalogueTopics(getDb())} />;
}
