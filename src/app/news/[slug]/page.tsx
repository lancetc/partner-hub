import { Fragment, Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { categoryLabel, stories, storyBySlug, type Story, type StoryBlock } from "@/content/stories";
import { lessonBySlug } from "@/content/lessons";
import { resources } from "@/content/resources";
import { StoryVisual } from "@/components/StoryVisual";
import { SaveButton } from "@/components/SaveButton";
import { StoryTile } from "@/components/StoryTile";
import { Icon } from "@/components/Icon";
import { RichInline, RichText } from "@/components/RichText";
import { formatDate } from "@/lib/format";
import { connection } from "next/server";
import { getDb } from "@/server/db";
import { currentUser, meantFor } from "@/server/auth";
import { canOpenTopic } from "@/server/catalogue";
import { storyPreview } from "@/server/stories";
import { HighlightArea } from "@/components/favourites/HighlightArea";
import { SaveSection } from "@/components/favourites/Highlighter";
import { SavedMarkChips } from "@/components/favourites/SavedMarks";
import { FavouriteBanner } from "@/components/favourites/FavouriteBanner";
import { StoryIntro } from "@/components/news/StoryIntro";
import { MarkStoryRead, WeeklyQuestionCard } from "@/components/news/EditionParts";
import { weeklyQuestion } from "@/server/newsEdition";
import { now } from "@/server/clock";
import { textHash } from "@/lib/magazineNarration";
import { glanceAudioPlayable, GLANCE_MIN } from "@/lib/storyGlance";
import { AtAGlance, PutIntoPractice } from "@/components/news/StoryGlance";
import { StoryVideo } from "@/components/news/StoryVideo";
import { ZoomablePicture } from "@/components/news/ZoomablePicture";
import { practiceTicks } from "@/server/storyGlance";

export function generateStaticParams() {
  return stories.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params, searchParams }: PageProps<"/news/[slug]">): Promise<Metadata> {
  getDb();
  const story = storyBySlug((await params).slug);
  if (!story) return { title: "Story", robots: { index: false } };
  const title = story.seo?.title || story.title;
  const description = story.seo?.description || story.dek;
  const url = `/news/${story.slug}`;
  const image = story.visual.photo
    ? [{ url: story.visual.photo.src, width: story.visual.photo.width, height: story.visual.photo.height, alt: story.visual.alt }]
    : undefined;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      siteName: "Trilogy Care Partner Hub",
      locale: "en_AU",
      publishedTime: story.date,
      ...(story.updated ? { modifiedTime: story.updated } : {}),
      section: categoryLabel(story.category),
      authors: [story.byline],
      ...(image ? { images: image } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image ? { images: [image[0].url] } : {}) },
    // An author's preview of a draft is never indexed.
    ...((await searchParams).preview === "1" ? { robots: { index: false, follow: false } } : {}),
  };
}

/** NewsArticle structured data, so search engines can show the headline, picture and dates. */
function articleData(story: Story) {
  const base = (process.env.HUB_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const url = `${base}/news/${story.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: (story.seo?.title || story.title).slice(0, 110),
    description: story.seo?.description || story.dek,
    ...(story.visual.photo ? { image: [`${base}${story.visual.photo.src}`] } : {}),
    datePublished: story.date,
    dateModified: story.updated ?? story.date,
    articleSection: categoryLabel(story.category),
    author: { "@type": "Organization", name: story.byline || "Trilogy Care" },
    publisher: { "@type": "Organization", name: "Trilogy Care", logo: { "@type": "ImageObject", url: `${base}/brand/trilogy-logo.svg` } },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
}

function Block({ block }: { block: StoryBlock }) {
  switch (block.type) {
    case "p":
      return <RichText text={block.text} />;
    case "image":
      return (
        <figure
          className={
            block.align === "left"
              ? "sm:float-left sm:mb-3 sm:mr-6 sm:w-[45%]"
              : block.align === "right"
                ? "sm:float-right sm:mb-3 sm:ml-6 sm:w-[45%]"
                : block.align === "center"
                  ? "mx-auto max-w-md"
                  : "clear-both"
          }
        >
          {/* No caption: the description is shown under it instead, and not read twice (the figure takes it from the caption). */}
          {block.lightbox ? (
            <ZoomablePicture src={block.src} alt={block.alt} shownAlt={block.caption ? block.alt : ""} width={block.width} height={block.height} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.src}
              alt={block.caption ? block.alt : ""}
              width={block.width}
              height={block.height}
              loading="lazy"
              className="h-auto w-full rounded-2xl"
            />
          )}
          {(block.caption || block.alt) && <figcaption className="mt-2 font-mulish text-sm text-ink-muted">{block.caption || block.alt}</figcaption>}
        </figure>
      );
    case "h3":
      return <h3 className="pt-2 font-serif text-xl font-semibold text-ink">{block.text}</h3>;
    case "h2":
      return <h2 className="pt-4 font-serif text-2xl font-semibold text-ink">{block.text}</h2>;
    case "list":
      return (
        <ul className="flex flex-col gap-2 pl-1">
          {block.items.map((i) => (
            <li key={i} className="flex gap-3">
              <Icon name="check" className="mt-1 size-5 shrink-0 text-accent" />
              <span>
                <RichInline text={i} />
              </span>
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <figure className="my-2 border-l-4 border-gold pl-5">
          <blockquote className="font-serif text-xl italic leading-snug text-ink">{block.text}</blockquote>
          <figcaption className="mt-2 font-mulish text-sm text-ink-muted">{block.cite}</figcaption>
        </figure>
      );
  }
}

export default function StoryPage({ params, searchParams }: PageProps<"/news/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto min-h-[70vh] max-w-7xl px-4 pt-6 sm:px-6" aria-busy="true" />}>
      <StoryArticle params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function StoryArticle({
  params,
  searchParams,
}: {
  params: PageProps<"/news/[slug]">["params"];
  searchParams: PageProps<"/news/[slug]">["searchParams"];
}) {
  const { slug } = await params;
  // Stories can be edited in admin at any time, so read them fresh; authors can preview a draft with ?preview=1.
  await connection();
  const db = getDb();
  const user = await currentUser(db);
  const draft = (await searchParams).preview === "1" ? storyPreview(db, user, slug) : null;
  const story = draft ?? storyBySlug(slug);
  if (!story) notFound();
  // A story tagged for the other audience (a partner spotlight, to a coordinator) isn't theirs by its link either (auth.meantFor).
  if (!draft && !meantFor(user, story.audience)) notFound();

  // The related topic, resources and "more like this" only when they're for this person too.
  const lesson = story.relatedLesson && canOpenTopic(db, user, story.relatedLesson) ? lessonBySlug(story.relatedLesson) : undefined;
  const related = resources.filter((r) => story.relatedResources?.includes(r.id) && meantFor(user, r.audience));
  const more = stories.filter((s) => s.slug !== story.slug && s.category === story.category && meantFor(user, s.audience)).slice(0, 2);
  const p = story.policy;
  const question = draft ? null : weeklyQuestion(db, user, now(db));
  // Highlights (docs/job-aids.md): anchored to the story, the paragraph and this edition. Not in an author's preview.
  const edition = story.updated ?? story.date;
  const firstHeading = story.body.findIndex((b) => b.type === "h2");
  const hasOpening = (firstHeading < 0 ? story.body : story.body.slice(0, firstHeading)).some((b) => b.type === "p" || b.type === "list" || b.type === "quote");
  // The voiced introduction, once an author has approved a recording of this script.
  const n = story.narration;
  const intro = n?.approved && n.audio && n.audio.scriptHash === textHash(n.script.trim()) ? { script: n.script, audio: n.audio } : null;
  // At a glance and Put it into practice (lib/storyGlance), once an author has checked them and turned them on.
  const glance = story.glance?.enabled && story.glance.points.length >= GLANCE_MIN ? story.glance : null;
  const practice = story.practice?.enabled && story.practice.items.length ? story.practice : null;
  const ticked = practice?.checklist && !draft ? practiceTicks(db, user, story.slug) : [];
  // The story's video, where the author placed it; "after the opening" falls to the end in a story with no subheadings.
  const video = story.video;
  const videoAt = !video ? null : video.placement === "opening" && firstHeading < 0 ? "end" : video.placement;
  const videoEl = video ? <StoryVideo video={video} fallbackPoster={story.visual.photo?.src} /> : null;

  return (
    <article className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
      {/* Opening it is reading it: the homepage stops featuring it to this person (server/newsEdition). */}
      {!draft && <MarkStoryRead slug={story.slug} />}
      {/* JSON.stringify output can't close the script tag: "<" is escaped. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleData(story)).replace(/</g, "\\u003c") }} />

      {/*
        The cinematic hero (the owner, Nov 2026): the story's own picture edge to edge across the page's sheet, as on the
        homepage, with the category, headline, standfirst and details on a navy wash at its lower left. On a phone the
        picture sits above the words instead, so nothing is read over a busy photo. A story with no picture shows its
        patterned artwork behind the same words.
      */}
      <header className="hub-hero-bleed relative isolate overflow-hidden bg-[#0b2340] text-white">
        <div className="relative aspect-[16/10] sm:absolute sm:inset-0 sm:aspect-auto">
          <StoryVisual {...story.visual} className="size-full" iconSize="size-16" priority />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0b2340] to-transparent sm:hidden" />
          <span
            aria-hidden
            className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgb(11_35_64/0.94)_0%,rgb(11_35_64/0.78)_36%,rgb(11_35_64/0.3)_68%,rgb(11_35_64/0)_100%)] sm:block"
          />
          <span
            aria-hidden
            className="absolute inset-0 hidden bg-[linear-gradient(0deg,rgb(11_35_64/0.85)_0%,rgb(11_35_64/0.4)_42%,rgb(11_35_64/0)_72%)] sm:block"
          />
        </div>
        <Link
          href="/"
          className="absolute left-4 top-4 z-10 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0b2340]/55 px-4 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-[#0b2340]/80 sm:left-8 sm:top-6 lg:left-12"
        >
          <Icon name="arrow-left" className="size-4" /> All news
        </Link>
        <div className="relative mx-auto flex max-w-7xl flex-col justify-end px-5 pb-7 pt-1 sm:min-h-[29rem] sm:px-8 sm:pb-10 sm:pt-24 lg:min-h-[31rem] lg:px-12 lg:pb-12">
          <div className="max-w-[47rem]">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.16em] text-[#bdeeee]">{categoryLabel(story.category)}</p>
            {/* The save buttons sit beside the headline, on the right (the owner, Nov 2026); the byline, date and reading time are at the end of the story. */}
            <div className="mt-3 flex items-start gap-4">
              <h1 className="min-w-0 flex-1 text-balance font-serif text-[2.1rem] font-semibold leading-[1.08] tracking-tight [text-shadow:0_2px_18px_rgb(0_0_0/0.3)] sm:text-5xl lg:text-[3.4rem] lg:leading-[1.04]">
                {story.title}
              </h1>
              <div className="flex shrink-0 items-center gap-2 pt-1 sm:pt-2">
                {/* Save the opening without selecting anything; each subheading has its own. */}
                {!draft && hasOpening && (
                  <span className="print:hidden">
                    <SaveSection source="news" id={story.slug} revisionId={edition} sectionId="s0" label="Save the opening" onColour />
                  </span>
                )}
                <SaveButton id={`story:${story.slug}`} title={story.title} withLabel onDark />
              </div>
            </div>
            <p className="mt-4 text-lg text-white/85 [text-shadow:0_1px_10px_rgb(0_0_0/0.35)] sm:text-xl">{story.dek}</p>
            {/* The voiced introduction plays on the picture, as a Magazine course's does on its cover. */}
            {intro && <StoryIntro script={intro.script} audio={intro.audio} className="mt-6" />}
          </div>
        </div>
      </header>

      <div className="mx-auto mt-8 max-w-5xl empty:hidden">
        {draft && (
          <p className="rounded-2xl border-2 border-dashed border-gold px-3 py-2 text-sm">
            <strong>Author preview.</strong> This is the saved version from the News editor. Learners see it only once it’s published.
          </p>
        )}
        {/* Opened from Favourites: the saved passage, where it stands against this edition, and the way back. */}
        {!draft && <FavouriteBanner />}
      </div>

      <div className="mx-auto mt-10 grid max-w-5xl gap-10 sm:mt-12 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          {/* The takeaways, under the hero and before the story (the owner, Nov 2026). */}
          {glance && <AtAGlance points={glance.points} audio={glanceAudioPlayable(glance) ? glance.audio : null} className="mb-9" />}
          {videoAt === "top" && <div className="mb-9">{videoEl}</div>}
          {/* flow-root, not flex: pictures set to the left or right let the text wrap around them. */}
          <HighlightArea
            source="news"
            id={story.slug}
            revisionId={edition}
            off={Boolean(draft)}
            className="flow-root text-lg leading-relaxed text-ink [&>*+*]:mt-5"
          >
            {/* A correction still shows; the status box and the reminder about acknowledgements went (the owner, Nov 2026). */}
            {p?.correction && <p className="text-base font-semibold text-danger">Correction: {p.correction}</p>}
            {/* Each part of the story is a place a passage can be highlighted, and found again (#hl-p3 from Favourites). */}
            {story.body.map((b, i) => (
              <Fragment key={i}>
                {videoAt === "opening" && i === firstHeading && <div className="!mt-9 mb-9">{videoEl}</div>}
                <div data-hl={`p${i}`} id={`hl-p${i}`} className="scroll-mt-24">
                  {b.type === "h2" && !draft ? (
                    <div className="flex items-end justify-between gap-3">
                      <Block block={b} />
                      <span className="print:hidden">
                        <SaveSection source="news" id={story.slug} revisionId={edition} sectionId={`s${i}`} />
                      </span>
                    </div>
                  ) : (
                    <Block block={b} />
                  )}
                </div>
                <SavedMarkChips blockId={`p${i}`} />
              </Fragment>
            ))}
          </HighlightArea>
          {videoAt === "end" && <div className="mt-10">{videoEl}</div>}
          {practice && (
            <PutIntoPractice
              slug={story.slug}
              items={practice.items}
              checklist={practice.checklist}
              initialTicked={ticked}
              policy={story.category === "policy"}
              preview={Boolean(draft)}
              className="mt-12"
            />
          )}
          {/* Who wrote it, when, and how long it takes: at the end of the story. */}
          <p className="mt-10 border-t border-line pt-4 font-mulish text-sm text-ink-muted">
            {story.byline} · <time dateTime={story.date}>{formatDate(story.date)}</time> · {story.readMinutes} min read
          </p>
        </div>

        <aside className="flex flex-col gap-5">
          {lesson && (
            <div className="overflow-hidden rounded-3xl bg-tealtint">
              {/* The topic's own poster, as on its Topics tile (the owner, Nov 2026). */}
              <StoryVisual {...lesson.visual} alt="" className="aspect-[16/10]" iconSize="size-10" />
              <div className="p-5">
                <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
                  {lesson.track === "briefing" ? "Short briefing" : "Related topic"}
                </p>
                <p className="mt-2 font-serif text-xl font-semibold leading-snug">{lesson.title}</p>
                <p className="mt-1 text-base text-ink-muted">{lesson.summary}</p>
                <Link
                  href={`/topics/${lesson.slug}`}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
                >
                  {lesson.track === "briefing" ? "See what changed" : "Start topic"} · {lesson.minutes} min
                </Link>
              </div>
            </div>
          )}

          {/* The weekly question, with how peers answered once you have (server/newsEdition), in place of the policy source details (the owner, Nov 2026). */}
          {question && <WeeklyQuestionCard initial={question} />}

          {related.length > 0 && (
            <div className="rounded-3xl border border-line p-5">
              <h2 className="mb-2 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Related resources</h2>
              <ul>
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/resources#${r.id}`} className="flex min-h-11 items-center gap-2 font-medium hover:text-accent">
                      <Icon name="file" className="size-4 shrink-0 text-accent" /> {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {more.length > 0 && (
        <section className="mx-auto mt-16 max-w-5xl">
          <h2 className="mb-6 font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">More in {categoryLabel(story.category)}</h2>
          <div className="grid gap-8 sm:grid-cols-2">
            {more.map((s) => (
              <StoryTile key={s.slug} story={s} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
