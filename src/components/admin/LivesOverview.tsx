"use client";

import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { LivesOverview as Overview } from "@/server/livesOverview";
import { Icon, type IconName } from "../Icon";

/*
  "Connect the narrative ecosystem" (docs/lives-in-progress.md): the six parts of Lives in Progress as one flow, at the
  top of Admin → Lives in Progress. Each card has live counts, what needs attention and a way into its tab; a row per
  character shows which parts are set up. Counts only, never what anyone said.
*/

const ICONS: Record<string, IconName> = { bible: "book", calendar: "calendar", moments: "spark", arcs: "timeline", memory: "bookmark", checkin: "chat" };

export function LivesOverview({ onTab }: { onTab: (tab: string) => void }) {
  const { data, error } = useApi<Overview>("/api/admin/lives?overview=1");
  if (error) return null;
  if (!data) return <div className="min-h-40 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" aria-label="Loading the overview" />;
  return (
    <section aria-labelledby="lives-overview" className="flex flex-col gap-4">
      <h2 id="lives-overview" className="font-serif text-2xl font-semibold">
        The narrative ecosystem
      </h2>
      <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.parts.map((p, i) => (
          <li
            key={p.key}
            className={cx(
              "relative",
              // A quiet line joining each part to the next: down on one column, across within a row on wider screens.
              i < data.parts.length - 1 && "after:absolute after:left-8 after:top-full after:h-4 after:w-px after:bg-line-strong sm:after:hidden",
              i % 2 === 0 && "sm:after:block sm:after:left-full sm:after:top-10 sm:after:h-px sm:after:w-4 xl:after:hidden",
              i % 3 !== 2 && i < data.parts.length - 1 && "xl:after:block xl:after:left-full xl:after:top-10 xl:after:h-px xl:after:w-4",
            )}
          >
            <section aria-labelledby={`part-${p.key}`} className="flex h-full flex-col gap-3 rounded-3xl border border-line bg-surface p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-tealtint text-[#007373] dark:text-[#3cb8b9]" aria-hidden>
                  <Icon name={ICONS[p.key]} className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-mulish text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-ink-muted">Part {i + 1} of 6</p>
                  <h3 id={`part-${p.key}`} className="font-serif text-lg font-semibold leading-tight">
                    {p.heading}
                  </h3>
                  <p className="text-sm text-ink-muted">{p.line}</p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2">
                {p.stats.map((s) => (
                  <div key={s.label} className="rounded-xl bg-muted px-2.5 py-1.5">
                    <dt className="text-[0.68rem] font-semibold leading-tight text-ink-muted">{s.label}</dt>
                    <dd className="font-serif text-xl font-semibold">{s.value}</dd>
                  </div>
                ))}
              </dl>
              {p.key === "arcs" && data.due.length > 0 && <p className="text-xs text-ink-muted">Next: {data.due.join(" · ")}</p>}
              {p.attention.length > 0 && (
                <div className="rounded-xl border border-[#fab53d]/70 bg-[#fff8e8] px-3 py-2 text-sm dark:bg-[#2e2612]">
                  <p className="text-xs font-bold uppercase tracking-wide">Needs attention</p>
                  <ul className="mt-1 space-y-0.5">
                    {p.attention.slice(0, 4).map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                    {p.attention.length > 4 && <li className="text-ink-muted">and {p.attention.length - 4} more</li>}
                  </ul>
                </div>
              )}
              <button
                type="button"
                onClick={() => onTab(p.tab)}
                className="mt-auto inline-flex min-h-10 items-center gap-1 self-start text-sm font-semibold text-accent hover:underline"
              >
                Open {p.heading} <span aria-hidden>→</span>
              </button>
            </section>
          </li>
        ))}
      </ol>
      {data.characters.length > 0 && (
        <div className="overflow-x-auto rounded-3xl border border-line bg-surface p-4">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="mb-2 text-left font-semibold">Who has what set up</caption>
            <thead>
              <tr className="text-xs text-ink-muted">
                <th scope="col" className="py-1 font-semibold">
                  Character
                </th>
                {data.parts.map((p) => (
                  <th key={p.key} scope="col" className="py-1 text-center font-semibold">
                    {p.heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.characters.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <th scope="row" className="py-1.5 font-semibold">
                    {c.name}
                  </th>
                  {data.parts.map((p) => {
                    const on = c.parts[p.key];
                    return (
                      <td key={p.key} className="py-1.5 text-center">
                        {on ? (
                          <Icon name="check" className="mx-auto size-4 text-[#1f8a52]" />
                        ) : (
                          <span aria-hidden className="mx-auto block size-2.5 rounded-full border border-line-strong" />
                        )}
                        <span className="sr-only">{on ? "Set up" : "Not set up yet"}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-muted">
            A tick: an approved Bible, an approved routine, a moment shared or scheduled, an active arc, at least one learner’s memories, at least one follower.
          </p>
        </div>
      )}
    </section>
  );
}
