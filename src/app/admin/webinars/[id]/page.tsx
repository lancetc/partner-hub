import { Suspense } from "react";
import type { Metadata } from "next";
import { WebinarEditor } from "@/components/admin/WebinarsAdmin";

export const metadata: Metadata = { title: "Webinar" };

export default function AdminWebinarPage({ params }: PageProps<"/admin/webinars/[id]">) {
  return (
    <Suspense>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/admin/webinars/[id]">, "params">) {
  const { id } = await params;
  return <WebinarEditor id={id} />;
}
