import Link from "next/link";
import { categoryLabel, policyStatusLabel, type Story } from "@/content/stories";
import { StoryVisual } from "./StoryVisual";
import { SaveButton } from "./SaveButton";
import { Icon } from "./Icon";
import { cx, formatDate } from "@/lib/format";

export type TileSize = "lead" | "policy" | "standard" | "wide" | "compact" | "text";

function Meta({ story, onDark }: { story: Story; onDark?: boolean }) {
  return (
    <p className={cx("font-mulish text-sm", onDark ? "text-on-hero/80" : "text-ink-muted")}>
      <span>{story.byline}</span>
      <span aria-hidden> · </span>
      <time dateTime={story.date}>{formatDate(story.date)}</time>
      <span aria-hidden> · </span>
      <span>{story.readMinutes} min read</span>
    </p>
  );
}

function Category({ story, onDark }: { story: Story; onDark?: boolean }) {
  return (
    <p
      className={cx(
        "font-mulish text-xs font-extrabold uppercase tracking-[0.12em]",
        onDark ? "text-teal-bright" : story.category === "policy" || story.category === "case-study" ? "text-warm" : "text-accent",
      )}
    >
      {categoryLabel(story.category)}
    </p>
  );
}

export function StoryTile({ story, size = "standard", className }: { story: Story; size?: TileSize; className?: string }) {
  const href = `/news/${story.slug}`;
  const saveId = `story:${story.slug}`;

  if (size === "policy" && story.policy) {
    return (
      <article className={cx("relative flex flex-col overflow-hidden rounded-3xl bg-hero text-on-hero", className)}>
        <StoryVisual {...story.visual} className="h-32 shrink-0 sm:h-40 lg:h-28" />
        <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <Category story={story} onDark />
            <SaveButton id={saveId} title={story.title} onDark className="-mr-2 -mt-3" />
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 font-mulish text-xs font-bold">
            <Icon name="info" className="size-4" /> {policyStatusLabel[story.policy.status]}
          </span>
          <h3 className="font-serif text-2xl font-semibold leading-tight">
            <Link href={href} className="after:absolute after:inset-0 after:content-['']">
              {story.title}
            </Link>
          </h3>
          <p className="text-on-hero/85">{story.dek}</p>
          {story.policy.effective && (
            <p className="font-mulish text-sm text-on-hero/80">Effective {formatDate(story.policy.effective)}</p>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
            {story.relatedLesson && (
              <Link
                href={`/learning/${story.relatedLesson}`}
                className="relative z-10 inline-flex min-h-11 items-center gap-2 rounded-full bg-teal-bright px-5 font-semibold text-navy hover:bg-white"
              >
                See what changed <Icon name="arrow-right" className="size-4" />
              </Link>
            )}
          </div>
          <Meta story={story} onDark />
        </div>
      </article>
    );
  }

  if (size === "lead") {
    return (
      <article className={cx("group relative flex flex-col", className)}>
        <StoryVisual {...story.visual} className="aspect-[16/9] rounded-3xl" iconSize="size-12" priority />
        <div className="flex flex-col gap-3 pt-5">
          <div className="flex items-start justify-between gap-3">
            <Category story={story} />
            <SaveButton id={saveId} title={story.title} className="-mr-2 -mt-3" />
          </div>
          <h3 className="font-serif text-3xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-4xl lg:text-[2.35rem]">
            <Link href={href} className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4">
              {story.title}
            </Link>
          </h3>
          <p className="max-w-2xl text-lg leading-snug text-ink-muted">{story.dek}</p>
          <Meta story={story} />
        </div>
      </article>
    );
  }

  if (size === "wide") {
    return (
      <article className={cx("group relative grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]", className)}>
        <StoryVisual {...story.visual} className="aspect-[16/10] rounded-2xl sm:aspect-auto sm:min-h-52" />
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3">
            <Category story={story} />
            <SaveButton id={saveId} title={story.title} className="-mr-2 -mt-3" />
          </div>
          <h3 className="font-serif text-2xl font-semibold leading-tight text-ink">
            <Link href={href} className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4">
              {story.title}
            </Link>
          </h3>
          <p className="text-ink-muted">{story.dek}</p>
          <div className="mt-auto">
            <Meta story={story} />
          </div>
        </div>
      </article>
    );
  }

  if (size === "text") {
    return (
      <article className={cx("group relative flex flex-col gap-1.5 border-t border-line pt-4", className)}>
        <div className="flex items-start justify-between gap-2">
          <Category story={story} />
          <SaveButton id={saveId} title={story.title} className="-mr-2 -mt-3" />
        </div>
        <h3 className="-mt-3 font-serif text-[1.3rem] font-semibold leading-snug text-ink">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4">
            {story.title}
          </Link>
        </h3>
        <p className="text-[0.95rem] leading-snug text-ink-muted">{story.dek}</p>
        <p className="font-mulish text-sm text-ink-muted">
          <time dateTime={story.date}>{formatDate(story.date)}</time> · {story.readMinutes} min read
        </p>
      </article>
    );
  }

  if (size === "compact") {
    return (
      <article className={cx("group relative flex gap-4 border-t border-line pt-4", className)}>
        <StoryVisual {...story.visual} className="size-20 shrink-0 rounded-xl" iconSize="size-5" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Category story={story} />
          <h3 className="font-serif text-lg font-semibold leading-snug text-ink">
            <Link href={href} className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4">
              {story.title}
            </Link>
          </h3>
          <p className="font-mulish text-sm text-ink-muted">
            <time dateTime={story.date}>{formatDate(story.date)}</time> · {story.readMinutes} min read
          </p>
        </div>
        <SaveButton id={saveId} title={story.title} className="-mr-2 -mt-2 self-start" />
      </article>
    );
  }

  return (
    <article className={cx("group relative flex flex-col gap-3", className)}>
      <StoryVisual {...story.visual} className="aspect-[16/10] rounded-2xl" />
      <div className="flex items-start justify-between gap-3 pt-1">
        <Category story={story} />
        <SaveButton id={saveId} title={story.title} className="-mr-2 -mt-3" />
      </div>
      <h3 className="font-serif text-xl font-semibold leading-snug text-ink">
        <Link href={href} className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4">
          {story.title}
        </Link>
      </h3>
      <Meta story={story} />
    </article>
  );
}
