import type { Metadata } from "next";
import { resources } from "@/content/resources";
import { SaveButton } from "@/components/SaveButton";
import { Icon, type IconName } from "@/components/Icon";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Resources",
  description: "Guides, templates and contacts for Trilogy Care service partners and care coordinators.",
  alternates: { canonical: "/resources" },
};

const kindIcon: Record<string, IconName> = { Guide: "book", Template: "doc", Process: "route", Contact: "people" };

export default function ResourcesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:pt-10">
      <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Resources</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">Guides, templates and contacts you can come back to. Demonstration content.</p>
      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        {resources.map((r) => (
          <li
            key={r.id}
            id={r.id}
            className="scroll-mt-24 rounded-3xl border border-line bg-surface p-5 target:border-action target:ring-2 target:ring-action/30"
          >
            <div className="flex items-start gap-4">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-tealtint text-accent">
                <Icon name={kindIcon[r.kind]} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{r.kind}</p>
                <h2 className="mt-1 font-serif text-xl font-semibold leading-snug">{r.title}</h2>
                <p className="mt-1 text-ink-muted">{r.description}</p>
              </div>
              <SaveButton id={`resource:${r.id}`} title={r.title} className="-mr-2 -mt-2" />
            </div>
            <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
              {r.points.map((p) => (
                <li key={p} className="flex gap-2">
                  <Icon name="check" className="mt-1 size-4 shrink-0 text-accent" />
                  {p}
                </li>
              ))}
            </ul>
            <p className="mt-4 font-mulish text-sm text-ink-muted">
              {r.audience.includes("partner") && r.audience.includes("coordinator")
                ? "Partners and coordinators"
                : r.audience.includes("partner")
                  ? "Service partners"
                  : "Coordinators"}{" "}
              · Updated {formatDate(r.updated)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
