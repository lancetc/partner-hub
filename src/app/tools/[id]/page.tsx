import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { FavouriteBanner } from "@/components/favourites/FavouriteBanner";
import { PlaybookCard } from "@/components/playbooks/PlaybookCard";

export const metadata: Metadata = { title: "Work tool" };

/** One Job Aid in full, at its current approved release for the reader's role (docs/job-aids.md). */
export default function WorkToolPage({ params }: PageProps<"/tools/[id]">) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 lg:pt-10">
      <Link href="/tools" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> Work Tools
      </Link>
      <FavouriteBanner className="mt-2" />
      <div className="mt-3">
        <Suspense>
          <Card params={params} />
        </Suspense>
      </div>
    </div>
  );
}

async function Card({ params }: Pick<PageProps<"/tools/[id]">, "params">) {
  const { id } = await params;
  return <PlaybookCard snippetId={id} />;
}
