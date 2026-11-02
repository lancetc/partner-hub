import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { ReviewJoin } from "@/components/ReviewJoin";
import { Icon } from "@/components/Icon";
import { getDb } from "@/server/db";
import { currentUser } from "@/server/auth";
import { linkPath, pathReview } from "@/server/pathReviews";
import { currentReviewer } from "@/server/reviewSession";

// A private link: keep it out of search engines and away from other sites.
export const metadata: Metadata = { title: "Learning path review", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function PathReviewPage({ params }: PageProps<"/review/path/[token]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Review params={params} />
    </Suspense>
  );
}

/* A learning path opened from its review link: who you are, then its topics, each opening with Comments on every card. */
async function Review({ params }: Pick<PageProps<"/review/path/[token]">, "params">) {
  const { token } = await params;
  await connection();
  const db = getDb();
  if (!linkPath(db, token)) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-serif text-3xl font-semibold">This review link isn’t active</h1>
        <p className="mt-3 text-ink-muted">The author may have switched it off. Ask the person who sent it to you for a new link.</p>
      </main>
    );
  }
  const path = pathReview(db, token);
  const who = await currentReviewer(db, await currentUser(db));
  if (!who) return <ReviewJoin token={token} title={path.name} path />;
  const name = who.kind === "reviewer" ? who.name : who.user.name;
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Learning path review</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold leading-tight">{path.name}</h1>
      {path.description && <p className="mt-3 text-lg text-ink-muted">{path.description}</p>}
      <div className="mt-6 rounded-2xl bg-tealtint p-4">
        <p className="font-semibold">Reviewing as {name}</p>
        <p className="mt-1 text-sm">
          Open each topic and work through it. Use <strong>Comments</strong> on any card to say what’s unclear, wrong or missing. Nothing you answer is
          recorded, and you can come back to this page at any time.
        </p>
      </div>
      <ol className="mt-8 flex flex-col gap-3">
        {path.topics.map((t, i) => (
          <li key={t.slug} className="relative flex items-start gap-4 rounded-2xl border border-line bg-surface p-4 hover:border-line-strong">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted font-mulish text-sm font-bold">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-xl font-semibold leading-snug">
                {t.href ? (
                  <Link href={t.href} className="after:absolute after:inset-0 after:content-[''] hover:underline">
                    {t.title}
                  </Link>
                ) : (
                  t.title
                )}
              </h2>
              {t.summary && <p className="mt-1 text-sm text-ink-muted">{t.summary}</p>}
              <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-ink-muted">
                <span>{t.minutes} min</span>
                {t.comments > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="chat" className="size-4" /> {t.comments} {t.comments === 1 ? "comment" : "comments"}
                  </span>
                )}
                {!t.href && <span>Not open for review yet</span>}
              </p>
            </div>
            {t.href && <Icon name="arrow-right" className="mt-2 size-5 shrink-0 text-accent" />}
          </li>
        ))}
      </ol>
    </main>
  );
}
