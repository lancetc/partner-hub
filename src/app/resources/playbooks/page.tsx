import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PlaybookList } from "@/components/playbooks/PlaybookList";

export const metadata: Metadata = {
  title: "Playbooks",
  description: "Short, approved procedure steps for your role, always at the current release, with a route to urgent help.",
  alternates: { canonical: "/resources/playbooks" },
};

export default function PlaybooksPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:pt-10">
      <Link href="/resources" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> Resources
      </Link>
      <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Playbooks</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">
        The steps that matter for your role, taken from the approved procedure and kept current. If someone is in immediate danger, call 000.
      </p>
      <PlaybookList />
    </div>
  );
}
