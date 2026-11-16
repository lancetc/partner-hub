import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { LessonPlayer } from "@/components/player/LessonPlayer";
import { getDb } from "@/server/db";
import { currentUser } from "@/server/auth";
import { mySampleLesson } from "@/server/sampleTopics";

/* A sample topic made for the signed-in person in onboarding. Only they can open it. */

export const metadata: Metadata = { title: "Your sample topic", robots: { index: false, follow: false } };

export default function SampleTopicPage({ params }: PageProps<"/topics/mine/[slug]">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 bg-strong" aria-busy="true" />}>
      <Player params={params} />
    </Suspense>
  );
}

async function Player({ params }: Pick<PageProps<"/topics/mine/[slug]">, "params">) {
  await connection();
  const { slug } = await params;
  const db = getDb();
  const lesson = mySampleLesson(db, await currentUser(db), slug);
  if (!lesson) notFound();
  return <LessonPlayer lesson={lesson} personal backTo={{ href: "/paths", label: "Back to My Training" }} />;
}
