import type { Metadata } from "next";
import { CaseThreadsAdmin } from "@/components/admin/CaseThreadsAdmin";

export const metadata: Metadata = { title: "Case threads" };

/** The one moderation queue for "What Would You Do?" case threads (docs/case-threads.md). Moderators only: the API checks. */
export default function AdminCaseThreadsPage() {
  return <CaseThreadsAdmin />;
}
