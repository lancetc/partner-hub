import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PlaybookCard } from "@/components/playbooks/PlaybookCard";

export const metadata: Metadata = { title: "Playbook" };

export default function PlaybookPage({ params }: PageProps<"/resources/playbooks/[id]">) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 lg:pt-10">
      <Link href="/resources/playbooks" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> Playbooks
      </Link>
      <div className="mt-3">
        <Suspense>
          <Card params={params} />
        </Suspense>
      </div>
    </div>
  );
}

async function Card({ params }: Pick<PageProps<"/resources/playbooks/[id]">, "params">) {
  const { id } = await params;
  return <PlaybookCard snippetId={id} />;
}
