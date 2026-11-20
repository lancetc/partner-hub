import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { MythResource } from "@/components/myths/MythResource";

export const metadata: Metadata = {
  title: "Myth vs Reality",
  description: "Questions participants and families often ask, with a 30-second answer, the exception, the source and an approved reply to copy.",
  alternates: { canonical: "/resources/myths" },
};

export default function MythsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:pt-10">
      <Link href="/resources" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> Resources
      </Link>
      <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Myth vs Reality</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">
        Questions participants and families often ask, with a clear answer you can say in about 30 seconds, what to check for the person, the source, and an
        approved email reply to copy.
      </p>
      <MythResource />
    </div>
  );
}
