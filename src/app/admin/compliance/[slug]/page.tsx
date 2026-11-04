import { Suspense } from "react";
import type { Metadata } from "next";
import { RegisterTopic } from "@/components/admin/ComplianceRegister";

export const metadata: Metadata = { title: "Compliance register" };

/** One topic on the compliance register: its rules, and who is trained. */
export default function AdminComplianceTopicPage({ params }: PageProps<"/admin/compliance/[slug]">) {
  return (
    <Suspense>
      <Topic params={params} />
    </Suspense>
  );
}

async function Topic({ params }: Pick<PageProps<"/admin/compliance/[slug]">, "params">) {
  const { slug } = await params;
  return <RegisterTopic slug={slug} />;
}
