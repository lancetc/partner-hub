import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { getDb } from "@/server/db";
import { currentUser, HttpError } from "@/server/auth";
import { certificateFor, learnerPath } from "@/server/learningPaths";
import { Certificate } from "@/components/Certificate";
import { Icon } from "@/components/Icon";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Certificate", robots: { index: false, follow: false } };

/** A certificate for a finished learning path, to print or save as a PDF. */
export default function CertificatePage({ params, searchParams }: PageProps<"/paths/[id]/certificate">) {
  return (
    <Suspense>
      <Page params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Page({ params, searchParams }: Pick<PageProps<"/paths/[id]/certificate">, "params" | "searchParams">) {
  const { id } = await params;
  const fromProfile = (await searchParams).from === "profile";
  // Completions change as people learn, so always read them fresh.
  await connection();
  const db = getDb();
  const user = await currentUser(db);
  // Earned certificates open even if the path has since been deleted.
  const cert = certificateFor(db, user, id);
  if (!cert) {
    let path: ReturnType<typeof learnerPath> | null = null;
    try {
      path = learnerPath(db, user, id);
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
    }
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <h1 className="font-serif text-3xl font-semibold">Not quite there yet</h1>
        <p className="mt-3 text-ink-muted">
          {path ? "Your certificate is ready once you've finished every topic in this path." : "This learning path isn't available. It may have been removed."}
        </p>
        <Link
          href={path ? `/paths/${encodeURIComponent(id)}` : "/topics"}
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
        >
          <Icon name="arrow-left" className="size-4" /> {path ? "Back to the path" : "All learning"}
        </Link>
      </div>
    );
  }
  return (
    <Certificate
      pathId={cert.id}
      pathName={cert.name}
      person={user.name}
      completedAt={cert.completedAt}
      lessons={cert.topics}
      minutes={cert.minutes}
      outcomes={cert.outcomes}
      reference={cert.reference}
      back={fromProfile || cert.deleted ? { href: "/settings#certificates", label: "Back to your profile" } : undefined}
    />
  );
}
