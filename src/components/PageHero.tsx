import Image from "next/image";
import Link from "next/link";
import { Icon } from "./Icon";

/*
  The banner at the top of the main pages (Community, Topics, Discovery Paths, Play, Resources): brand
  teal with soft circles in the brand colours, a small label, the page title, a line about it, and
  whatever the page wants on the right (usually a few figures at a glance).

  With a picture it's set like the homepage's cover instead: the picture fills the page's sheet side to side
  and up to its rounded top (globals.css, .hub-hero-bleed), with a dark tint from the left and the top so the
  words always read. The banner keeps the height its words give it. A page reached from another (Challenges,
  from Resources) can put its way back at the top of the banner.
*/
export type HeroImage = {
  src: string;
  width: number;
  height: number;
  /** Which part of the picture shows, as CSS object-position ("50% 35%"). Centred if left out. */
  position?: string;
  /** Make the banner at least this tall (in pixels) on larger screens, to show more of the picture under the words. */
  minHeight?: number;
};

export function PageHero({
  eyebrow,
  title,
  children,
  aside,
  image,
  back,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  aside?: React.ReactNode;
  image?: HeroImage;
  /** A way back to the page this one sits under, shown above the label. */
  back?: { href: string; label: string };
}) {
  const backLink = back && (
    <Link
      href={back.href}
      className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 font-semibold text-white/90 hover:text-white hover:underline"
    >
      <Icon name="arrow-left" className="size-4" /> {back.label}
    </Link>
  );
  const eyebrowLine = <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#bdeeee]">{eyebrow}</p>;
  const words = (
    <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl">
        {eyebrowLine}
        <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
        {children && <div className="mt-2 text-lg text-white/90">{children}</div>}
      </div>
      {aside}
    </div>
  );
  if (image)
    return (
      <header
        className="hub-hero-bleed relative isolate overflow-hidden bg-[#1d3b4f] text-white sm:min-h-[var(--hero-min-h)]"
        style={image.minHeight ? ({ "--hero-min-h": `${image.minHeight}px` } as React.CSSProperties) : undefined}
      >
        <Image
          src={image.src}
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover"
          style={image.position ? { objectPosition: image.position } : undefined}
        />
        {/* The tint: darkest behind the words at the top left, clear over the people. */}
        <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#06223a]/85 via-[#06223a]/45 to-[#06223a]/5" />
        <span aria-hidden className="absolute inset-x-0 top-0 -z-10 h-2/3 bg-gradient-to-b from-[#06223a]/45 to-transparent" />
        {/* The figures sit under the title, on the left, so they never cover the people. */}
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-9 lg:py-10">
          {backLink}
          {eyebrowLine}
          <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight [text-shadow:0_2px_18px_rgb(0_0_0/0.35)] sm:text-5xl">{title}</h1>
          {aside && <div className="mt-3 max-w-3xl [text-shadow:0_1px_10px_rgb(0_0_0/0.4)]">{aside}</div>}
          {children && <div className="mt-3 max-w-2xl text-lg text-white/90 [text-shadow:0_1px_10px_rgb(0_0_0/0.4)]">{children}</div>}
        </div>
      </header>
    );
  return (
    <header className="relative overflow-hidden rounded-3xl bg-[#008282] px-5 py-6 text-white sm:px-8 sm:py-8">
      <HeroPattern />
      {backLink}
      {words}
    </header>
  );
}

/** A few figures at a glance, for the right of the banner. */
export function HeroStats({ stats }: { stats: { label: string; value: string | number; dot?: boolean }[] }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-3 font-mulish">
      {stats.map((s) => (
        <div key={s.label}>
          <dt className="sr-only">{s.label}</dt>
          <dd className="flex items-center gap-1.5 text-2xl font-extrabold tabular-nums">
            {s.dot && <span className="size-2.5 rounded-full bg-[#7ef0a6]" aria-hidden />}
            {typeof s.value === "number" ? s.value.toLocaleString("en-AU") : s.value}
          </dd>
          <dd className="text-sm text-white/80" aria-hidden>
            {s.label}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Soft circles in the brand colours behind the heading. */
function HeroPattern() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="xMaxYMid slice" viewBox="0 0 800 240">
      <circle cx="720" cy="40" r="120" fill="#3cb8b9" opacity="0.35" />
      <circle cx="610" cy="230" r="80" fill="#fab53d" opacity="0.25" />
      <circle cx="790" cy="210" r="46" fill="#c7393e" opacity="0.3" />
    </svg>
  );
}
