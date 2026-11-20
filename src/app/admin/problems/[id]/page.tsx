import { Suspense } from "react";
import type { Metadata } from "next";
import { ProblemTheme } from "@/components/admin/problems/ProblemTheme";

export const metadata: Metadata = { title: "Problem desk theme" };

export default function AdminProblemThemePage({ params }: PageProps<"/admin/problems/[id]">) {
  return (
    <Suspense>
      <Theme params={params} />
    </Suspense>
  );
}

async function Theme({ params }: Pick<PageProps<"/admin/problems/[id]">, "params">) {
  const { id } = await params;
  return <ProblemTheme id={id} />;
}
