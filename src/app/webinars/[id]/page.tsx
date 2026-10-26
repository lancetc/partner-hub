import { Suspense } from "react";
import type { Metadata } from "next";
import { WebinarWatch } from "@/components/Webinars";

export const metadata: Metadata = { title: "Webinar" };

export default function WebinarPage({ params }: PageProps<"/webinars/[id]">) {
  return (
    <Suspense>
      <Watch params={params} />
    </Suspense>
  );
}

async function Watch({ params }: Pick<PageProps<"/webinars/[id]">, "params">) {
  const { id } = await params;
  return <WebinarWatch id={id} />;
}
