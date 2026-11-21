import { Suspense } from "react";
import type { Metadata } from "next";
import { ReturnEditor } from "@/components/admin/living/ReturnEditor";

export const metadata: Metadata = { title: "Return episode" };

export default function AdminReturnPage({ params }: PageProps<"/admin/characters/returns/[id]">) {
  return (
    <Suspense>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/admin/characters/returns/[id]">, "params">) {
  const { id } = await params;
  return <ReturnEditor id={id} />;
}
