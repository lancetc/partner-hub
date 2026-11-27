"use client";

import { createContext, useContext, useState } from "react";
import Link from "next/link";
import { categories, categoryLabel, policyStatusLabel, type CategoryId, type Story } from "@/content/stories";
import { StoryVisual } from "./StoryVisual";
import { SaveButton } from "./SaveButton";
import { Icon } from "./Icon";
import { cx, formatDate } from "@/lib/format";
import type { NewsEdition } from "@/server/newsEdition";
import { EditionStrip, FeaturedBrowser, FromTheArchive, NewsInBrief, WeeklyQuestionCard } from "./news/EditionParts";
import { BriefingStrip } from "./news/BriefingStrip";

/*
  The homepage's "In this issue", laid out like a broadsheet: a mosaic of stories on a grid of ruled columns, with
  thick rules between the bands and hairlines between the columns, square-cornered pictures, serif headlines in a
  clear hierarchy, a drop cap on the lead, and the section index as a strip of tabs rather than pills.
*/

const href = (s: Story) => `/news/${s.slug}`;
/** When this person was last here before this visit (server/newsEdition): stories since then say "New". */
const SinceVisit = createContext<string | null>(null);
const saveId = (s: Story) => `story:${s.slug}`;

/** A story's section, as a newspaper kicker. */
function Kicker({ story, className }: { story: Story; className?: string }) {
  const since = useContext(SinceVisit);
  const isNew = Boolean(since && story.date > since);
  return (
    <p
      className={cx(
        "font-mulish text-xs font-extrabold uppercase tracking-[0.16em]",
        story.category === "policy" || story.category === "case-study" ? "text-warm" : "text-accent",
        className,
      )}
    >
      {categoryLabel(story.category)}
      {isNew && <span className="ml-2 rounded-full bg-[#007f7e] px-2 py-0.5 tracking-[0.1em] text-white">New</span>}
    </p>
  );
}

/** The byline and dateline, set small: "By Trilogy Care team · 22 Oct 2026 · 4 min read". */
function Byline({ story, withAuthor = true }: { story: Story; withAuthor?: boolean }) {
  return (
    <p className="font-mulish text-xs text-ink-muted">
      {withAuthor && (
        <>
          <span className="font-serif italic">By {story.byline}</span>
          <span aria-hidden> · </span>
        </>
      )}
      <time dateTime={story.date}>{formatDate(story.date)}</time>
      <span aria-hidden> · </span>
      {story.readMinutes} min read
    </p>
  );
}

/** The headline's link covers its whole story, so anywhere on it opens the story. */
function Headline({ story, className }: { story: Story; className: string }) {
  return (
    <h3 className={cx("font-serif font-bold text-ink", className)}>
      <Link href={href(story)} className="tile-link">
        {story.title}
      </Link>
    </h3>
  );
}

/** A band's label: small capitals with a hairline running to the edge. */
function BandLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cx("flex items-center gap-3 font-mulish text-xs font-extrabold uppercase tracking-[0.2em] text-ink", className)}>
      {children}
      <span aria-hidden className="h-px flex-1 bg-line-strong" />
    </h3>
  );
}

export function NewsGrid({ edition: e }: { edition: NewsEdition }) {
  const stories = e.stories;
  const [filter, setFilter] = useState<CategoryId | "all">("all");
  const filtered = filter === "all" ? stories : stories.filter((s) => s.category === filter);
  const sections = [{ id: "all" as const, label: "All stories" }, ...categories.filter((c) => c.id !== "policy")];

  return (
    <SinceVisit.Provider value={e.since}>
      {/* Which edition, today's date, and what's new since this person was last here (the owner, Nov 2026). */}
      <div data-reveal="meta" style={{ "--nr": "220ms" } as React.CSSProperties}>
        <EditionStrip edition={e.edition} />
      </div>
      {/* The section index, as a newspaper's strip of sections under the nameplate. No Policy updates tab: those stories show under All stories. */}
      <div data-reveal="meta" data-reveal-rule="line1" style={{ "--nr": "300ms" } as React.CSSProperties} className="-mx-4 border-b border-line-strong sm:mx-0">
        <div role="group" aria-label="Filter stories by section" className="scrollbar-none flex overflow-x-auto px-4 sm:px-0">
          {sections.map((c, i) => {
            const active = filter === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(c.id)}
                className={cx(
                  "relative inline-flex min-h-11 shrink-0 items-center px-4 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] transition-colors",
                  i > 0 && "before:absolute before:left-0 before:top-1/2 before:h-4 before:w-px before:-translate-y-1/2 before:bg-line-strong",
                  i === 0 && "pl-0",
                  active
                    ? "text-ink after:absolute after:inset-x-4 after:-bottom-px after:h-[3px] after:bg-ink first:after:left-0"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {c.label}
              </button>
            );
          })}
          <span className="ml-auto hidden shrink-0 items-center pl-6 font-serif text-sm italic text-ink-muted lg:inline-flex">
            {filtered.length} {filtered.length === 1 ? "story" : "stories"}
          </span>
        </div>
      </div>

      <p className="sr-only" role="status">
        {filter === "all" ? `Showing all ${stories.length} stories` : `Showing ${filtered.length} ${categories.find((c) => c.id === filter)?.label}`}
      </p>

      {filter === "all" && e.briefing && (
        <div style={{ "--nr": "380ms" } as React.CSSProperties}>
          <BriefingStrip script={e.briefing.script} audio={e.briefing.audio} cues={e.briefing.cues} date={e.edition.date.replace(/\s\d{4}$/, "")} />
        </div>
      )}
      {filter === "all" ? <Broadsheet stories={stories} edition={e} /> : <SectionPage stories={filtered} />}
    </SinceVisit.Provider>
  );
}

/**
  The front page. Three bands, each closed by a thick rule:
  - the lead in the middle, the latest headlines to its left and the policy notice to its right;
  - "This week": four stories across, hairlines between them;
  - a wide feature beside a numbered list of more updates.
  On a phone it's one column, with a rule between each story.
*/
function Broadsheet({ stories, edition: e }: { stories: Story[]; edition: NewsEdition }) {
  // The featured stories, chosen for this person on arrival (server/newsEdition); the first leads.
  const featured = e.featured.flatMap((f) => {
    const story = stories.find((s) => s.slug === f.slug);
    return story ? [{ story, reason: f.reason }] : [];
  });
  const lead = featured[0]?.story ?? stories[0];
  const archive = e.archive ? stories.find((s) => s.slug === e.archive) : undefined;
  const policy = stories.find((s) => s.policy && s !== lead);
  const rest = stories.filter((s) => s !== lead && s !== policy);
  const side = rest.slice(0, 3);
  const week = rest.slice(3, 7);
  const wide = rest[7];
  const more = rest.slice(8);

  return (
    <div data-build-tiles>
      {/* Band one: the front of the issue. Its closing rule draws in as the news arrives. */}
      <div data-reveal-rule="ink3" style={{ "--nr": "520ms" } as React.CSSProperties} className="grid grid-cols-1 border-b-[3px] border-ink lg:grid-cols-12">
        <div
          data-cue="section:featured"
          data-reveal="feature"
          style={{ "--nr": "470ms" } as React.CSSProperties}
          className="py-6 lg:order-2 lg:col-span-6 lg:px-7"
        >
          <FeaturedBrowser
            items={featured.length ? featured : [{ story: lead, reason: "new" }]}
            render={(story, note) => <Lead key={story.slug} story={story} note={note} />}
          />
        </div>
        <div
          data-cue="section:latest"
          data-reveal="column"
          style={{ "--nr": "560ms" } as React.CSSProperties}
          className="border-t border-line-strong py-6 lg:order-1 lg:col-span-3 lg:border-r lg:border-t-0 lg:pr-6"
        >
          <BandLabel>Latest</BandLabel>
          <div className="mt-3 divide-y divide-line-strong">
            {side.map((s) => (
              <TextStory key={s.slug} story={s} />
            ))}
          </div>
        </div>
        {policy && (
          <PolicyNotice
            story={policy}
            className="border-t border-line-strong py-6 lg:order-3 lg:col-span-3 lg:border-l lg:border-t-0 lg:pl-6"
            style={{ "--nr": "640ms" } as React.CSSProperties}
          />
        )}
      </div>

      {/* The Hub this week: News in Brief from across the Hub, a story worth revisiting, and the weekly question. */}
      {(e.brief.length > 0 || archive || e.question) && (
        <div className="grid grid-cols-1 border-b-[3px] border-ink lg:grid-cols-12">
          {e.brief.length > 0 && (
            <div data-cue="section:brief" className="py-6 lg:col-span-5 lg:border-r lg:border-line-strong lg:pr-6">
              <BandLabel>News in brief</BandLabel>
              <NewsInBrief items={e.brief} />
            </div>
          )}
          {archive && (
            <div data-cue="section:archive" className="border-t border-line-strong py-6 lg:col-span-4 lg:border-r lg:border-t-0 lg:px-6">
              <BandLabel>From the archive · worth revisiting</BandLabel>
              <div className="mt-3">
                <FromTheArchive story={archive} />
              </div>
            </div>
          )}
          {e.question && (
            <div data-cue="section:question" className="border-t border-line-strong py-6 lg:col-span-3 lg:border-t-0 lg:pl-6">
              <WeeklyQuestionCard initial={e.question} />
            </div>
          )}
        </div>
      )}

      {/* Band two: this week, four across. */}
      {week.length > 0 && (
        <div className="border-b-[3px] border-ink py-6">
          <BandLabel>This week</BandLabel>
          <div className="mt-4 grid grid-cols-1 divide-y divide-line-strong sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
            {week.map((s, i) => (
              <ColumnStory
                key={s.slug}
                story={s}
                className={cx(
                  "py-5 sm:py-0",
                  // Hairlines between the columns: every column but the first in its row.
                  i % 2 === 1 && "sm:border-l sm:border-line-strong sm:pl-5",
                  i % 2 === 0 && i > 0 && "lg:border-l lg:border-line-strong lg:pl-5",
                  "sm:pr-5 lg:last:pr-0",
                  i >= 2 && "sm:mt-6 sm:border-t sm:border-line-strong sm:pt-6 lg:mt-0 lg:border-t-0 lg:pt-0",
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* Band three: a wide feature, and the briefs. */}
      {(wide || more.length > 0) && (
        <div className="grid grid-cols-1 border-b-[3px] border-ink lg:grid-cols-12">
          {wide && <WideStory story={wide} className="py-6 lg:col-span-8 lg:border-r lg:border-line-strong lg:pr-7" />}
          {more.length > 0 && (
            <div className={cx("border-t border-line-strong py-6 lg:col-span-4 lg:border-t-0 lg:pl-6", !wide && "lg:col-span-12 lg:pl-0")}>
              {/* A single story left over is a column of its own; two or more make the news-in-brief list. */}
              {more.length === 1 ? (
                <ColumnStory story={more[0]} className="h-full" />
              ) : (
                <>
                  <BandLabel>More stories</BandLabel>
                  <ol className="mt-3 divide-y divide-line-strong">
                    {more.map((s, i) => (
                      <Brief key={s.slug} story={s} n={i + 1} />
                    ))}
                  </ol>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Lead({ story, className, note }: { story: Story; className?: string; note?: React.ReactNode }) {
  return (
    <article data-cue={`story:${story.slug}`} className={cx("tile group relative flex flex-col", className)}>
      {note && <div className="mb-3">{note}</div>}
      <div className="flex items-start justify-between gap-3">
        <Kicker story={story} />
        <SaveButton id={saveId(story)} title={story.title} className="relative z-10 -mr-2 -mt-3" />
      </div>
      <Headline story={story} className="mt-1 text-[2.1rem] leading-[1.02] tracking-tight sm:text-[2.6rem] lg:text-[2.85rem]" />
      <StoryVisual {...story.visual} className="mt-5 aspect-[16/9] overflow-hidden rounded-2xl" iconSize="size-12" priority />
      {/* The standfirst, opened with a drop cap. */}
      <p className="mt-4 font-serif text-[1.08rem] leading-relaxed text-ink first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:font-serif first-letter:text-[3.6rem] first-letter:font-bold first-letter:leading-[0.78] first-letter:text-ink">
        {story.dek}
      </p>
      <div className="mt-4">
        <Byline story={story} />
      </div>
    </article>
  );
}

function TextStory({ story }: { story: Story }) {
  return (
    <article data-cue={`story:${story.slug}`} className="tile group relative py-4 first:pt-1">
      <Kicker story={story} />
      <Headline story={story} className="mt-1 text-[1.2rem] leading-snug" />
      <p className="mt-1.5 text-base leading-snug text-ink-muted">{story.dek}</p>
      <div className="mt-2">
        <Byline story={story} withAuthor={false} />
      </div>
    </article>
  );
}

/** The policy notice: boxed in a heavy rule, like a public notice in the paper. */
function PolicyNotice({ story, className, style }: { story: Story; className?: string; style?: React.CSSProperties }) {
  const p = story.policy!;
  return (
    <div data-reveal="column" style={style} className={className}>
      <article data-cue={`section:policy story:${story.slug}`} className="tile group relative border-2 border-ink bg-surface">
        <p className="flex items-center justify-between gap-2 bg-ink px-4 py-1.5 font-mulish text-xs font-extrabold uppercase tracking-[0.18em] text-bg">
          Policy notice
          <Icon name="info" className="size-3.5" />
        </p>
        <StoryVisual {...story.visual} className="aspect-[16/9] border-b-2 border-ink" iconSize="size-8" />
        <div className="flex flex-col gap-2.5 p-4">
          <p className="w-fit border border-ink px-2 py-0.5 font-mulish text-xs font-bold uppercase tracking-[0.1em] text-ink">{policyStatusLabel[p.status]}</p>
          <Headline story={story} className="text-[1.35rem] leading-tight" />
          <p className="text-base leading-snug text-ink-muted">{story.dek}</p>
          {p.effective && <p className="font-mulish text-xs font-bold text-ink">Effective {formatDate(p.effective)}</p>}
          {story.relatedLesson && (
            <Link
              href={`/topics/${story.relatedLesson}`}
              className="relative z-10 inline-flex min-h-10 w-fit items-center gap-1.5 font-semibold text-accent underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              See what changed <Icon name="arrow-right" className="size-4" />
            </Link>
          )}
          <div className="border-t border-line-strong pt-2">
            <Byline story={story} />
          </div>
        </div>
      </article>
    </div>
  );
}

function ColumnStory({ story, className }: { story: Story; className?: string }) {
  return (
    // The column's spacing and hairlines go on its cell, so the card's picture runs edge to edge.
    <div className={cx("flex", className)}>
      <article data-cue={`story:${story.slug}`} className="tile tile-card group relative flex flex-1 flex-col">
        <StoryVisual {...story.visual} className="aspect-[3/2]" iconSize="size-8" />
        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-2">
            <Kicker story={story} />
            <SaveButton id={saveId(story)} title={story.title} className="relative z-10 -mr-2 -mt-2" />
          </div>
          <Headline story={story} className="text-[1.15rem] leading-snug" />
          <p className="mt-1.5 line-clamp-3 text-base leading-snug text-ink-muted">{story.dek}</p>
          <div className="mt-auto pt-3">
            <Byline story={story} withAuthor={false} />
          </div>
        </div>
      </article>
    </div>
  );
}

function WideStory({ story, className }: { story: Story; className?: string }) {
  return (
    <article data-cue={`story:${story.slug}`} className={cx("tile group relative grid gap-5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]", className)}>
      <StoryVisual {...story.visual} className="aspect-[16/10] overflow-hidden rounded-2xl sm:aspect-auto sm:min-h-60" />
      <div className="flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <Kicker story={story} />
          <SaveButton id={saveId(story)} title={story.title} className="relative z-10 -mr-2 -mt-3" />
        </div>
        <Headline story={story} className="mt-1 text-[1.7rem] leading-[1.08] tracking-tight" />
        <p className="mt-3 font-serif text-[1rem] leading-relaxed text-ink">{story.dek}</p>
        <div className="mt-auto pt-4">
          <Byline story={story} />
        </div>
      </div>
    </article>
  );
}

/** A brief: a big serif numeral beside the headline, as in a paper's news-in-brief column. */
function Brief({ story, n }: { story: Story; n: number }) {
  return (
    <li data-cue={`story:${story.slug}`} className="tile group relative flex gap-4 py-3.5 first:pt-1">
      <span aria-hidden className="w-7 shrink-0 font-serif text-3xl font-bold leading-none text-line-strong">
        {n}
      </span>
      <div className="min-w-0">
        <Kicker story={story} />
        <Headline story={story} className="mt-0.5 text-[1.05rem] leading-snug" />
        <div className="mt-1">
          <Byline story={story} withAuthor={false} />
        </div>
      </div>
    </li>
  );
}

/** One section's stories: a ruled grid, three across. */
function SectionPage({ stories }: { stories: Story[] }) {
  if (!stories.length) {
    return <p className="mt-6 border-y border-line-strong py-8 text-center font-serif italic text-ink-muted">No stories in this section yet.</p>;
  }
  return (
    <div data-build-tiles className="grid grid-cols-1 border-b-[3px] border-ink sm:grid-cols-2 lg:grid-cols-3">
      {stories.map((s, i) => (
        <ColumnStory
          key={s.slug}
          story={s}
          className={cx(
            "border-t border-line-strong py-6 first:border-t-0 sm:px-5",
            // Hairlines down the columns, none before the first in each row; the top row has no rule above it.
            "sm:[&:nth-child(2n+1)]:pl-0 sm:[&:nth-child(2n)]:border-l sm:[&:nth-child(-n+2)]:border-t-0",
            "lg:[&:nth-child(2n)]:border-l-0 lg:[&:nth-child(2n+1)]:pl-5 lg:[&:nth-child(3n+1)]:pl-0 lg:[&:nth-child(3n+2)]:border-l lg:[&:nth-child(3n)]:border-l lg:[&:nth-child(-n+3)]:border-t-0",
            i === stories.length - 1 && "lg:pr-0",
          )}
        />
      ))}
    </div>
  );
}
