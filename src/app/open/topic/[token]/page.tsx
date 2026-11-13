import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { LessonPlayer } from "@/components/player/LessonPlayer";
import { LinkOff } from "@/components/OpenPath";
import { getDb } from "@/server/db";
import { publicTopicLesson } from "@/server/publicTopics";

export const metadata: Metadata = { title: "Topic", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** A single topic opened from its QR code: no sign-in, nothing saved about the person, only an anonymous count. */
export default function OpenSingleTopicPage({ params }: PageProps<"/open/topic/[token]">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 bg-strong" aria-busy="true" />}>
      <Player params={params} />
    </Suspense>
  );
}

async function Player({ params }: Pick<PageProps<"/open/topic/[token]">, "params">) {
  const { token } = await params;
  await connection();
  const lesson = publicTopicLesson(getDb(), token);
  if (!lesson) return <LinkOff />;
  return (
    <LessonPlayer
      lesson={lesson}
      publicLink={{ token, topics: [lesson.slug], titles: { [lesson.slug]: lesson.title } }}
      backTo={{ href: `/open/topic/${token}`, label: "Back to the start of the topic" }}
    />
  );
}
