/*
  The banner at the top of the main pages (Community, Topics, Discovery Paths, Play, Resources): brand
  teal with soft circles in the brand colours, a small label, the page title, a line about it, and
  whatever the page wants on the right (usually a few figures at a glance).
*/
export function PageHero({ eyebrow, title, children, aside }: { eyebrow: string; title: string; children?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <header className="relative overflow-hidden rounded-3xl bg-[#008282] px-5 py-6 text-white sm:px-8 sm:py-8">
      <HeroPattern />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#bdeeee]">{eyebrow}</p>
          <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
          {children && <div className="mt-2 text-lg text-white/90">{children}</div>}
        </div>
        {aside}
      </div>
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
