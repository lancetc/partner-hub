import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/server/db";
import { canAuthor, currentUser } from "@/server/auth";
import { now } from "@/server/clock";
import { digitalMember } from "@/server/digitalMembers";
import { DigitalMemberProfile } from "@/components/community/DigitalMemberProfile";
import { LivesStory } from "@/components/community/LivesStory";
import { hasStory } from "@/server/livesInProgress";

export const metadata: Metadata = { title: "Digital Member", robots: { index: false } };

/** One of the fictional people learners meet in training, on a page of their own (cards open the same profile in a modal). */
export default function DigitalMemberPage({ params, searchParams }: PageProps<"/community/digital/[id]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-5xl px-4 py-10 text-ink-muted">Loading…</p>}>
      <Profile params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Profile({ params, searchParams }: Pick<PageProps<"/community/digital/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const { episode, preview } = await searchParams;
  await connection();
  const db = getDb();
  const at = now(db);
  const user = await currentUser(db);
  const m = digitalMember(db, user, id, at);
  if (!m) notFound();
  // An author previewing from Admin → Lives in Progress may open episodes that aren't out (the server checks again).
  const previewing = preview === "1" && canAuthor(user);
  // A Lives in Progress character's page leads with their story (docs/lives-in-progress.md); `?episode=` from an Inbox notice.
  if (hasStory(db, id, at) || previewing)
    return (
      <div className="mx-auto max-w-5xl px-4 pb-12 pt-6 sm:px-6 lg:pt-8">
        <Link
          href="/community#digital"
          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#008282] hover:underline dark:text-[#3cb8b9]"
        >
          <span aria-hidden>←</span> All digital members
        </Link>
        <LivesStory profile={m} initialEpisode={typeof episode === "string" ? episode : null} preview={previewing} />
      </div>
    );
  return (
    <div className="mx-auto max-w-5xl px-4 pb-12 pt-6 sm:px-6 lg:pt-8">
      <Link
        href="/community#digital"
        className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#008282] hover:underline dark:text-[#3cb8b9]"
      >
        <span aria-hidden>←</span> All digital members
      </Link>
      <DigitalMemberProfile m={m} />
    </div>
  );
}
