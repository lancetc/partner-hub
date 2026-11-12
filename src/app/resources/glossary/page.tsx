import type { Metadata } from "next";
import Link from "next/link";
import { Glossary } from "@/components/Glossary";
import { Icon } from "@/components/Icon";
import { glossary } from "@/content/glossary";

export const metadata: Metadata = {
  title: "Glossary",
  description: "Support at Home terms, roles, fees and abbreviations used at Trilogy Care, in plain words.",
  alternates: { canonical: "/resources/glossary" },
};

export default function GlossaryPage() {
  const count = glossary.reduce((n, s) => n + s.terms.length, 0);
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:pt-10">
      <Link href="/resources" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> Resources
      </Link>
      <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Glossary</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">
        {count} Support at Home terms, roles and abbreviations you’ll hear at Trilogy Care, and what they mean.
      </p>
      <Glossary />
    </div>
  );
}
