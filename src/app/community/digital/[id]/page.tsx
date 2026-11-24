import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/server/db";
import { currentUser } from "@/server/auth";
import { now } from "@/server/clock";
import { digitalMember } from "@/server/digitalMembers";
import { DigitalMemberProfile } from "@/components/community/DigitalMemberProfile";

export const metadata: Metadata = { title: "Digital Member", robots: { index: false } };

/** One of the fictional people learners meet in training, on a page of their own (cards open the same profile in a modal). */
export default function DigitalMemberPage({ params }: PageProps<"/community/digital/[id]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-5xl px-4 py-10 text-ink-muted">Loading…</p>}>
      <Profile params={params} />
    </Suspense>
  );
}

async function Profile({ params }: Pick<PageProps<"/community/digital/[id]">, "params">) {
  const { id } = await params;
  await connection();
  const db = getDb();
  const m = digitalMember(db, await currentUser(db), id, now(db));
  if (!m) notFound();
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
