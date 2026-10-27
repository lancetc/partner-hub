import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { getDb } from "@/server/db";
import { currentUser, HttpError } from "@/server/auth";
import { learnerPath } from "@/server/learningPaths";
import { Certificate } from "@/components/Certificate";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Certificate" };

/** A certificate for a finished learning path, to print or save as a PDF. */
export default function CertificatePage({ params }: PageProps<"/paths/[id]/certificate">) {
  return (
    <Suspense>
      <Page params={params} />
    </Suspense>
  );
}

async function Page({ params }: Pick<PageProps<"/paths/[id]/certificate">, "params">) {
  const { id } = await params;
  // Completions change as people learn, so always read them fresh.
  await connection();
  const db = getDb();
  const user = await currentUser(db);
  let path: ReturnType<typeof learnerPath> | null = null;
  try {
    path = learnerPath(db, user, id);
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
  }
  // Only a whole path earns one: every lesson finished, none still being written.
  const finished = path && path.steps.length > 0 && path.steps.every((s) => !s.draft && s.completedAt);
  if (!path || !finished) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <h1 className="font-serif text-3xl font-semibold">Not quite there yet</h1>
        <p className="mt-3 text-ink-muted">
          {path ? "Your certificate is ready once you've finished every lesson in this path." : "This learning path isn't available. It may have been removed."}
        </p>
        <Link
          href={path ? `/paths/${encodeURIComponent(id)}` : "/learning"}
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
        >
          <Icon name="arrow-left" className="size-4" /> {path ? "Back to the path" : "All learning"}
        </Link>
      </div>
    );
  }
  const completedAt = path.steps.reduce((latest, s) => (s.completedAt! > latest ? s.completedAt! : latest), "");
  return (
    <Certificate
      pathId={path.id}
      pathName={path.name}
      person={user.name}
      completedAt={completedAt}
      lessons={path.steps.length}
      minutes={path.minutes}
      outcomes={path.outcomes}
      reference={`${path.id.replace(/^lp-/, "").toUpperCase()}-${user.id.toUpperCase()}-${completedAt.slice(0, 10).replaceAll("-", "")}`}
    />
  );
}
