import type { Metadata } from "next";
import Link from "next/link";
import { glossary } from "@/content/glossary";
import { resources } from "@/content/resources";
import { SaveButton } from "@/components/SaveButton";
import { Icon, type IconName } from "@/components/Icon";
import { formatDate } from "@/lib/format";
import { HeroStats, PageHero } from "@/components/PageHero";
import { ONBOARDING_MODELS } from "@/content/partnerOnboarding";
import { FavouriteBanner } from "@/components/favourites/FavouriteBanner";
import { HighlightArea } from "@/components/favourites/HighlightArea";
import { SaveSection } from "@/components/favourites/Highlighter";
import { SavedMarkChips } from "@/components/favourites/SavedMarks";

export const metadata: Metadata = {
  title: "Resources",
  description: "Guides, templates and contacts for Trilogy Care’s Care Partners and care coordinators.",
  alternates: { canonical: "/resources" },
};

const glossaryCount = glossary.reduce((n, s) => n + s.terms.length, 0);
const glossaryPeek = "Package and NOA to rollover and SIRS";

const kindIcon: Record<string, IconName> = { Guide: "book", Template: "doc", Process: "route", Contact: "people" };

export default function ResourcesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
      <PageHero
        eyebrow="Look it up"
        title="Resources"
        // A colleague making notes at her table by the louvres, laptop open, on the right, with the weatherboards behind the words.
        image={{ src: "/images/hero-notes-at-table.webp", width: 1914, height: 822, position: "80% 29%", minHeight: 336 }}
        aside={
          <HeroStats
            stats={[
              { label: "guides and templates", value: resources.length },
              { label: "glossary terms", value: glossaryCount },
            ]}
          />
        }
      >
        The reference shelf, for when you need an answer now: guides, templates, webinars, the client journey and who to contact. Demonstration content.
      </PageHero>

      {/* Opened from Favourites: the saved passage, where it stands now, and the way back. */}
      <FavouriteBanner className="mt-6" />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {/*
          Work Tools first, across the row: on a phone, Resources is where Work Tools lives (the bottom bar has no room
          for it), so it's the first thing here. On a desktop it also has its own place in the header.
        */}
        <Link
          href="/tools"
          className="group flex items-center gap-4 rounded-3xl bg-tealtint p-5 ring-1 ring-line transition hover:shadow-md hover:ring-action sm:p-6 md:col-span-2"
        >
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-action text-on-action">
            <Icon name="clipboard" className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Work Tools</span>
            <span className="mt-0.5 block font-serif text-xl font-semibold leading-snug group-hover:underline">Job Aids for the task in front of you</span>
            <span className="mt-1 block text-ink-muted">
              Short, approved checklists and prompts for your role, always the current release, with a route to urgent help. No course to finish first.
            </span>
          </span>
          <Icon name="arrow-right" className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-1" />
        </Link>
        {/* Partner onboarding, one box per partner model (P1, Brokered, Coordinator managed), each on its own page. */}
        {ONBOARDING_MODELS.map((o) => (
          <Link
            key={o.id}
            href={o.href}
            className={`group flex items-center gap-4 rounded-3xl ${o.box.tone} p-5 ring-1 ring-line transition hover:shadow-md hover:ring-action sm:p-6 dark:bg-muted`}
          >
            <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#008282] text-white">
              <Icon name={o.box.icon} className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{o.label}</span>
              <span className="mt-0.5 block font-serif text-xl font-semibold leading-snug group-hover:underline">{o.title}</span>
              <span className="mt-1 block text-ink-muted">{o.box.blurb}</span>
            </span>
            <Icon name="arrow-right" className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-1" />
          </Link>
        ))}
        <Link
          href="/resources/glossary"
          className="group flex items-center gap-4 rounded-3xl bg-tealtint p-5 ring-1 ring-line transition hover:shadow-md hover:ring-action sm:p-6"
        >
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-action font-serif text-xl font-semibold text-on-action">
            Aa
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Glossary</span>
            <span className="mt-0.5 block font-serif text-xl font-semibold leading-snug group-hover:underline">Support at Home terms, in plain words</span>
            <span className="mt-1 block text-ink-muted">
              {glossaryCount} terms, from {glossaryPeek}.
            </span>
          </span>
          <Icon name="arrow-right" className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-1" />
        </Link>
        <Link
          href="/resources/myths"
          className="group flex items-center gap-4 rounded-3xl bg-muted p-5 ring-1 ring-line transition hover:shadow-md hover:ring-action sm:p-6"
        >
          <span
            aria-hidden
            className="grid size-12 shrink-0 place-items-center rounded-2xl bg-action font-serif text-3xl font-semibold leading-none text-on-action"
          >
            “
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Myth vs Reality</span>
            <span className="mt-0.5 block font-serif text-xl font-semibold leading-snug group-hover:underline">Questions clients often ask, answered</span>
            <span className="mt-1 block text-ink-muted">A 30-second answer, what to check, the source, and an approved reply to copy.</span>
          </span>
          <Icon name="arrow-right" className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-1" />
        </Link>
        <Link
          href="/webinars"
          className="group flex items-center gap-4 rounded-3xl bg-muted p-5 ring-1 ring-line transition hover:shadow-md hover:ring-action sm:p-6"
        >
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-surface">
            <Icon name="play" className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Webinars</span>
            <span className="mt-0.5 block font-serif text-xl font-semibold leading-snug group-hover:underline">Recorded sessions to watch any time</span>
            <span className="mt-1 block text-ink-muted">Support at Home, care coordination and working with Trilogy.</span>
          </span>
          <Icon name="arrow-right" className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-1" />
        </Link>
        <Link
          href="/journey"
          className="group flex items-center gap-4 rounded-3xl bg-muted p-5 ring-1 ring-line transition hover:shadow-md hover:ring-action sm:p-6"
        >
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#c7393e] text-white">
            <Icon name="pin" className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Journey map</span>
            <span className="mt-0.5 block font-serif text-xl font-semibold leading-snug group-hover:underline">The client journey, from enquiry to exit</span>
            <span className="mt-1 block text-ink-muted">Ten stages: what the client does, what Trilogy does, and how each one feels.</span>
          </span>
          <Icon name="arrow-right" className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-1" />
        </Link>
        <Link
          href="/challenges"
          className="group flex items-center gap-4 rounded-3xl bg-muted p-5 ring-1 ring-line transition hover:shadow-md hover:ring-action sm:p-6"
        >
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#fab53d] text-[#102a43]">
            <Icon name="flag" className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Challenges</span>
            <span className="mt-0.5 block font-serif text-xl font-semibold leading-snug group-hover:underline">Team challenges, a mission a day</span>
            <span className="mt-1 block text-ink-muted">Join a challenge, earn points with your team and climb the leaderboard.</span>
          </span>
          <Icon name="arrow-right" className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-1" />
        </Link>
        <Link
          href="/play/conversations"
          className="group flex items-center gap-4 rounded-3xl bg-muted p-5 ring-1 ring-line transition hover:shadow-md hover:ring-action sm:p-6 md:col-span-2"
        >
          <span aria-hidden className="relative h-12 w-12 shrink-0">
            <span className="absolute inset-0 -rotate-12 rounded-lg bg-[#c7393e]" />
            <span className="absolute inset-0 rotate-6 rounded-lg bg-[#fab53d]" />
            <span className="absolute inset-0 grid place-items-center rounded-lg bg-[#008282] text-lg">💬</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">New game · Care Conversations</span>
            <span className="mt-0.5 block font-serif text-xl font-semibold leading-snug group-hover:underline">
              Conversation cards for learning from each other
            </span>
            <span className="mt-1 block text-ink-muted">
              48 cards in six themes. Reflect on your own, run a team session with a room code, or share a perspective with the community.
            </span>
          </span>
          <Icon name="arrow-right" className="size-5 shrink-0 text-accent transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
      {/* Each entry is a place a passage can be highlighted (docs/job-aids.md), anchored to the entry and its date. */}
      <HighlightArea source="resource" id="library" className="mt-4">
        <ul className="grid gap-4 md:grid-cols-2">
          {resources.map((r) => (
            <li
              key={r.id}
              id={r.id}
              data-hl={r.id}
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
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="font-mulish text-sm text-ink-muted">
                  {r.audience.includes("partner") && r.audience.includes("coordinator")
                    ? "Partners and coordinators"
                    : r.audience.includes("partner")
                      ? "Care Partners"
                      : "Coordinators"}{" "}
                  · Updated {formatDate(r.updated)}
                </p>
                {/* The entry's description and points, saved without selecting anything. */}
                <span className="print:hidden">
                  <SaveSection source="resource" id={r.id} sectionId={r.id} label="Save this entry" />
                </span>
              </div>
              <SavedMarkChips blockId={r.id} className="mt-3" />
            </li>
          ))}
        </ul>
      </HighlightArea>
    </div>
  );
}
