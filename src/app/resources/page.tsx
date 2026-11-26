import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getDb } from "@/server/db";
import { currentUser, meantFor } from "@/server/auth";
import Link from "next/link";
import Image from "next/image";
import { glossary } from "@/content/glossary";
import { resources } from "@/content/resources";
import { SaveButton } from "@/components/SaveButton";
import { Icon, type IconName } from "@/components/Icon";
import { cx, formatDate } from "@/lib/format";
import { HeroStats, PageHero } from "@/components/PageHero";
import { LearnTile } from "@/components/LearnMenu";
import { ONBOARDING_MODELS, type OnboardingModelId } from "@/content/partnerOnboarding";
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
        tile={<LearnTile href="/resources" />}
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
        <ResourceCard
          href="/tools"
          picture={POSTERS.tools}
          tone="bg-tealtint"
          wide
          label="Work Tools"
          title="Job Aids for the task in front of you"
          blurb="Short, approved checklists and prompts for your role, always the current release, with a route to urgent help. No course to finish first."
        />
        {/* Partner onboarding, one box per partner model (P1, Brokered, Coordinator managed), each on its own page. */}
        {ONBOARDING_MODELS.map((o) => (
          <ResourceCard
            key={o.id}
            href={o.href}
            picture={POSTERS[o.id]}
            tone={`${o.box.tone} dark:bg-muted`}
            label={o.label}
            title={o.title}
            blurb={o.box.blurb}
          />
        ))}
        <ResourceCard
          href="/resources/glossary"
          picture={POSTERS.glossary}
          tone="bg-tealtint"
          label="Glossary"
          title="Support at Home terms, in plain words"
          blurb={`${glossaryCount} terms, from ${glossaryPeek}.`}
        />
        <ResourceCard
          href="/resources/myths"
          picture={POSTERS.myths}
          label="Myth vs Reality"
          title="Questions clients often ask, answered"
          blurb="A 30-second answer, what to check, the source, and an approved reply to copy."
        />
        <ResourceCard
          href="/webinars"
          picture={POSTERS.webinars}
          label="Webinars"
          title="Recorded sessions to watch any time"
          blurb="Support at Home, care coordination and working with Trilogy."
        />
        <ResourceCard
          href="/journey"
          picture={POSTERS.journey}
          label="Journey map"
          title="The client journey, from enquiry to exit"
          blurb="Ten stages: what the client does, what Trilogy does, and how each one feels."
        />
        <ResourceCard
          href="/challenges"
          picture={POSTERS.challenges}
          label="Challenges"
          title="Team challenges, a mission a day"
          blurb="Join a challenge, earn points with your team and climb the leaderboard."
        />
        <ResourceCard
          href="/play/conversations"
          picture={POSTERS.conversations}
          wide
          label="New game · Care Conversations"
          title="Conversation cards for learning from each other"
          blurb="48 cards in six themes. Reflect on your own, run a team session with a room code, or share a perspective with the community."
        />
      </div>
      {/* Each entry is a place a passage can be highlighted (docs/job-aids.md), anchored to the entry and its date. */}
      <HighlightArea source="resource" id="library" className="mt-4">
        <Suspense>
          <Library />
        </Suspense>
      </HighlightArea>
    </div>
  );
}

/*
  Each box's picture, on its left, bleeding to the top, left and bottom (the owner, Nov 2026). Where the page it opens
  has its own picture (the journey map, Challenges), it's that one; the others are from the image library.
*/
type Poster = { src: string; position?: string };
const upload = (name: string, position?: string): Poster => ({ src: `/api/uploads/${name}`, position });
const POSTERS: Record<"tools" | OnboardingModelId | "glossary" | "myths" | "webinars" | "journey" | "challenges" | "conversations", Poster> = {
  tools: upload("0d77a9ae-3ae6-464c-bb38-2761271f2aa0.webp"),
  p1: upload("c818c9d9-83e6-450e-bfd7-b069a643f3b9.webp"),
  brokered: upload("b114e2ab-b344-4f01-b0f6-c03de0ddea49.webp"),
  coordinator: upload("192877fe-3a61-43e7-8a34-9491ca35dac1.webp"),
  glossary: upload("ee645d2a-c873-4d8f-9c95-48ca32681605.webp"),
  myths: upload("34de2cec-31c2-4c2c-8f6c-15c316e69a3c.webp"),
  webinars: { src: "/images/hero-headphones-notes.webp", position: "75% 40%" },
  journey: { src: "/images/journey-before-it-starts.webp" },
  challenges: { src: "/images/hero-challenge-split.webp", position: "85% 51%" },
  conversations: upload("01ef4214-b3e2-44d9-ae76-212fbfdcc328.webp"),
};

/** A box on Resources: its picture on the left, then what it is, with the shared card hover (teal heading, no underline). */
function ResourceCard({
  href,
  picture,
  tone = "bg-muted",
  wide,
  label,
  title,
  blurb,
}: {
  href: string;
  picture: Poster;
  tone?: string;
  wide?: boolean;
  label: string;
  title: string;
  blurb: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "tile group flex items-stretch gap-4 overflow-hidden rounded-3xl pr-5 ring-1 ring-line transition hover:shadow-md hover:ring-action sm:gap-5 sm:pr-6",
        tone,
        wide && "md:col-span-2",
      )}
    >
      <span aria-hidden className={cx("relative min-h-32 w-28 shrink-0 overflow-hidden bg-muted sm:w-40", wide && "md:w-56")}>
        <Image
          src={picture.src}
          alt=""
          fill
          sizes="(min-width: 768px) 224px, 112px"
          style={picture.position ? { objectPosition: picture.position } : undefined}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
        />
      </span>
      <span className="min-w-0 flex-1 self-center py-5 sm:py-6">
        <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{label}</span>
        <span className="mt-0.5 block font-serif text-xl font-semibold leading-snug tile-heading">{title}</span>
        <span className="mt-1 block text-ink-muted">{blurb}</span>
      </span>
      <Icon name="arrow-right" className="size-5 shrink-0 self-center text-accent transition-transform group-hover:translate-x-1" />
    </Link>
  );
}

/**
  The library, read per request: only the entries meant for this person (auth.meantFor), so a coordinator isn't shown
  the Care Partners' visit note template and partners aren't shown the coordinators' escalation guide.
*/
async function Library() {
  await connection();
  const user = await currentUser(getDb());
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {resources
        .filter((r) => meantFor(user, r.audience))
        .map((r) => (
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
  );
}
