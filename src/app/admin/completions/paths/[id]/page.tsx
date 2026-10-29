import { Suspense } from "react";
import type { Metadata } from "next";
import { PathCompletions } from "@/components/admin/Completions";

export const metadata: Metadata = { title: "Learning path progress" };

export default function AdminPathCompletionsPage({ params }: PageProps<"/admin/completions/paths/[id]">) {
  return (
    <Suspense>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: Pick<PageProps<"/admin/completions/paths/[id]">, "params">) {
  const { id } = await params;
  return <PathCompletions id={id} />;
}
