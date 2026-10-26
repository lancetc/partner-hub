import { Suspense } from "react";
import type { Metadata } from "next";
import { CampaignEditor } from "@/components/admin/EmailCampaigns";

export const metadata: Metadata = { title: "Email campaign" };

export default function CampaignPage({ params }: PageProps<"/admin/email/[id]">) {
  return (
    <Suspense>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/admin/email/[id]">, "params">) {
  const { id } = await params;
  return <CampaignEditor id={id} />;
}
