import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { LinkOff, OpenPath } from "@/components/OpenPath";
import { getDb } from "@/server/db";
import { publicPath, publicPathId } from "@/server/publicPaths";

// Open to anyone with the link, but not something to list in search engines.
export const metadata: Metadata = { title: "Learning path", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** A learning path opened from its public link or QR code: no sign in, nothing recorded about the person. */
export default function OpenPathPage({ params }: PageProps<"/open/[token]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Page params={params} />
    </Suspense>
  );
}

async function Page({ params }: Pick<PageProps<"/open/[token]">, "params">) {
  const { token } = await params;
  await connection();
  const db = getDb();
  if (!publicPathId(db, token)) return <LinkOff />;
  return <OpenPath path={publicPath(db, token)} />;
}
