import { redirect } from "next/navigation";

/** Playbooks are Job Aids now, and their library is Work Tools (docs/job-aids.md). Old links still land in the right place. */
export default function PlaybooksPage() {
  redirect("/tools");
}
