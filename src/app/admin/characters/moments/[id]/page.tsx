import { Suspense } from "react";
import type { Metadata } from "next";
import { MomentEditor } from "@/components/admin/story/MomentEditor";

export const metadata: Metadata = { title: "Story moment" };

export default function Page({ params }: PageProps<"/admin/characters/moments/[id]">) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: Pick<PageProps<"/admin/characters/moments/[id]">, "params">) {
  const { id } = await params;
  return <MomentEditor id={id} />;
}
