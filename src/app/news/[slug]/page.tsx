import { Fragment, Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { categoryLabel, policyStatusLabel, stories, storyBySlug, type Story, type StoryBlock } from "@/content/stories";
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.src} alt={block.alt} width={block.width} height={block.height} loading="lazy" className="h-auto w-full rounded-2xl" />
          {block.caption && <figcaption className="mt-2 font-mulish text-sm text-ink-muted">{block.caption}</figcaption>}
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
  // Highlights (docs/job-aids.md): anchored to the story, the paragraph and this edition. Not in an author's preview.
  const edition = story.updated ?? story.date;
  const firstHeading = story.body.findIndex((b) => b.type === "h2");
  const hasOpening = (firstHeading < 0 ? story.body : story.body.slice(0, firstHeading)).some((b) => b.type === "p" || b.type === "list" || b.type === "quote");

  return (
    <article className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
      {/* JSON.stringify output can't close the script tag: "<" is escaped. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleData(story)).replace(/</g, "\\u003c") }} />
      {draft && (
        <p className="mb-3 rounded-2xl border-2 border-dashed border-gold px-3 py-2 text-sm">
          <strong>Author preview.</strong> This is the saved version from the News editor. Learners see it only once it’s published.
        </p>
      )}
      <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink-muted hover:text-ink">
        <Icon name="arrow-left" className="size-4" /> All news
      </Link>

      <div className="mx-auto mt-4 max-w-3xl">
        {/* Opened from Favourites: the saved passage, where it stands against this edition, and the way back. */}
        {!draft && <FavouriteBanner className="mb-6" />}
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{categoryLabel(story.category)}</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">{story.title}</h1>
        <p className="mt-4 text-xl text-ink-muted">{story.dek}</p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
          <p className="font-mulish text-sm text-ink-muted">
            {story.byline} · <time dateTime={story.date}>{formatDate(story.date)}</time> · {story.readMinutes} min read
          </p>
          <div className="flex items-center gap-2">
            {/* Save the opening without selecting anything; each subheading has its own. */}
            {!draft && hasOpening && (
              <span className="print:hidden">
                <SaveSection source="news" id={story.slug} revisionId={edition} sectionId="s0" label="Save the opening" />
              </span>
            )}
            <SaveButton id={`story:${story.slug}`} title={story.title} withLabel />
          </div>
        </div>
      </div>

      <StoryVisual {...story.visual} className="mx-auto mt-8 aspect-[21/9] max-w-5xl rounded-3xl" iconSize="size-14" priority />

      <div className="mx-auto mt-10 grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* flow-root, not flex: pictures set to the left or right let the text wrap around them. */}
        <HighlightArea
          source="news"
          id={story.slug}
          revisionId={edition}
          off={Boolean(draft)}
          className="flow-root text-lg leading-relaxed text-ink [&>*+*]:mt-5"
        >
          {p && (
            <div className="rounded-2xl border border-line bg-muted p-5 text-base">
              <p className="flex items-center gap-2 font-semibold">
                <Icon name="info" className="size-5 text-accent" /> {policyStatusLabel[p.status]}
              </p>
              {p.correction && <p className="mt-2 text-danger">Correction: {p.correction}</p>}
              <p className="mt-2 text-ink-muted">Reading this update is not an acknowledgement. If a briefing is assigned, complete it separately.</p>
            </div>
          )}
          {/* Each part of the story is a place a passage can be highlighted, and found again (#hl-p3 from Favourites). */}
          {story.body.map((b, i) => (
            <Fragment key={i}>
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

        <aside className="flex flex-col gap-5">
          {lesson && (
            <div className="rounded-3xl bg-tealtint p-5">
              <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
                {lesson.track === "briefing" ? "Short briefing" : "Related topic"}
              </p>
              <p className="mt-2 font-serif text-xl font-semibold leading-snug">{lesson.title}</p>
              <p className="mt-1 text-[0.95rem] text-ink-muted">{lesson.summary}</p>
              <Link
                href={`/topics/${lesson.slug}`}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
              >
                {lesson.track === "briefing" ? "See what changed" : "Start topic"} · {lesson.minutes} min
              </Link>
            </div>
          )}

          {p && (
            <dl className="rounded-3xl border border-line p-5 text-[0.95rem]">
              <h2 className="mb-3 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Source details</h2>
              {[
                ["Issued by", p.issuer],
                ["Published", formatDate(p.published)],
                ["Effective", p.effective ? formatDate(p.effective) : "Not set"],
                ["Applies to", p.jurisdiction ?? "Not specified"],
                ["Content owner", p.owner],
                ["Next review", formatDate(p.reviewDate)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-t border-line py-2 first-of-type:border-t-0">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
              <a
                href={p.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-accent underline underline-offset-4"
              >
                {p.sourceTitle} <Icon name="external" className="size-4 shrink-0" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </dl>
          )}

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
