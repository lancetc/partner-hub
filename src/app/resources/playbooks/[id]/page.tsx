import { redirect } from "next/navigation";

/** A playbook's old address: the same Job Aid, in Work Tools (docs/job-aids.md). */
export default async function PlaybookPage({ params }: PageProps<"/resources/playbooks/[id]">) {
  const { id } = await params;
  redirect(`/tools/${encodeURIComponent(id)}`);
}
