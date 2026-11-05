import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { lessonBySlug, lessons } from "@/content/lessons";
import { LessonPlayer } from "@/components/player/LessonPlayer";
import { getDb } from "@/server/db";
import { canAuthor, currentUser } from "@/server/auth";
import { editorLesson } from "@/server/authoredLessons";
import { canSkipHolds, nextTopicAfter } from "@/server/learningPaths";
import { factValues } from "@/server/facts";
import { applyFacts } from "@/lib/facts";
import { readProgress } from "@/server/progress";
import { importantChangesSince } from "@/server/lessonVersions";
import { ChangesNotice } from "@/components/player/ChangesNotice";
import { lessonIn } from "@/server/lessonTranslations";
import { now } from "@/server/clock";
import { isLanguage } from "@/lib/languages";
import { TranslationNotice, TranslationWatch } from "@/components/player/TranslationNotice";
import { EmbeddedPreview } from "@/components/player/EmbeddedPreview";
import { topicMetadata } from "@/server/seo";
import { challengeForMission, missionLock, missionSlugs } from "@/server/challenges";
import { refreshDue } from "@/server/complianceRegister";
import Link from "next/link";

export function generateStaticParams() {
  return lessons.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: PageProps<"/learning/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  // A challenge mission doesn't give itself away before it opens, and isn't indexed.
  if (missionSlugs(getDb()).has(slug)) return { title: "Trilogy Challenge mission", robots: { index: false } };
  return topicMetadata(slug);
}

export default function LessonPage({ params, searchParams }: PageProps<"/learning/[slug]">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 bg-strong" aria-busy="true" />}>
      <Lesson params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Lesson({ params, searchParams }: Pick<PageProps<"/learning/[slug]">, "params" | "searchParams">) {
  const { slug } = await params;
  const query = await searchParams;
  // Lessons can be published from the editor at any time, so read the current version.
  await connection();
  const db = getDb();
  const user = await currentUser(db);
  // ?preview=1 lets an author play their latest saved draft. Nothing is recorded.
  const facts = factValues(db);
  if (query.preview === "1" && canAuthor(user)) {
    const draft = editorLesson(db, slug);
    if (draft) {
      // &card=<id> opens on that card; &embed=1 is the editor's preview window; &path=<id> came from a path preview.
      const path = typeof query.path === "string" && /^[\w-]+$/.test(query.path) ? query.path : undefined;
      const shown = (
        <LessonPlayer
          lesson={applyFacts(draft.lesson, facts)}
          preview
          startAt={typeof query.card === "string" ? query.card : undefined}
          backTo={path ? { href: `/paths/${path}?preview=1`, label: "Back to the path" } : undefined}
        />
      );
      return query.embed === "1" ? <EmbeddedPreview>{shown}</EmbeddedPreview> : shown;
    }
  }
  const live = lessonBySlug(slug);
  if (!live) notFound();
  // A challenge mission opens on its day, for everyone at once.
  const lock = missionLock(db, user, slug, now(db));
  if (lock) return <MissionLocked lock={lock} />;
  const challengeId = challengeForMission(db, user, slug);
  // Shared facts ({{example_rate}} and so on) show their current values.
  const lesson = applyFacts(live, facts);
  // Important changes since the version this person last did, from their progress on the server.
  const theirs = readProgress(db, user)[slug]?.attempt as { version?: string } | undefined;
  const changes = theirs?.version && theirs.version !== lesson.version ? importantChangesSince(db, slug, theirs.version) : [];
  const changed = changes.length ? <ChangesNotice changes={changes} /> : null;
  // ?instance=<id> plays the lesson as a step in a learning sequence.
  const instance = query.instance;
  const player = (shown: typeof lesson, notice?: React.ReactNode) => (
    <LessonPlayer
      lesson={shown}
      // ?card=<id> opens a bookmarked card (as a review).
      startAt={typeof query.card === "string" ? query.card : undefined}
      instanceId={typeof instance === "string" && /^\d+$/.test(instance) ? instance : undefined}
      backTo={challengeId ? { href: `/challenge/${challengeId}`, label: "Back to the challenge" } : undefined}
      skipHolds={canSkipHolds(db, user.id, lesson.slug)}
      // On finishing, the next topic in their learning path (not for a challenge mission or a follow-up step).
      nextTopic={challengeId || typeof instance === "string" ? null : nextTopicAfter(db, user, lesson.slug)}
      refresh={refreshDue(db, user, lesson.slug, now(db))}
      notice={
        notice || changed ? (
          <div className="flex flex-col gap-2">
            {changed}
            {notice}
          </div>
        ) : undefined
      }
    />
  );

  // Someone reading in another language gets the lesson translated (or English while it's on its way).
  const lang = user.language;
  if (!lang || lang === "en" || !isLanguage(lang)) return player(lesson);
  if (query.original === "1") return player(lesson, <TranslationNotice lang={lang} state="original" />);
  const t = lessonIn(db, lesson, lang, now(db));
  const ready = t.state === "ready";
  // The same shape either way, so a translation arriving mid-lesson carries on from the same card.
  return (
    // Once translated, Google's page translator is kept off the lesson.
    <div translate={ready ? "no" : undefined} lang={ready ? lang : undefined}>
      {player(ready ? t.lesson : lesson, <TranslationNotice lang={lang} state={t.state} />)}
      <TranslationWatch slug={lesson.slug} lang={lang} state={t.state} />
    </div>
  );
}

/** A challenge mission that hasn't opened yet. */
function MissionLocked({ lock }: { lock: NonNullable<ReturnType<typeof missionLock>> }) {
  const when = lock.opensAt
    ? new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: lock.timezone }).format(
        new Date(lock.opensAt),
      )
    : null;
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{lock.challenge}</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold">Day {lock.day} isn’t open yet</h1>
      <p className="mt-3 text-lg text-ink-muted">{when ? `This mission opens ${when}.` : "This challenge hasn’t started yet."}</p>
      <Link href={`/challenge/${lock.challengeId}`} className="mt-6 inline-flex min-h-11 items-center rounded-full bg-action px-5 font-semibold text-on-action">
        Go to the challenge
      </Link>
    </div>
  );
}
