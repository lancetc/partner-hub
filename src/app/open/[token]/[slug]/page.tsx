import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { LessonPlayer } from "@/components/player/LessonPlayer";
import { LinkOff } from "@/components/OpenPath";
import { getDb } from "@/server/db";
import { publicPath, publicTopic } from "@/server/publicPaths";

export const metadata: Metadata = { title: "Topic", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** One topic of a public learning path. Nothing is saved to the hub; finishing it adds to an anonymous count. */
export default function OpenTopicPage({ params }: PageProps<"/open/[token]/[slug]">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 bg-strong" aria-busy="true" />}>
      <Player params={params} />
    </Suspense>
  );
}

async function Player({ params }: Pick<PageProps<"/open/[token]/[slug]">, "params">) {
  const { token, slug } = await params;
  await connection();
  const db = getDb();
  const lesson = publicTopic(db, token, slug);
  if (!lesson) return <LinkOff />;
  const topics = publicPath(db, token).topics.map((t) => t.slug);
  return <LessonPlayer lesson={lesson} publicLink={{ token, topics }} backTo={{ href: `/open/${token}`, label: "Back to the learning path" }} />;
}
