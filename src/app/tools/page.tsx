import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { WorkTools } from "@/components/playbooks/WorkTools";

export const metadata: Metadata = {
  title: "Work Tools",
  description: "Short, approved Job Aids for the task in front of you, always at the current release.",
  alternates: { canonical: "/tools" },
};

/** Work Tools (docs/job-aids.md): the library of official Job Aids, found by task. No course to open or finish first. */
export default function WorkToolsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:pt-10">
      <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Work Tools</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">
        Short, approved tools for the task in front of you: a checklist, the questions to ask, who to tell. Always the current release. If someone is in
        immediate danger, call 000.
      </p>
      <Link
        href="/favourites"
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted"
      >
        <Icon name="bookmark" className="size-4" /> Your Favourites
      </Link>
      <WorkTools />
    </div>
  );
}
