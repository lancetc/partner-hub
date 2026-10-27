import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { PathPage } from "@/components/PathPage";
import { getDb } from "@/server/db";
import { canAuthor, currentUser } from "@/server/auth";

export const metadata: Metadata = { title: "Learning path" };

/** Where a learning path's QR code leads. */
export default function LearningPathPage({ params, searchParams }: PageProps<"/paths/[id]">) {
  return (
    <Suspense>
      <Page params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Page({ params, searchParams }: Pick<PageProps<"/paths/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  // ?preview=1 lets an author open every lesson, drafts included. Nothing is recorded.
  const { preview } = await searchParams;
  await connection();
  const author = preview === "1" && canAuthor(await currentUser(getDb()));
  return <PathPage id={id} preview={author} />;
}
