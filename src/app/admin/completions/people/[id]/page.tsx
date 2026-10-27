import { Suspense } from "react";
import type { Metadata } from "next";
import { PersonCompletions } from "@/components/admin/Completions";

export const metadata: Metadata = { title: "Learner record" };

export default function AdminPersonCompletionsPage({ params }: PageProps<"/admin/completions/people/[id]">) {
  return (
    <Suspense>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: Pick<PageProps<"/admin/completions/people/[id]">, "params">) {
  const { id } = await params;
  return <PersonCompletions id={id} />;
}
