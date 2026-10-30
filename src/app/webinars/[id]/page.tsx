import { Suspense } from "react";
import type { Metadata } from "next";
import { WebinarWatch } from "@/components/Webinars";
import { connection } from "next/server";
import { getDb } from "@/server/db";
import { webinarMetadata } from "@/server/seo";

export async function generateMetadata({ params }: PageProps<"/webinars/[id]">): Promise<Metadata> {
  const { id } = await params;
  await connection();
  return webinarMetadata(getDb(), id);
}

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
